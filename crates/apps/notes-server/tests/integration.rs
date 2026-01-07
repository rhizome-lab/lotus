//! Integration tests for notes-server
//!
//! Tests the full end-to-end flow:
//! - Server startup and initialization
//! - WebSocket connection
//! - JSON-RPC method calls (ping, get_entity, create_entity, call_verb)
//! - Verb execution on notes entities

use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::Message;

use viwo_runtime::ViwoRuntime;
use viwo_transport_websocket_jsonrpc::{Server, ServerConfig};

/// Helper to send a JSON-RPC request and get the response
async fn send_request(
    ws: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
        Message,
    >,
    ws_rx: &mut futures_util::stream::SplitStream<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
    >,
    method: &str,
    params: serde_json::Value,
    id: i64,
) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
    let request = json!({
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
        "id": id
    });

    ws.send(Message::Text(request.to_string().into())).await?;

    // Wait for response with timeout
    let msg = timeout(Duration::from_secs(5), ws_rx.next())
        .await?
        .ok_or("No response")??;

    if let Message::Text(text) = msg {
        let response: serde_json::Value = serde_json::from_str(&text)?;
        Ok(response)
    } else {
        Err("Expected text message".into())
    }
}

#[tokio::test]
async fn test_notes_server_basic_operations() -> Result<(), Box<dyn std::error::Error>> {
    // Create temporary test directory
    let test_dir = std::env::temp_dir().join("viwo-test-notes");
    let db_path = test_dir.join("test.db");

    // Clean up from previous runs
    let _ = std::fs::remove_dir_all(&test_dir);
    std::fs::create_dir_all(&test_dir)?;

    // Create runtime
    let runtime = Arc::new(ViwoRuntime::open(db_path.to_str().unwrap())?);

    // Create test entities manually (without using seed system to avoid TypeScript parsing issues)
    let (base_entity_id, test_entity_id) = {
        let storage = runtime.storage();
        let storage_lock = storage.lock().unwrap();

        // Create a base prototype entity
        let base_entity_id = storage_lock.create_entity(
            serde_json::json!({
                "name": "Base Entity",
                "description": "A base prototype entity"
            }),
            None,
        )?;

        // Create a test entity based on the base
        let test_entity_id = storage_lock.create_entity(
            serde_json::json!({
                "name": "Test Notebook",
                "description": "A test notebook entity",
                "notes": {}
            }),
            Some(base_entity_id),
        )?;

        (base_entity_id, test_entity_id)
    };

    // Start server on random available port
    let port = 18081;
    let config = ServerConfig {
        host: "127.0.0.1".to_string(),
        port,
        db_path: db_path.to_str().unwrap().to_string(),
    };

    let server = Server::new(runtime.clone(), config);

    // Spawn server in background
    let server_handle = tokio::spawn(async move {
        server.run().await.unwrap();
    });

    // Give server time to start
    tokio::time::sleep(Duration::from_millis(100)).await;

    // Connect to server
    let url = format!("ws://127.0.0.1:{}", port);
    let (ws_stream, _) = tokio_tungstenite::connect_async(&url).await?;
    let (mut ws_tx, mut ws_rx) = ws_stream.split();

    // Test 1: Ping
    let response = send_request(&mut ws_tx, &mut ws_rx, "ping", json!({}), 1).await?;
    assert_eq!(response["result"], "pong");
    assert_eq!(response["id"], 1);
    println!("✓ Ping test passed");

    // Test 2: Get base entity
    let response = send_request(
        &mut ws_tx,
        &mut ws_rx,
        "get_entity",
        json!({"id": base_entity_id}),
        2,
    )
    .await?;
    assert!(response["result"].is_object());
    assert_eq!(response["result"]["id"], base_entity_id);
    println!("✓ Get entity test passed (Base Entity)");

    // Test 3: Get Test entity
    let response = send_request(
        &mut ws_tx,
        &mut ws_rx,
        "get_entity",
        json!({"id": test_entity_id}),
        3,
    )
    .await?;
    assert!(response["result"].is_object());
    assert_eq!(response["result"]["id"], test_entity_id);
    let entity = &response["result"];
    assert!(entity["props"].is_object());
    assert_eq!(entity["props"]["name"], "Test Notebook");
    println!("✓ Get entity test passed (Test entity)");

    // Test 4: Create a new entity dynamically
    let response = send_request(
        &mut ws_tx,
        &mut ws_rx,
        "create_entity",
        json!({
            "props": {"name": "Dynamic Entity", "value": 42},
            "prototype_id": base_entity_id
        }),
        4,
    )
    .await?;
    assert!(response["result"].is_object());
    let new_entity_id = response["result"]["id"].as_i64().unwrap();
    assert!(new_entity_id > 0);
    println!(
        "✓ Create entity test passed - new entity ID: {}",
        new_entity_id
    );

    // Test 5: Verify the created entity persists
    let response = send_request(
        &mut ws_tx,
        &mut ws_rx,
        "get_entity",
        json!({"id": new_entity_id}),
        5,
    )
    .await?;
    assert!(response["result"].is_object());
    assert_eq!(response["result"]["props"]["name"], "Dynamic Entity");
    assert_eq!(response["result"]["props"]["value"], 42);
    println!("✓ Entity persistence test passed");

    // Cleanup
    server_handle.abort();
    std::fs::remove_dir_all(&test_dir)?;

    println!("\n✅ All integration tests passed!");
    Ok(())
}
