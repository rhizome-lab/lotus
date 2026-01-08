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

use lotus_runtime::LotusRuntime;
use lotus_transport_websocket_jsonrpc::{Server, ServerConfig};

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
    let test_dir = std::env::temp_dir().join("bloom-test-notes");
    let db_path = test_dir.join("test.db");

    // Clean up from previous runs
    let _ = std::fs::remove_dir_all(&test_dir);
    std::fs::create_dir_all(&test_dir)?;

    // Create runtime
    let runtime = Arc::new(LotusRuntime::open(db_path.to_str().unwrap())?);

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

/// Test notes-specific verbs: create, list, get, update, delete
#[tokio::test]
async fn test_notes_verb_operations() -> Result<(), Box<dyn std::error::Error>> {
    use lotus_ir::SExpr;

    // Create temporary test directory
    let test_dir = std::env::temp_dir().join("bloom-test-notes-verbs");
    let db_path = test_dir.join("test.db");

    // Clean up from previous runs
    let _ = std::fs::remove_dir_all(&test_dir);
    std::fs::create_dir_all(&test_dir)?;

    // Create runtime
    let runtime = Arc::new(LotusRuntime::open(db_path.to_str().unwrap())?);

    // Create notes user entity with verbs
    let user_id = {
        let storage = runtime.storage();
        let storage_lock = storage.lock().unwrap();

        // Create user entity with notes storage
        let user_id = storage_lock.create_entity(
            serde_json::json!({
                "name": "Notes User",
                "notes": {},
                "note_counter": 0
            }),
            None,
        )?;

        // Grant control capability to user
        storage_lock.create_capability(
            user_id,
            "entity.control",
            serde_json::json!({"target_id": user_id}),
        )?;

        // Add list_notes verb - returns all notes
        // Returns: { type: "notes_list", notes: [...] }
        let list_notes_verb = SExpr::call(
            "std.seq",
            vec![
                // Get notes map from this entity
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("notes_map").erase_type(),
                        SExpr::call(
                            "bool.guard",
                            vec![
                                SExpr::call(
                                    "obj.get",
                                    vec![
                                        SExpr::call(
                                            "entity",
                                            vec![SExpr::call("std.caller", vec![])],
                                        ),
                                        SExpr::string("notes").erase_type(),
                                    ],
                                ),
                                SExpr::call("obj.new", vec![]),
                            ],
                        ),
                    ],
                ),
                // Get keys and map to notes array
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("keys").erase_type(),
                        SExpr::call(
                            "obj.keys",
                            vec![SExpr::call(
                                "std.var",
                                vec![SExpr::string("notes_map").erase_type()],
                            )],
                        ),
                    ],
                ),
                // Map keys to notes
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("notes_array").erase_type(),
                        SExpr::call(
                            "list.map",
                            vec![
                                SExpr::call("std.var", vec![SExpr::string("keys").erase_type()]),
                                SExpr::call(
                                    "std.lambda",
                                    vec![
                                        SExpr::list(vec![SExpr::string("key").erase_type()])
                                            .erase_type(),
                                        SExpr::call(
                                            "obj.get",
                                            vec![
                                                SExpr::call(
                                                    "std.var",
                                                    vec![SExpr::string("notes_map").erase_type()],
                                                ),
                                                SExpr::call(
                                                    "std.var",
                                                    vec![SExpr::string("key").erase_type()],
                                                ),
                                            ],
                                        ),
                                    ],
                                ),
                            ],
                        ),
                    ],
                ),
                // Return result
                SExpr::call(
                    "obj.new",
                    vec![
                        SExpr::string("type").erase_type(),
                        SExpr::string("notes_list").erase_type(),
                        SExpr::string("notes").erase_type(),
                        SExpr::call("std.var", vec![SExpr::string("notes_array").erase_type()]),
                    ],
                ),
            ],
        );
        storage_lock.add_verb(user_id, "list_notes", &list_notes_verb)?;

        // Add create_note verb
        // Args: [title, content]
        // Returns: { type: "note_created", note: {...} }
        let create_note_verb = SExpr::call(
            "std.seq",
            vec![
                // Get title argument
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("title").erase_type(),
                        SExpr::call("std.arg", vec![SExpr::number(0).erase_type()]),
                    ],
                ),
                // Get content argument (default to empty string)
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("content").erase_type(),
                        SExpr::call(
                            "bool.guard",
                            vec![
                                SExpr::call("std.arg", vec![SExpr::number(1).erase_type()]),
                                SExpr::string("").erase_type(),
                            ],
                        ),
                    ],
                ),
                // Get current notes map
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("notes_map").erase_type(),
                        SExpr::call(
                            "bool.guard",
                            vec![
                                SExpr::call(
                                    "obj.get",
                                    vec![
                                        SExpr::call(
                                            "entity",
                                            vec![SExpr::call("std.caller", vec![])],
                                        ),
                                        SExpr::string("notes").erase_type(),
                                    ],
                                ),
                                SExpr::call("obj.new", vec![]),
                            ],
                        ),
                    ],
                ),
                // Generate note ID (increment counter)
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("counter").erase_type(),
                        SExpr::call(
                            "math.add",
                            vec![
                                SExpr::call(
                                    "bool.guard",
                                    vec![
                                        SExpr::call(
                                            "obj.get",
                                            vec![
                                                SExpr::call(
                                                    "entity",
                                                    vec![SExpr::call("std.caller", vec![])],
                                                ),
                                                SExpr::string("note_counter").erase_type(),
                                            ],
                                        ),
                                        SExpr::number(0).erase_type(),
                                    ],
                                ),
                                SExpr::number(1).erase_type(),
                            ],
                        ),
                    ],
                ),
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("note_id").erase_type(),
                        SExpr::call(
                            "str.concat",
                            vec![
                                SExpr::string("note_").erase_type(),
                                SExpr::call(
                                    "std.string",
                                    vec![SExpr::call(
                                        "std.var",
                                        vec![SExpr::string("counter").erase_type()],
                                    )],
                                ),
                            ],
                        ),
                    ],
                ),
                // Create note object
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("note").erase_type(),
                        SExpr::call(
                            "obj.new",
                            vec![
                                SExpr::string("id").erase_type(),
                                SExpr::call("std.var", vec![SExpr::string("note_id").erase_type()]),
                                SExpr::string("title").erase_type(),
                                SExpr::call("std.var", vec![SExpr::string("title").erase_type()]),
                                SExpr::string("content").erase_type(),
                                SExpr::call("std.var", vec![SExpr::string("content").erase_type()]),
                                SExpr::string("links").erase_type(),
                                SExpr::call("list.new", vec![]),
                            ],
                        ),
                    ],
                ),
                // Add note to map
                SExpr::call(
                    "obj.set",
                    vec![
                        SExpr::call("std.var", vec![SExpr::string("notes_map").erase_type()]),
                        SExpr::call("std.var", vec![SExpr::string("note_id").erase_type()]),
                        SExpr::call("std.var", vec![SExpr::string("note").erase_type()]),
                    ],
                ),
                // Update caller with new notes and counter (using update for persistence)
                SExpr::call(
                    "update",
                    vec![
                        SExpr::call("std.caller", vec![]),
                        SExpr::call(
                            "obj.new",
                            vec![
                                SExpr::list(vec![
                                    SExpr::string("notes").erase_type(),
                                    SExpr::call(
                                        "std.var",
                                        vec![SExpr::string("notes_map").erase_type()],
                                    ),
                                ])
                                .erase_type(),
                                SExpr::list(vec![
                                    SExpr::string("note_counter").erase_type(),
                                    SExpr::call(
                                        "std.var",
                                        vec![SExpr::string("counter").erase_type()],
                                    ),
                                ])
                                .erase_type(),
                            ],
                        ),
                    ],
                ),
                // Return result
                SExpr::call(
                    "obj.new",
                    vec![
                        SExpr::string("type").erase_type(),
                        SExpr::string("note_created").erase_type(),
                        SExpr::string("note").erase_type(),
                        SExpr::call("std.var", vec![SExpr::string("note").erase_type()]),
                    ],
                ),
            ],
        );
        storage_lock.add_verb(user_id, "create_note", &create_note_verb)?;

        // Add get_note verb
        // Args: [note_id]
        // Returns: { type: "note_content", note: {...} }
        let get_note_verb = SExpr::call(
            "std.seq",
            vec![
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("note_id").erase_type(),
                        SExpr::call("std.arg", vec![SExpr::number(0).erase_type()]),
                    ],
                ),
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("notes_map").erase_type(),
                        SExpr::call(
                            "bool.guard",
                            vec![
                                SExpr::call(
                                    "obj.get",
                                    vec![
                                        SExpr::call(
                                            "entity",
                                            vec![SExpr::call("std.caller", vec![])],
                                        ),
                                        SExpr::string("notes").erase_type(),
                                    ],
                                ),
                                SExpr::call("obj.new", vec![]),
                            ],
                        ),
                    ],
                ),
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("note").erase_type(),
                        SExpr::call(
                            "obj.get",
                            vec![
                                SExpr::call(
                                    "std.var",
                                    vec![SExpr::string("notes_map").erase_type()],
                                ),
                                SExpr::call("std.var", vec![SExpr::string("note_id").erase_type()]),
                            ],
                        ),
                    ],
                ),
                SExpr::call(
                    "obj.new",
                    vec![
                        SExpr::string("type").erase_type(),
                        SExpr::string("note_content").erase_type(),
                        SExpr::string("note").erase_type(),
                        SExpr::call("std.var", vec![SExpr::string("note").erase_type()]),
                    ],
                ),
            ],
        );
        storage_lock.add_verb(user_id, "get_note", &get_note_verb)?;

        // Add delete_note verb
        // Args: [note_id]
        let delete_note_verb = SExpr::call(
            "std.seq",
            vec![
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("note_id").erase_type(),
                        SExpr::call("std.arg", vec![SExpr::number(0).erase_type()]),
                    ],
                ),
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("notes_map").erase_type(),
                        SExpr::call(
                            "bool.guard",
                            vec![
                                SExpr::call(
                                    "obj.get",
                                    vec![
                                        SExpr::call(
                                            "entity",
                                            vec![SExpr::call("std.caller", vec![])],
                                        ),
                                        SExpr::string("notes").erase_type(),
                                    ],
                                ),
                                SExpr::call("obj.new", vec![]),
                            ],
                        ),
                    ],
                ),
                SExpr::call(
                    "obj.del",
                    vec![
                        SExpr::call("std.var", vec![SExpr::string("notes_map").erase_type()]),
                        SExpr::call("std.var", vec![SExpr::string("note_id").erase_type()]),
                    ],
                ),
                SExpr::call(
                    "update",
                    vec![
                        SExpr::call("std.caller", vec![]),
                        SExpr::call(
                            "obj.new",
                            vec![
                                SExpr::list(vec![
                                    SExpr::string("notes").erase_type(),
                                    SExpr::call(
                                        "std.var",
                                        vec![SExpr::string("notes_map").erase_type()],
                                    ),
                                ])
                                .erase_type(),
                            ],
                        ),
                    ],
                ),
                SExpr::call(
                    "obj.new",
                    vec![
                        SExpr::string("type").erase_type(),
                        SExpr::string("note_deleted").erase_type(),
                        SExpr::string("id").erase_type(),
                        SExpr::call("std.var", vec![SExpr::string("note_id").erase_type()]),
                    ],
                ),
            ],
        );
        storage_lock.add_verb(user_id, "delete_note", &delete_note_verb)?;

        user_id
    };

    // Test verb execution directly via runtime (no server needed)

    // Test 1: Create a note
    let result = runtime.execute_verb(
        user_id,
        "create_note",
        vec![json!("My First Note"), json!("Hello World")],
        Some(user_id),
    )?;
    assert_eq!(result["type"], "note_created");
    assert_eq!(result["note"]["title"], "My First Note");
    assert_eq!(result["note"]["content"], "Hello World");
    let note1_id = result["note"]["id"].as_str().unwrap().to_string();
    println!("✓ Create note test passed: {}", note1_id);

    // Test 2: Create another note
    let result = runtime.execute_verb(
        user_id,
        "create_note",
        vec![json!("Second Note"), json!("More content")],
        Some(user_id),
    )?;
    let note2_id = result["note"]["id"].as_str().unwrap().to_string();
    println!("✓ Create second note: {}", note2_id);

    // Test 3: List notes
    let result = runtime.execute_verb(user_id, "list_notes", vec![], Some(user_id))?;
    assert_eq!(result["type"], "notes_list");
    let notes = result["notes"].as_array().unwrap();
    assert_eq!(notes.len(), 2);
    println!("✓ List notes test passed: {} notes", notes.len());

    // Test 4: Get specific note
    let result = runtime.execute_verb(user_id, "get_note", vec![json!(note1_id)], Some(user_id))?;
    assert_eq!(result["type"], "note_content");
    assert_eq!(result["note"]["title"], "My First Note");
    println!("✓ Get note test passed");

    // Test 5: Delete note
    let result =
        runtime.execute_verb(user_id, "delete_note", vec![json!(note1_id)], Some(user_id))?;
    assert_eq!(result["type"], "note_deleted");
    assert_eq!(result["id"], note1_id);
    println!("✓ Delete note test passed");

    // Test 6: Verify deletion
    let result = runtime.execute_verb(user_id, "list_notes", vec![], Some(user_id))?;
    let notes = result["notes"].as_array().unwrap();
    assert_eq!(notes.len(), 1);
    println!("✓ Notes after deletion: {}", notes.len());

    // Cleanup
    std::fs::remove_dir_all(&test_dir)?;

    println!("\n✅ All notes verb tests passed!");
    Ok(())
}

/// Test backlinks functionality
#[tokio::test]
async fn test_notes_backlinks() -> Result<(), Box<dyn std::error::Error>> {
    use lotus_ir::SExpr;

    // Create temporary test directory
    let test_dir = std::env::temp_dir().join("bloom-test-notes-backlinks");
    let db_path = test_dir.join("test.db");

    // Clean up from previous runs
    let _ = std::fs::remove_dir_all(&test_dir);
    std::fs::create_dir_all(&test_dir)?;

    // Create runtime
    let runtime = Arc::new(LotusRuntime::open(db_path.to_str().unwrap())?);

    // Create notes user entity with backlink support
    let user_id = {
        let storage = runtime.storage();
        let storage_lock = storage.lock().unwrap();

        let user_id = storage_lock.create_entity(
            serde_json::json!({
                "name": "Notes User",
                "notes": {},
                "note_counter": 0
            }),
            None,
        )?;

        // Create note verb with links support
        let create_note_verb = SExpr::call(
            "std.seq",
            vec![
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("title").erase_type(),
                        SExpr::call("std.arg", vec![SExpr::number(0).erase_type()]),
                    ],
                ),
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("content").erase_type(),
                        SExpr::call(
                            "bool.guard",
                            vec![
                                SExpr::call("std.arg", vec![SExpr::number(1).erase_type()]),
                                SExpr::string("").erase_type(),
                            ],
                        ),
                    ],
                ),
                // Links array from arg 2
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("links").erase_type(),
                        SExpr::call(
                            "bool.guard",
                            vec![
                                SExpr::call("std.arg", vec![SExpr::number(2).erase_type()]),
                                SExpr::call("list.new", vec![]),
                            ],
                        ),
                    ],
                ),
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("notes_map").erase_type(),
                        SExpr::call(
                            "bool.guard",
                            vec![
                                SExpr::call(
                                    "obj.get",
                                    vec![
                                        SExpr::call(
                                            "entity",
                                            vec![SExpr::call("std.caller", vec![])],
                                        ),
                                        SExpr::string("notes").erase_type(),
                                    ],
                                ),
                                SExpr::call("obj.new", vec![]),
                            ],
                        ),
                    ],
                ),
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("counter").erase_type(),
                        SExpr::call(
                            "math.add",
                            vec![
                                SExpr::call(
                                    "bool.guard",
                                    vec![
                                        SExpr::call(
                                            "obj.get",
                                            vec![
                                                SExpr::call(
                                                    "entity",
                                                    vec![SExpr::call("std.caller", vec![])],
                                                ),
                                                SExpr::string("note_counter").erase_type(),
                                            ],
                                        ),
                                        SExpr::number(0).erase_type(),
                                    ],
                                ),
                                SExpr::number(1).erase_type(),
                            ],
                        ),
                    ],
                ),
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("note_id").erase_type(),
                        SExpr::call(
                            "str.concat",
                            vec![
                                SExpr::string("note_").erase_type(),
                                SExpr::call(
                                    "std.string",
                                    vec![SExpr::call(
                                        "std.var",
                                        vec![SExpr::string("counter").erase_type()],
                                    )],
                                ),
                            ],
                        ),
                    ],
                ),
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("note").erase_type(),
                        SExpr::call(
                            "obj.new",
                            vec![
                                SExpr::string("id").erase_type(),
                                SExpr::call("std.var", vec![SExpr::string("note_id").erase_type()]),
                                SExpr::string("title").erase_type(),
                                SExpr::call("std.var", vec![SExpr::string("title").erase_type()]),
                                SExpr::string("content").erase_type(),
                                SExpr::call("std.var", vec![SExpr::string("content").erase_type()]),
                                SExpr::string("links").erase_type(),
                                SExpr::call("std.var", vec![SExpr::string("links").erase_type()]),
                            ],
                        ),
                    ],
                ),
                SExpr::call(
                    "obj.set",
                    vec![
                        SExpr::call("std.var", vec![SExpr::string("notes_map").erase_type()]),
                        SExpr::call("std.var", vec![SExpr::string("note_id").erase_type()]),
                        SExpr::call("std.var", vec![SExpr::string("note").erase_type()]),
                    ],
                ),
                // Persist to storage using update
                SExpr::call(
                    "update",
                    vec![
                        SExpr::call("std.caller", vec![]),
                        SExpr::call(
                            "obj.new",
                            vec![
                                SExpr::list(vec![
                                    SExpr::string("notes").erase_type(),
                                    SExpr::call(
                                        "std.var",
                                        vec![SExpr::string("notes_map").erase_type()],
                                    ),
                                ])
                                .erase_type(),
                                SExpr::list(vec![
                                    SExpr::string("note_counter").erase_type(),
                                    SExpr::call(
                                        "std.var",
                                        vec![SExpr::string("counter").erase_type()],
                                    ),
                                ])
                                .erase_type(),
                            ],
                        ),
                    ],
                ),
                SExpr::call(
                    "obj.new",
                    vec![
                        SExpr::string("type").erase_type(),
                        SExpr::string("note_created").erase_type(),
                        SExpr::string("note").erase_type(),
                        SExpr::call("std.var", vec![SExpr::string("note").erase_type()]),
                    ],
                ),
            ],
        );
        storage_lock.add_verb(user_id, "create_note", &create_note_verb)?;

        // Get backlinks verb - finds notes that link to a given title
        let get_backlinks_verb = SExpr::call(
            "std.seq",
            vec![
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("target_title").erase_type(),
                        SExpr::call("std.arg", vec![SExpr::number(0).erase_type()]),
                    ],
                ),
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("notes_map").erase_type(),
                        SExpr::call(
                            "bool.guard",
                            vec![
                                SExpr::call(
                                    "obj.get",
                                    vec![
                                        SExpr::call(
                                            "entity",
                                            vec![SExpr::call("std.caller", vec![])],
                                        ),
                                        SExpr::string("notes").erase_type(),
                                    ],
                                ),
                                SExpr::call("obj.new", vec![]),
                            ],
                        ),
                    ],
                ),
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("keys").erase_type(),
                        SExpr::call(
                            "obj.keys",
                            vec![SExpr::call(
                                "std.var",
                                vec![SExpr::string("notes_map").erase_type()],
                            )],
                        ),
                    ],
                ),
                // Filter notes that have target_title in their links
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("matching_keys").erase_type(),
                        SExpr::call(
                            "list.filter",
                            vec![
                                SExpr::call("std.var", vec![SExpr::string("keys").erase_type()]),
                                SExpr::call(
                                    "std.lambda",
                                    vec![
                                        SExpr::list(vec![SExpr::string("key").erase_type()])
                                            .erase_type(),
                                        SExpr::call(
                                            "std.seq",
                                            vec![
                                                SExpr::call(
                                                    "std.let",
                                                    vec![
                                                        SExpr::string("note").erase_type(),
                                                        SExpr::call(
                                                            "obj.get",
                                                            vec![
                                                                SExpr::call(
                                                                    "std.var",
                                                                    vec![
                                                                        SExpr::string("notes_map")
                                                                            .erase_type(),
                                                                    ],
                                                                ),
                                                                SExpr::call(
                                                                    "std.var",
                                                                    vec![
                                                                        SExpr::string("key")
                                                                            .erase_type(),
                                                                    ],
                                                                ),
                                                            ],
                                                        ),
                                                    ],
                                                ),
                                                SExpr::call(
                                                    "std.let",
                                                    vec![
                                                        SExpr::string("links").erase_type(),
                                                        SExpr::call(
                                                            "bool.guard",
                                                            vec![
                                                                SExpr::call(
                                                                    "obj.get",
                                                                    vec![
                                                                        SExpr::call(
                                                                            "std.var",
                                                                            vec![
                                                                                SExpr::string(
                                                                                    "note",
                                                                                )
                                                                                .erase_type(),
                                                                            ],
                                                                        ),
                                                                        SExpr::string("links")
                                                                            .erase_type(),
                                                                    ],
                                                                ),
                                                                SExpr::call("list.new", vec![]),
                                                            ],
                                                        ),
                                                    ],
                                                ),
                                                SExpr::call(
                                                    "list.includes",
                                                    vec![
                                                        SExpr::call(
                                                            "std.var",
                                                            vec![
                                                                SExpr::string("links").erase_type(),
                                                            ],
                                                        ),
                                                        SExpr::call(
                                                            "std.var",
                                                            vec![
                                                                SExpr::string("target_title")
                                                                    .erase_type(),
                                                            ],
                                                        ),
                                                    ],
                                                ),
                                            ],
                                        ),
                                    ],
                                ),
                            ],
                        ),
                    ],
                ),
                // Map to backlink objects
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("backlinks").erase_type(),
                        SExpr::call(
                            "list.map",
                            vec![
                                SExpr::call(
                                    "std.var",
                                    vec![SExpr::string("matching_keys").erase_type()],
                                ),
                                SExpr::call(
                                    "std.lambda",
                                    vec![
                                        SExpr::list(vec![SExpr::string("key").erase_type()])
                                            .erase_type(),
                                        SExpr::call(
                                            "std.seq",
                                            vec![
                                                SExpr::call(
                                                    "std.let",
                                                    vec![
                                                        SExpr::string("note").erase_type(),
                                                        SExpr::call(
                                                            "obj.get",
                                                            vec![
                                                                SExpr::call(
                                                                    "std.var",
                                                                    vec![
                                                                        SExpr::string("notes_map")
                                                                            .erase_type(),
                                                                    ],
                                                                ),
                                                                SExpr::call(
                                                                    "std.var",
                                                                    vec![
                                                                        SExpr::string("key")
                                                                            .erase_type(),
                                                                    ],
                                                                ),
                                                            ],
                                                        ),
                                                    ],
                                                ),
                                                SExpr::call(
                                                    "obj.new",
                                                    vec![
                                                        SExpr::string("id").erase_type(),
                                                        SExpr::call(
                                                            "obj.get",
                                                            vec![
                                                                SExpr::call(
                                                                    "std.var",
                                                                    vec![
                                                                        SExpr::string("note")
                                                                            .erase_type(),
                                                                    ],
                                                                ),
                                                                SExpr::string("id").erase_type(),
                                                            ],
                                                        ),
                                                        SExpr::string("title").erase_type(),
                                                        SExpr::call(
                                                            "obj.get",
                                                            vec![
                                                                SExpr::call(
                                                                    "std.var",
                                                                    vec![
                                                                        SExpr::string("note")
                                                                            .erase_type(),
                                                                    ],
                                                                ),
                                                                SExpr::string("title").erase_type(),
                                                            ],
                                                        ),
                                                    ],
                                                ),
                                            ],
                                        ),
                                    ],
                                ),
                            ],
                        ),
                    ],
                ),
                SExpr::call(
                    "obj.new",
                    vec![
                        SExpr::string("type").erase_type(),
                        SExpr::string("backlinks").erase_type(),
                        SExpr::string("title").erase_type(),
                        SExpr::call("std.var", vec![SExpr::string("target_title").erase_type()]),
                        SExpr::string("backlinks").erase_type(),
                        SExpr::call("std.var", vec![SExpr::string("backlinks").erase_type()]),
                    ],
                ),
            ],
        );
        storage_lock.add_verb(user_id, "get_backlinks", &get_backlinks_verb)?;

        user_id
    };

    // Create Note A
    let result = runtime.execute_verb(
        user_id,
        "create_note",
        vec![json!("Note A"), json!("Content of A"), json!([])],
        Some(user_id),
    )?;
    assert_eq!(result["note"]["title"], "Note A");
    println!("✓ Created Note A");

    // Create Note B that links to Note A
    let result = runtime.execute_verb(
        user_id,
        "create_note",
        vec![json!("Note B"), json!("Links to Note A"), json!(["Note A"])],
        Some(user_id),
    )?;
    assert_eq!(result["note"]["title"], "Note B");
    let links = result["note"]["links"].as_array().unwrap();
    assert_eq!(links[0], "Note A");
    println!("✓ Created Note B with link to Note A");

    // Create Note C that also links to Note A
    runtime.execute_verb(
        user_id,
        "create_note",
        vec![
            json!("Note C"),
            json!("Also links to Note A"),
            json!(["Note A"]),
        ],
        Some(user_id),
    )?;
    println!("✓ Created Note C with link to Note A");

    // Test backlinks for Note A
    let result = runtime.execute_verb(
        user_id,
        "get_backlinks",
        vec![json!("Note A")],
        Some(user_id),
    )?;
    assert_eq!(result["type"], "backlinks");
    let backlinks = result["backlinks"].as_array().unwrap();
    assert_eq!(backlinks.len(), 2, "Note A should have 2 backlinks");
    println!("✓ Backlinks for Note A: {} links found", backlinks.len());

    // Verify backlinks contain Note B and Note C
    let titles: Vec<&str> = backlinks
        .iter()
        .map(|b| b["title"].as_str().unwrap())
        .collect();
    assert!(titles.contains(&"Note B"));
    assert!(titles.contains(&"Note C"));
    println!("✓ Backlinks contain Note B and Note C");

    // Cleanup
    std::fs::remove_dir_all(&test_dir)?;

    println!("\n✅ All backlinks tests passed!");
    Ok(())
}

/// Test search functionality
#[tokio::test]
async fn test_notes_search() -> Result<(), Box<dyn std::error::Error>> {
    use lotus_ir::SExpr;

    // Create temporary test directory
    let test_dir = std::env::temp_dir().join("bloom-test-notes-search");
    let db_path = test_dir.join("test.db");

    // Clean up from previous runs
    let _ = std::fs::remove_dir_all(&test_dir);
    std::fs::create_dir_all(&test_dir)?;

    // Create runtime
    let runtime = Arc::new(LotusRuntime::open(db_path.to_str().unwrap())?);

    // Create notes user entity with search verb
    let user_id = {
        let storage = runtime.storage();
        let storage_lock = storage.lock().unwrap();

        let user_id = storage_lock.create_entity(
            serde_json::json!({
                "name": "Notes User",
                "notes": {},
                "note_counter": 0
            }),
            None,
        )?;

        // Simple create_note verb
        let create_note_verb = SExpr::call(
            "std.seq",
            vec![
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("title").erase_type(),
                        SExpr::call("std.arg", vec![SExpr::number(0).erase_type()]),
                    ],
                ),
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("content").erase_type(),
                        SExpr::call(
                            "bool.guard",
                            vec![
                                SExpr::call("std.arg", vec![SExpr::number(1).erase_type()]),
                                SExpr::string("").erase_type(),
                            ],
                        ),
                    ],
                ),
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("notes_map").erase_type(),
                        SExpr::call(
                            "bool.guard",
                            vec![
                                SExpr::call(
                                    "obj.get",
                                    vec![
                                        SExpr::call(
                                            "entity",
                                            vec![SExpr::call("std.caller", vec![])],
                                        ),
                                        SExpr::string("notes").erase_type(),
                                    ],
                                ),
                                SExpr::call("obj.new", vec![]),
                            ],
                        ),
                    ],
                ),
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("counter").erase_type(),
                        SExpr::call(
                            "math.add",
                            vec![
                                SExpr::call(
                                    "bool.guard",
                                    vec![
                                        SExpr::call(
                                            "obj.get",
                                            vec![
                                                SExpr::call(
                                                    "entity",
                                                    vec![SExpr::call("std.caller", vec![])],
                                                ),
                                                SExpr::string("note_counter").erase_type(),
                                            ],
                                        ),
                                        SExpr::number(0).erase_type(),
                                    ],
                                ),
                                SExpr::number(1).erase_type(),
                            ],
                        ),
                    ],
                ),
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("note_id").erase_type(),
                        SExpr::call(
                            "str.concat",
                            vec![
                                SExpr::string("note_").erase_type(),
                                SExpr::call(
                                    "std.string",
                                    vec![SExpr::call(
                                        "std.var",
                                        vec![SExpr::string("counter").erase_type()],
                                    )],
                                ),
                            ],
                        ),
                    ],
                ),
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("note").erase_type(),
                        SExpr::call(
                            "obj.new",
                            vec![
                                SExpr::string("id").erase_type(),
                                SExpr::call("std.var", vec![SExpr::string("note_id").erase_type()]),
                                SExpr::string("title").erase_type(),
                                SExpr::call("std.var", vec![SExpr::string("title").erase_type()]),
                                SExpr::string("content").erase_type(),
                                SExpr::call("std.var", vec![SExpr::string("content").erase_type()]),
                            ],
                        ),
                    ],
                ),
                SExpr::call(
                    "obj.set",
                    vec![
                        SExpr::call("std.var", vec![SExpr::string("notes_map").erase_type()]),
                        SExpr::call("std.var", vec![SExpr::string("note_id").erase_type()]),
                        SExpr::call("std.var", vec![SExpr::string("note").erase_type()]),
                    ],
                ),
                // Persist to storage using update
                SExpr::call(
                    "update",
                    vec![
                        SExpr::call("std.caller", vec![]),
                        SExpr::call(
                            "obj.new",
                            vec![
                                SExpr::list(vec![
                                    SExpr::string("notes").erase_type(),
                                    SExpr::call(
                                        "std.var",
                                        vec![SExpr::string("notes_map").erase_type()],
                                    ),
                                ])
                                .erase_type(),
                                SExpr::list(vec![
                                    SExpr::string("note_counter").erase_type(),
                                    SExpr::call(
                                        "std.var",
                                        vec![SExpr::string("counter").erase_type()],
                                    ),
                                ])
                                .erase_type(),
                            ],
                        ),
                    ],
                ),
                SExpr::call("std.var", vec![SExpr::string("note").erase_type()]),
            ],
        );
        storage_lock.add_verb(user_id, "create_note", &create_note_verb)?;

        // Search verb - searches title and content
        let search_verb = SExpr::call(
            "std.seq",
            vec![
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("query").erase_type(),
                        SExpr::call(
                            "str.lower",
                            vec![SExpr::call("std.arg", vec![SExpr::number(0).erase_type()])],
                        ),
                    ],
                ),
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("notes_map").erase_type(),
                        SExpr::call(
                            "bool.guard",
                            vec![
                                SExpr::call(
                                    "obj.get",
                                    vec![
                                        SExpr::call(
                                            "entity",
                                            vec![SExpr::call("std.caller", vec![])],
                                        ),
                                        SExpr::string("notes").erase_type(),
                                    ],
                                ),
                                SExpr::call("obj.new", vec![]),
                            ],
                        ),
                    ],
                ),
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("keys").erase_type(),
                        SExpr::call(
                            "obj.keys",
                            vec![SExpr::call(
                                "std.var",
                                vec![SExpr::string("notes_map").erase_type()],
                            )],
                        ),
                    ],
                ),
                // Filter notes that match query in title or content
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("matching_keys").erase_type(),
                        SExpr::call(
                            "list.filter",
                            vec![
                                SExpr::call("std.var", vec![SExpr::string("keys").erase_type()]),
                                SExpr::call(
                                    "std.lambda",
                                    vec![
                                        SExpr::list(vec![SExpr::string("key").erase_type()])
                                            .erase_type(),
                                        SExpr::call(
                                            "std.seq",
                                            vec![
                                                SExpr::call(
                                                    "std.let",
                                                    vec![
                                                        SExpr::string("note").erase_type(),
                                                        SExpr::call(
                                                            "obj.get",
                                                            vec![
                                                                SExpr::call(
                                                                    "std.var",
                                                                    vec![
                                                                        SExpr::string("notes_map")
                                                                            .erase_type(),
                                                                    ],
                                                                ),
                                                                SExpr::call(
                                                                    "std.var",
                                                                    vec![
                                                                        SExpr::string("key")
                                                                            .erase_type(),
                                                                    ],
                                                                ),
                                                            ],
                                                        ),
                                                    ],
                                                ),
                                                SExpr::call(
                                                    "bool.or",
                                                    vec![
                                                        SExpr::call(
                                                            "str.includes",
                                                            vec![
                                                                SExpr::call(
                                                                    "str.lower",
                                                                    vec![SExpr::call(
                                                                        "obj.get",
                                                                        vec![
                                                                            SExpr::call(
                                                                                "std.var",
                                                                                vec![
                                                                                    SExpr::string(
                                                                                        "note",
                                                                                    )
                                                                                    .erase_type(),
                                                                                ],
                                                                            ),
                                                                            SExpr::string("title")
                                                                                .erase_type(),
                                                                        ],
                                                                    )],
                                                                ),
                                                                SExpr::call(
                                                                    "std.var",
                                                                    vec![
                                                                        SExpr::string("query")
                                                                            .erase_type(),
                                                                    ],
                                                                ),
                                                            ],
                                                        ),
                                                        SExpr::call(
                                                            "str.includes",
                                                            vec![
                                                                SExpr::call(
                                                                    "str.lower",
                                                                    vec![SExpr::call(
                                                                        "obj.get",
                                                                        vec![
                                                                            SExpr::call(
                                                                                "std.var",
                                                                                vec![
                                                                                    SExpr::string(
                                                                                        "note",
                                                                                    )
                                                                                    .erase_type(),
                                                                                ],
                                                                            ),
                                                                            SExpr::string(
                                                                                "content",
                                                                            )
                                                                            .erase_type(),
                                                                        ],
                                                                    )],
                                                                ),
                                                                SExpr::call(
                                                                    "std.var",
                                                                    vec![
                                                                        SExpr::string("query")
                                                                            .erase_type(),
                                                                    ],
                                                                ),
                                                            ],
                                                        ),
                                                    ],
                                                ),
                                            ],
                                        ),
                                    ],
                                ),
                            ],
                        ),
                    ],
                ),
                // Map to notes
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("results").erase_type(),
                        SExpr::call(
                            "list.map",
                            vec![
                                SExpr::call(
                                    "std.var",
                                    vec![SExpr::string("matching_keys").erase_type()],
                                ),
                                SExpr::call(
                                    "std.lambda",
                                    vec![
                                        SExpr::list(vec![SExpr::string("key").erase_type()])
                                            .erase_type(),
                                        SExpr::call(
                                            "obj.get",
                                            vec![
                                                SExpr::call(
                                                    "std.var",
                                                    vec![SExpr::string("notes_map").erase_type()],
                                                ),
                                                SExpr::call(
                                                    "std.var",
                                                    vec![SExpr::string("key").erase_type()],
                                                ),
                                            ],
                                        ),
                                    ],
                                ),
                            ],
                        ),
                    ],
                ),
                SExpr::call(
                    "obj.new",
                    vec![
                        SExpr::string("type").erase_type(),
                        SExpr::string("search_results").erase_type(),
                        SExpr::string("query").erase_type(),
                        SExpr::call("std.arg", vec![SExpr::number(0).erase_type()]),
                        SExpr::string("notes").erase_type(),
                        SExpr::call("std.var", vec![SExpr::string("results").erase_type()]),
                    ],
                ),
            ],
        );
        storage_lock.add_verb(user_id, "search_notes", &search_verb)?;

        user_id
    };

    // Create test notes
    runtime.execute_verb(
        user_id,
        "create_note",
        vec![
            json!("Rust Programming"),
            json!("Learn about ownership and borrowing"),
        ],
        Some(user_id),
    )?;
    println!("✓ Created: Rust Programming");

    runtime.execute_verb(
        user_id,
        "create_note",
        vec![
            json!("JavaScript Guide"),
            json!("Understanding async/await patterns"),
        ],
        Some(user_id),
    )?;
    println!("✓ Created: JavaScript Guide");

    runtime.execute_verb(
        user_id,
        "create_note",
        vec![
            json!("Python Basics"),
            json!("Python is great for scripting"),
        ],
        Some(user_id),
    )?;
    println!("✓ Created: Python Basics");

    // Search for "rust" - should find 1 note
    let result =
        runtime.execute_verb(user_id, "search_notes", vec![json!("rust")], Some(user_id))?;
    assert_eq!(result["type"], "search_results");
    let notes = result["notes"].as_array().unwrap();
    assert_eq!(notes.len(), 1);
    assert_eq!(notes[0]["title"], "Rust Programming");
    println!("✓ Search 'rust': found {} note(s)", notes.len());

    // Search for "programming" - should find 1 note (in title)
    let result = runtime.execute_verb(
        user_id,
        "search_notes",
        vec![json!("programming")],
        Some(user_id),
    )?;
    let notes = result["notes"].as_array().unwrap();
    assert_eq!(notes.len(), 1);
    println!("✓ Search 'programming': found {} note(s)", notes.len());

    // Search for "patterns" - should find 1 note (in content)
    let result = runtime.execute_verb(
        user_id,
        "search_notes",
        vec![json!("patterns")],
        Some(user_id),
    )?;
    let notes = result["notes"].as_array().unwrap();
    assert_eq!(notes.len(), 1);
    assert_eq!(notes[0]["title"], "JavaScript Guide");
    println!("✓ Search 'patterns': found {} note(s)", notes.len());

    // Search for "guide" - should find 1 note
    let result = runtime.execute_verb(
        user_id,
        "search_notes",
        vec![json!("Guide")], // Test case-insensitive
        Some(user_id),
    )?;
    let notes = result["notes"].as_array().unwrap();
    assert_eq!(notes.len(), 1);
    println!(
        "✓ Search 'Guide' (case-insensitive): found {} note(s)",
        notes.len()
    );

    // Search for "xyz" - should find 0 notes
    let result =
        runtime.execute_verb(user_id, "search_notes", vec![json!("xyz")], Some(user_id))?;
    let notes = result["notes"].as_array().unwrap();
    assert_eq!(notes.len(), 0);
    println!("✓ Search 'xyz': found {} note(s)", notes.len());

    // Cleanup
    std::fs::remove_dir_all(&test_dir)?;

    println!("\n✅ All search tests passed!");
    Ok(())
}
