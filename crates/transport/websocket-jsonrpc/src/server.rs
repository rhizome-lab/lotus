//! WebSocket server implementation.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{RwLock, broadcast, mpsc};
use tokio_tungstenite::tungstenite::Message;
use tracing::{error, info, warn};

use crate::session::{Session, SessionId};
use viwo_runtime::ViwoRuntime;

/// Server configuration.
#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub db_path: String,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".to_string(),
            port: 8080,
            db_path: "world.sqlite".to_string(),
        }
    }
}

/// The Viwo WebSocket server.
pub struct Server {
    config: ServerConfig,
    runtime: Arc<ViwoRuntime>,
    sessions: Arc<RwLock<HashMap<SessionId, Session>>>,
    broadcast_tx: broadcast::Sender<String>,
}

impl Server {
    /// Create a new server with the given runtime and configuration.
    pub fn new(runtime: Arc<ViwoRuntime>, config: ServerConfig) -> Self {
        let (broadcast_tx, _) = broadcast::channel(256);

        Self {
            config,
            runtime,
            sessions: Arc::new(RwLock::new(HashMap::new())),
            broadcast_tx,
        }
    }

    /// Get the runtime.
    pub fn runtime(&self) -> &Arc<ViwoRuntime> {
        &self.runtime
    }

    /// Run the server, accepting connections until shutdown.
    pub async fn run(&self) -> Result<(), Box<dyn std::error::Error>> {
        let addr = format!("{}:{}", self.config.host, self.config.port);
        let listener = TcpListener::bind(&addr).await?;
        info!("Listening on ws://{}", addr);

        // Start the scheduler in a background task
        let scheduler = Arc::clone(self.runtime.scheduler());
        let runtime_for_scheduler = Arc::clone(&self.runtime);
        let broadcast_for_scheduler = self.broadcast_tx.clone();

        tokio::spawn(async move {
            scheduler
                .run(move |task| {
                    let runtime = Arc::clone(&runtime_for_scheduler);
                    let broadcast_tx = broadcast_for_scheduler.clone();
                    async move {
                        info!(
                            "Scheduler executing task {}: {}({}) on entity {}",
                            task.id, task.verb, task.args, task.entity_id
                        );

                        // Parse args as array
                        let args = match task.args.as_array() {
                            Some(arr) => arr.clone(),
                            None => vec![task.args.clone()],
                        };

                        // Execute the verb
                        match runtime.execute_verb(task.entity_id, &task.verb, args, None) {
                            Ok(result) => {
                                // Optionally broadcast the result
                                if !result.is_null() {
                                    let notification = serde_json::json!({
                                        "jsonrpc": "2.0",
                                        "method": "task_completed",
                                        "params": {
                                            "task_id": task.id,
                                            "entity_id": task.entity_id,
                                            "verb": task.verb,
                                            "result": result
                                        }
                                    });
                                    let _ = broadcast_tx.send(notification.to_string());
                                }
                                Ok(())
                            }
                            Err(err) => Err(format!("{}", err)),
                        }
                    }
                })
                .await;
        });

        while let Ok((stream, addr)) = listener.accept().await {
            let runtime = Arc::clone(&self.runtime);
            let sessions = Arc::clone(&self.sessions);
            let broadcast_tx = self.broadcast_tx.clone();

            tokio::spawn(async move {
                if let Err(err) =
                    handle_connection(stream, addr, runtime, sessions, broadcast_tx).await
                {
                    error!("Connection error from {}: {}", addr, err);
                }
            });
        }

        Ok(())
    }
}

/// Handle a single WebSocket connection.
async fn handle_connection(
    stream: TcpStream,
    addr: SocketAddr,
    runtime: Arc<ViwoRuntime>,
    sessions: Arc<RwLock<HashMap<SessionId, Session>>>,
    broadcast_tx: broadcast::Sender<String>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let ws_stream = tokio_tungstenite::accept_async(stream).await?;
    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    info!("New connection from {}", addr);

    // Create session
    let session_id = SessionId::new();
    let session = Session::new(session_id, addr);

    {
        let mut sessions = sessions.write().await;
        sessions.insert(session_id, session);
    }

    // Subscribe to broadcasts
    let mut broadcast_rx = broadcast_tx.subscribe();

    // Create channel for sending messages to this client
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    // Spawn task to forward messages to WebSocket
    let sender_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                Some(msg) = rx.recv() => {
                    if let Err(err) = ws_sender.send(Message::Text(msg.into())).await {
                        error!("Failed to send message: {}", err);
                        break;
                    }
                }
                Ok(msg) = broadcast_rx.recv() => {
                    if let Err(err) = ws_sender.send(Message::Text(msg.into())).await {
                        error!("Failed to send broadcast: {}", err);
                        break;
                    }
                }
                else => break,
            }
        }
    });

    // Handle incoming messages
    while let Some(msg) = ws_receiver.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                match handle_message(
                    text.as_ref(),
                    session_id,
                    &sessions,
                    &runtime,
                    &tx,
                    &broadcast_tx,
                )
                .await
                {
                    Ok(()) => {}
                    Err(err) => {
                        warn!("Error handling message from {}: {}", addr, err);
                        let error_response = serde_json::json!({
                            "jsonrpc": "2.0",
                            "error": {
                                "code": -32000,
                                "message": err.to_string()
                            },
                            "id": null
                        });
                        let _ = tx.send(error_response.to_string());
                    }
                }
            }
            Ok(Message::Close(_)) => {
                info!("Client {} disconnected", addr);
                break;
            }
            Ok(Message::Ping(data)) => {
                // Pong is sent automatically by tungstenite
                let _ = data;
            }
            Ok(_) => {} // Ignore other message types
            Err(err) => {
                error!("WebSocket error from {}: {}", addr, err);
                break;
            }
        }
    }

    // Cleanup
    sender_task.abort();
    {
        let mut sessions = sessions.write().await;
        sessions.remove(&session_id);
    }
    info!("Connection closed: {}", addr);

    Ok(())
}

/// Handle a JSON-RPC message.
async fn handle_message(
    text: &str,
    session_id: SessionId,
    sessions: &Arc<RwLock<HashMap<SessionId, Session>>>,
    runtime: &Arc<ViwoRuntime>,
    tx: &mpsc::UnboundedSender<String>,
    broadcast_tx: &broadcast::Sender<String>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let request: serde_json::Value = serde_json::from_str(text)?;

    // Extract JSON-RPC fields
    let method = request
        .get("method")
        .and_then(|m| m.as_str())
        .ok_or("Missing method")?;
    let params = request.get("params");
    let id = request.get("id");

    // Route to handler
    let result: Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> = match method {
        "ping" => Ok(serde_json::json!("pong")),

        "login" => {
            let entity_id = params
                .and_then(|p| p.get("entityId"))
                .and_then(|id| id.as_i64())
                .ok_or("Missing entityId")?;

            // Verify entity exists
            let storage = runtime.storage().lock().unwrap();
            match storage.get_entity(entity_id) {
                Ok(Some(entity)) => {
                    // Get room from entity props (location field)
                    let room_id = entity.get("location").and_then(|l| l.as_i64()).unwrap_or(0);

                    drop(storage);

                    // Update session with player info
                    {
                        let mut sessions = sessions.write().await;
                        if let Some(session) = sessions.get_mut(&session_id) {
                            session.login(entity_id, room_id);
                        }
                    }

                    info!("Client logged in as Entity {}", entity_id);

                    // Send player_id notification
                    let notification = serde_json::json!({
                        "jsonrpc": "2.0",
                        "method": "player_id",
                        "params": { "playerId": entity_id }
                    });
                    let _ = tx.send(notification.to_string());

                    Ok(serde_json::json!({ "playerId": entity_id, "status": "ok" }))
                }
                Ok(None) => Err("Entity not found".into()),
                Err(err) => Err(err.to_string().into()),
            }
        }

        "execute" => {
            // Get player from session
            let player_id = {
                let sessions = sessions.read().await;
                sessions.get(&session_id).and_then(|s| s.player_id)
            };

            let player_id = match player_id {
                Some(id) => id,
                None => return Err("Not logged in".into()),
            };

            // Parse command and args
            let cmd_params = params
                .and_then(|p| p.as_array())
                .ok_or("Invalid params: expected array")?;

            if cmd_params.is_empty() {
                return Err("Invalid params: command required".into());
            }

            let command = cmd_params[0]
                .as_str()
                .ok_or("Invalid command: expected string")?;
            let args: Vec<serde_json::Value> = cmd_params[1..].to_vec();

            // For now, call the verb directly on the player entity
            // TODO: Implement verb discovery via System.get_available_verbs
            match runtime.execute_verb(player_id, command, args, Some(player_id)) {
                Ok(result) => Ok(serde_json::json!({ "status": "ok", "result": result })),
                Err(err) => Err(format!("Verb execution failed: {}", err).into()),
            }
        }

        "broadcast" => {
            // Broadcast a message to all connected clients
            let message = params
                .and_then(|p| p.get("message"))
                .ok_or("Missing message")?;

            let notification = serde_json::json!({
                "jsonrpc": "2.0",
                "method": "broadcast",
                "params": message
            });

            let _ = broadcast_tx.send(notification.to_string());
            Ok(serde_json::json!({ "status": "ok" }))
        }

        "schedule" => {
            let entity_id = params
                .and_then(|p| p.get("entityId"))
                .and_then(|id| id.as_i64())
                .ok_or("Missing entityId")?;
            let verb = params
                .and_then(|p| p.get("verb"))
                .and_then(|v| v.as_str())
                .ok_or("Missing verb")?;
            let args = params
                .and_then(|p| p.get("args"))
                .cloned()
                .unwrap_or(serde_json::json!([]));
            let delay_ms = params
                .and_then(|p| p.get("delayMs"))
                .and_then(|d| d.as_u64())
                .unwrap_or(0);

            let scheduler = runtime.scheduler();
            match scheduler.schedule(entity_id, verb, args, delay_ms).await {
                Ok(task_id) => Ok(serde_json::json!({ "taskId": task_id, "status": "ok" })),
                Err(err) => Err(format!("Schedule failed: {}", err).into()),
            }
        }

        "get_entity" => {
            let entity_id = params
                .and_then(|p| p.get("id"))
                .and_then(|id| id.as_i64())
                .ok_or("Missing entity id")?;

            let storage = runtime.storage().lock().unwrap();
            match storage.get_entity(entity_id) {
                Ok(Some(entity)) => Ok(serde_json::to_value(&entity)?),
                Ok(None) => Err("Entity not found".into()),
                Err(err) => Err(err.to_string().into()),
            }
        }

        "get_entities" => {
            let ids = params
                .and_then(|p| p.get("ids"))
                .and_then(|ids| ids.as_array())
                .ok_or("Missing ids array")?;

            let entity_ids: Vec<i64> = ids.iter().filter_map(|id| id.as_i64()).collect();

            let storage = runtime.storage().lock().unwrap();
            let mut entities = Vec::new();
            for id in entity_ids {
                if let Ok(Some(entity)) = storage.get_entity(id) {
                    entities.push(serde_json::to_value(&entity)?);
                }
            }
            Ok(serde_json::json!({ "entities": entities }))
        }

        "create_entity" => {
            let props = params
                .and_then(|p| p.get("props"))
                .cloned()
                .unwrap_or(serde_json::json!({}));
            let prototype_id = params
                .and_then(|p| p.get("prototype_id"))
                .and_then(|id| id.as_i64());

            let storage = runtime.storage().lock().unwrap();
            match storage.create_entity(props, prototype_id) {
                Ok(id) => Ok(serde_json::json!({ "id": id })),
                Err(err) => Err(err.to_string().into()),
            }
        }

        "update_entity" => {
            let entity_id = params
                .and_then(|p| p.get("id"))
                .and_then(|id| id.as_i64())
                .ok_or("Missing entity id")?;
            let props = params
                .and_then(|p| p.get("props"))
                .cloned()
                .ok_or("Missing props")?;

            let storage = runtime.storage().lock().unwrap();
            match storage.update_entity(entity_id, props) {
                Ok(()) => Ok(serde_json::json!({ "status": "ok" })),
                Err(err) => Err(err.to_string().into()),
            }
        }

        "delete_entity" => {
            let entity_id = params
                .and_then(|p| p.get("id"))
                .and_then(|id| id.as_i64())
                .ok_or("Missing entity id")?;

            let storage = runtime.storage().lock().unwrap();
            match storage.delete_entity(entity_id) {
                Ok(()) => Ok(serde_json::json!({ "status": "ok" })),
                Err(err) => Err(err.to_string().into()),
            }
        }

        "call_verb" => {
            let entity_id = params
                .and_then(|p| p.get("entity_id"))
                .and_then(|id| id.as_i64())
                .ok_or("Missing entity_id")?;
            let verb_name = params
                .and_then(|p| p.get("verb"))
                .and_then(|v| v.as_str())
                .ok_or("Missing verb name")?;
            let args = params
                .and_then(|p| p.get("args"))
                .and_then(|a| a.as_array())
                .cloned()
                .unwrap_or_default();
            let caller_id = params
                .and_then(|p| p.get("caller_id"))
                .and_then(|id| id.as_i64());

            match runtime.execute_verb(entity_id, verb_name, args.clone(), caller_id) {
                Ok(result) => Ok(result),
                Err(err) => Err(err.to_string().into()),
            }
        }

        "get_verb" => {
            let entity_id = params
                .and_then(|p| p.get("entityId"))
                .and_then(|id| id.as_i64())
                .ok_or("Missing entityId")?;
            let name = params
                .and_then(|p| p.get("name"))
                .and_then(|n| n.as_str())
                .ok_or("Missing name")?;

            let storage = runtime.storage().lock().unwrap();
            match storage.get_verb(entity_id, name) {
                Ok(Some(verb)) => {
                    // Return the verb code as JSON (S-expression)
                    Ok(serde_json::json!({
                        "id": verb.id,
                        "name": verb.name,
                        "code": verb.code,
                        "source": verb.source
                    }))
                }
                Ok(None) => Err("Verb not found".into()),
                Err(err) => Err(err.to_string().into()),
            }
        }

        "get_verbs" => {
            let entity_id = params
                .and_then(|p| p.get("entityId"))
                .and_then(|id| id.as_i64())
                .ok_or("Missing entityId")?;

            let storage = runtime.storage().lock().unwrap();
            match storage.get_verbs(entity_id) {
                Ok(verbs) => {
                    let verb_list: Vec<_> = verbs
                        .iter()
                        .map(|v| {
                            serde_json::json!({
                                "id": v.id,
                                "name": v.name,
                                "source": v.source
                            })
                        })
                        .collect();
                    Ok(serde_json::json!({ "verbs": verb_list }))
                }
                Err(err) => Err(err.to_string().into()),
            }
        }

        "add_verb" => {
            let entity_id = params
                .and_then(|p| p.get("entityId"))
                .and_then(|id| id.as_i64())
                .ok_or("Missing entityId")?;
            let name = params
                .and_then(|p| p.get("name"))
                .and_then(|n| n.as_str())
                .ok_or("Missing name")?;
            let code = params.and_then(|p| p.get("code")).ok_or("Missing code")?;

            // Parse code as SExpr
            let sexpr: viwo_ir::SExpr =
                serde_json::from_value(code.clone()).map_err(|e| format!("Invalid code: {}", e))?;

            let storage = runtime.storage().lock().unwrap();
            match storage.add_verb(entity_id, name, &sexpr) {
                Ok(id) => Ok(serde_json::json!({ "id": id })),
                Err(err) => Err(err.to_string().into()),
            }
        }

        "update_verb" => {
            let verb_id = params
                .and_then(|p| p.get("id"))
                .and_then(|id| id.as_i64())
                .ok_or("Missing verb id")?;
            let code = params.and_then(|p| p.get("code")).ok_or("Missing code")?;

            // Parse code as SExpr
            let sexpr: viwo_ir::SExpr =
                serde_json::from_value(code.clone()).map_err(|e| format!("Invalid code: {}", e))?;

            let storage = runtime.storage().lock().unwrap();
            match storage.update_verb(verb_id, &sexpr) {
                Ok(()) => Ok(serde_json::json!({ "status": "ok" })),
                Err(err) => Err(err.to_string().into()),
            }
        }

        "delete_verb" => {
            let verb_id = params
                .and_then(|p| p.get("id"))
                .and_then(|id| id.as_i64())
                .ok_or("Missing verb id")?;

            let storage = runtime.storage().lock().unwrap();
            match storage.delete_verb(verb_id) {
                Ok(()) => Ok(serde_json::json!({ "status": "ok" })),
                Err(err) => Err(err.to_string().into()),
            }
        }

        _ => Err(format!("Unknown method: {}", method).into()),
    };

    // Build response
    let response: serde_json::Value = match result {
        Ok(result) => {
            serde_json::json!({
                "jsonrpc": "2.0",
                "result": result,
                "id": id
            })
        }
        Err(err) => {
            serde_json::json!({
                "jsonrpc": "2.0",
                "error": {
                    "code": -32000,
                    "message": err.to_string()
                },
                "id": id
            })
        }
    };

    tx.send(response.to_string())?;
    Ok(())
}
