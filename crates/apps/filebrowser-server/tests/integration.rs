//! Integration tests for filebrowser-server
//!
//! Tests the full end-to-end flow:
//! - Server startup and initialization
//! - WebSocket connection
//! - JSON-RPC method calls (ping, get_entity, call_verb)
//! - Verb execution (look, go, open)

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::Message;

use rhizome_lotus_runtime::LotusRuntime;
use rhizome_lotus_transport_websocket_jsonrpc::{Server, ServerConfig};

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
async fn test_server_basic_operations() -> Result<(), Box<dyn std::error::Error>> {
    // Create temporary test directory
    let test_dir = std::env::temp_dir().join("bloom-test-filebrowser");
    let db_path = test_dir.join("test.db");
    let sandbox_path = test_dir.join("sandbox");

    // Clean up from previous runs
    let _ = std::fs::remove_dir_all(&test_dir);
    std::fs::create_dir_all(&sandbox_path)?;

    // Create test files in sandbox
    std::fs::write(sandbox_path.join("test.txt"), "Hello, World!")?;
    std::fs::create_dir(sandbox_path.join("subdir"))?;
    std::fs::write(sandbox_path.join("subdir/nested.txt"), "Nested file")?;

    // Create runtime
    let runtime = Arc::new(LotusRuntime::open(db_path.to_str().unwrap())?);

    // Load fs plugin
    let plugin_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .unwrap()
        .join("target/debug/liblotus_plugin_fs.so");
    runtime.load_plugin(plugin_path.to_str().unwrap(), "fs")?;

    // Create test entities manually (bypassing seed system to avoid EntityBase dependency)
    let user_id = {
        let storage = runtime.storage();
        let storage_lock = storage.lock().unwrap();

        // Create a base entity
        let base_id = storage_lock.create_entity(json!({"name": "FileBrowserBase"}), None)?;

        // Create user entity with necessary properties
        let user_id = storage_lock.create_entity(
            json!({
                "name": "FileBrowserUser",
                "fs_root": sandbox_path.to_str().unwrap(),
                "cwd": sandbox_path.to_str().unwrap(),
                "fs_cap": {
                    "owner_id": 0,  // Will be updated to actual user_id
                    "params": {
                        "path": sandbox_path.to_str().unwrap()
                    }
                }
            }),
            Some(base_id),
        )?;

        // Update fs_cap with correct owner_id
        let mut user_entity = storage_lock.get_entity(user_id)?.unwrap();
        if let serde_json::Value::Object(ref mut props) = user_entity.props {
            if let Some(serde_json::Value::Object(cap)) = props.get_mut("fs_cap") {
                cap.insert("owner_id".to_string(), json!(user_id));
            }
        }
        storage_lock.update_entity(user_id, user_entity.props)?;

        user_id
    };

    // Start server on random available port
    let port = 18080;
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

    // Test 2: Get entity
    let response = send_request(
        &mut ws_tx,
        &mut ws_rx,
        "get_entity",
        json!({"id": user_id}),
        2,
    )
    .await?;
    assert!(response["result"].is_object());
    assert_eq!(response["result"]["id"], user_id);
    assert_eq!(response["result"]["props"]["name"], "FileBrowserUser");
    println!("✓ Get entity test passed");

    // Cleanup
    server_handle.abort();
    std::fs::remove_dir_all(&test_dir)?;

    println!("\n✅ All integration tests passed!");
    Ok(())
}

/// Test file browser bookmark verbs
#[tokio::test]
async fn test_bookmark_operations() -> Result<(), Box<dyn std::error::Error>> {
    use rhizome_lotus_ir::SExpr;

    // Create temporary test directory
    let test_dir = std::env::temp_dir().join("bloom-test-fb-bookmarks");
    let db_path = test_dir.join("test.db");

    // Clean up from previous runs
    let _ = std::fs::remove_dir_all(&test_dir);
    std::fs::create_dir_all(&test_dir)?;

    // Create runtime
    let runtime = Arc::new(LotusRuntime::open(db_path.to_str().unwrap())?);

    // Create file browser user entity with bookmark verbs
    let user_id = {
        let storage = runtime.storage();
        let storage_lock = storage.lock().unwrap();

        // Create user entity
        let user_id = storage_lock.create_entity(
            serde_json::json!({
                "name": "FileBrowserUser",
                "cwd": "/home/user",
                "fs_root": "/home/user",
                "bookmarks": {}
            }),
            None,
        )?;

        // Add bookmark verb
        // Args: [name, path (optional - defaults to cwd)]
        let bookmark_verb = SExpr::call(
            "std.seq",
            vec![
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("name").erase_type(),
                        SExpr::call("std.arg", vec![SExpr::number(0).erase_type()]),
                    ],
                ),
                // Get path argument or default to cwd
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("target_path").erase_type(),
                        SExpr::call(
                            "bool.guard",
                            vec![
                                SExpr::call("std.arg", vec![SExpr::number(1).erase_type()]),
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
                                                SExpr::string("cwd").erase_type(),
                                            ],
                                        ),
                                        SExpr::string("/").erase_type(),
                                    ],
                                ),
                            ],
                        ),
                    ],
                ),
                // Get current bookmarks
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("bookmarks").erase_type(),
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
                                        SExpr::string("bookmarks").erase_type(),
                                    ],
                                ),
                                SExpr::call("obj.new", vec![]),
                            ],
                        ),
                    ],
                ),
                // Add new bookmark
                SExpr::call(
                    "obj.set",
                    vec![
                        SExpr::call("std.var", vec![SExpr::string("bookmarks").erase_type()]),
                        SExpr::call("std.var", vec![SExpr::string("name").erase_type()]),
                        SExpr::call("std.var", vec![SExpr::string("target_path").erase_type()]),
                    ],
                ),
                // Update entity
                SExpr::call(
                    "update",
                    vec![
                        SExpr::call("std.caller", vec![]),
                        SExpr::call(
                            "obj.new",
                            vec![
                                SExpr::list(vec![
                                    SExpr::string("bookmarks").erase_type(),
                                    SExpr::call(
                                        "std.var",
                                        vec![SExpr::string("bookmarks").erase_type()],
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
                        SExpr::string("bookmark_created").erase_type(),
                        SExpr::string("name").erase_type(),
                        SExpr::call("std.var", vec![SExpr::string("name").erase_type()]),
                        SExpr::string("path").erase_type(),
                        SExpr::call("std.var", vec![SExpr::string("target_path").erase_type()]),
                    ],
                ),
            ],
        );
        storage_lock.add_verb(user_id, "bookmark", &bookmark_verb)?;

        // Add bookmarks_list verb
        let bookmarks_list_verb = SExpr::call(
            "std.seq",
            vec![
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("bookmarks").erase_type(),
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
                                        SExpr::string("bookmarks").erase_type(),
                                    ],
                                ),
                                SExpr::call("obj.new", vec![]),
                            ],
                        ),
                    ],
                ),
                SExpr::call(
                    "obj.new",
                    vec![
                        SExpr::string("type").erase_type(),
                        SExpr::string("bookmarks").erase_type(),
                        SExpr::string("bookmarks").erase_type(),
                        SExpr::call("std.var", vec![SExpr::string("bookmarks").erase_type()]),
                    ],
                ),
            ],
        );
        storage_lock.add_verb(user_id, "bookmarks_list", &bookmarks_list_verb)?;

        // Add jump verb (navigate to bookmark)
        let jump_verb = SExpr::call(
            "std.seq",
            vec![
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("name").erase_type(),
                        SExpr::call("std.arg", vec![SExpr::number(0).erase_type()]),
                    ],
                ),
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("bookmarks").erase_type(),
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
                                        SExpr::string("bookmarks").erase_type(),
                                    ],
                                ),
                                SExpr::call("obj.new", vec![]),
                            ],
                        ),
                    ],
                ),
                // Check if bookmark exists
                SExpr::call(
                    "std.if",
                    vec![
                        SExpr::call(
                            "bool.not",
                            vec![SExpr::call(
                                "obj.has",
                                vec![
                                    SExpr::call(
                                        "std.var",
                                        vec![SExpr::string("bookmarks").erase_type()],
                                    ),
                                    SExpr::call(
                                        "std.var",
                                        vec![SExpr::string("name").erase_type()],
                                    ),
                                ],
                            )],
                        ),
                        SExpr::call(
                            "std.throw",
                            vec![SExpr::call(
                                "str.concat",
                                vec![
                                    SExpr::string("Bookmark not found: ").erase_type(),
                                    SExpr::call(
                                        "std.var",
                                        vec![SExpr::string("name").erase_type()],
                                    ),
                                ],
                            )],
                        ),
                    ],
                ),
                // Get path from bookmark
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("path").erase_type(),
                        SExpr::call(
                            "obj.get",
                            vec![
                                SExpr::call(
                                    "std.var",
                                    vec![SExpr::string("bookmarks").erase_type()],
                                ),
                                SExpr::call("std.var", vec![SExpr::string("name").erase_type()]),
                            ],
                        ),
                    ],
                ),
                // Update cwd
                SExpr::call(
                    "update",
                    vec![
                        SExpr::call("std.caller", vec![]),
                        SExpr::call(
                            "obj.new",
                            vec![
                                SExpr::list(vec![
                                    SExpr::string("cwd").erase_type(),
                                    SExpr::call(
                                        "std.var",
                                        vec![SExpr::string("path").erase_type()],
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
                        SExpr::string("jumped").erase_type(),
                        SExpr::string("name").erase_type(),
                        SExpr::call("std.var", vec![SExpr::string("name").erase_type()]),
                        SExpr::string("path").erase_type(),
                        SExpr::call("std.var", vec![SExpr::string("path").erase_type()]),
                    ],
                ),
            ],
        );
        storage_lock.add_verb(user_id, "jump", &jump_verb)?;

        // Add where verb (show current location)
        let where_verb = SExpr::call(
            "obj.new",
            vec![
                SExpr::string("type").erase_type(),
                SExpr::string("where").erase_type(),
                SExpr::string("path").erase_type(),
                SExpr::call(
                    "bool.guard",
                    vec![
                        SExpr::call(
                            "obj.get",
                            vec![
                                SExpr::call("entity", vec![SExpr::call("std.caller", vec![])]),
                                SExpr::string("cwd").erase_type(),
                            ],
                        ),
                        SExpr::string("/").erase_type(),
                    ],
                ),
            ],
        );
        storage_lock.add_verb(user_id, "where", &where_verb)?;

        user_id
    };

    // Test 1: Check initial location
    let result = runtime.execute_verb(user_id, "where", vec![], Some(user_id))?;
    assert_eq!(result["type"], "where");
    assert_eq!(result["path"], "/home/user");
    println!("✓ Initial location: {}", result["path"]);

    // Test 2: Create a bookmark for current directory
    let result = runtime.execute_verb(user_id, "bookmark", vec![json!("home")], Some(user_id))?;
    assert_eq!(result["type"], "bookmark_created");
    assert_eq!(result["name"], "home");
    assert_eq!(result["path"], "/home/user");
    println!("✓ Created bookmark 'home' -> {}", result["path"]);

    // Test 3: Create a bookmark with explicit path
    let result = runtime.execute_verb(
        user_id,
        "bookmark",
        vec![json!("projects"), json!("/home/user/projects")],
        Some(user_id),
    )?;
    assert_eq!(result["type"], "bookmark_created");
    assert_eq!(result["name"], "projects");
    assert_eq!(result["path"], "/home/user/projects");
    println!("✓ Created bookmark 'projects' -> {}", result["path"]);

    // Test 4: List bookmarks
    let result = runtime.execute_verb(user_id, "bookmarks_list", vec![], Some(user_id))?;
    assert_eq!(result["type"], "bookmarks");
    let bookmarks = &result["bookmarks"];
    assert_eq!(bookmarks["home"], "/home/user");
    assert_eq!(bookmarks["projects"], "/home/user/projects");
    println!(
        "✓ Bookmarks list: {} entries",
        bookmarks.as_object().unwrap().len()
    );

    // Test 5: Jump to bookmark
    let result = runtime.execute_verb(user_id, "jump", vec![json!("projects")], Some(user_id))?;
    assert_eq!(result["type"], "jumped");
    assert_eq!(result["path"], "/home/user/projects");
    println!("✓ Jumped to bookmark 'projects'");

    // Test 6: Verify location changed
    let result = runtime.execute_verb(user_id, "where", vec![], Some(user_id))?;
    assert_eq!(result["path"], "/home/user/projects");
    println!("✓ Current location verified: {}", result["path"]);

    // Cleanup
    std::fs::remove_dir_all(&test_dir)?;

    println!("\n✅ All bookmark tests passed!");
    Ok(())
}

/// Test file browser navigation verbs (simulated without fs plugin)
#[tokio::test]
async fn test_navigation_simulated() -> Result<(), Box<dyn std::error::Error>> {
    use rhizome_lotus_ir::SExpr;

    // Create temporary test directory
    let test_dir = std::env::temp_dir().join("bloom-test-fb-nav");
    let db_path = test_dir.join("test.db");

    // Clean up from previous runs
    let _ = std::fs::remove_dir_all(&test_dir);
    std::fs::create_dir_all(&test_dir)?;

    // Create runtime
    let runtime = Arc::new(LotusRuntime::open(db_path.to_str().unwrap())?);

    // Create file browser user entity with simulated navigation verbs
    let user_id = {
        let storage = runtime.storage();
        let storage_lock = storage.lock().unwrap();

        let user_id = storage_lock.create_entity(
            serde_json::json!({
                "name": "FileBrowserUser",
                "cwd": "/home/user",
                "fs_root": "/home",
                // Simulated file system structure
                "fs_structure": {
                    "/home": ["user"],
                    "/home/user": ["documents", "downloads", "projects"],
                    "/home/user/documents": ["notes.txt", "report.pdf"],
                    "/home/user/projects": ["project1", "project2"]
                }
            }),
            None,
        )?;

        // Add where verb
        let where_verb = SExpr::call(
            "obj.new",
            vec![
                SExpr::string("type").erase_type(),
                SExpr::string("where").erase_type(),
                SExpr::string("path").erase_type(),
                SExpr::call(
                    "bool.guard",
                    vec![
                        SExpr::call(
                            "obj.get",
                            vec![
                                SExpr::call("entity", vec![SExpr::call("std.caller", vec![])]),
                                SExpr::string("cwd").erase_type(),
                            ],
                        ),
                        SExpr::string("/").erase_type(),
                    ],
                ),
            ],
        );
        storage_lock.add_verb(user_id, "where", &where_verb)?;

        // Add simulated go verb (changes cwd)
        let go_verb = SExpr::call(
            "std.seq",
            vec![
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("path").erase_type(),
                        SExpr::call("std.arg", vec![SExpr::number(0).erase_type()]),
                    ],
                ),
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("cwd").erase_type(),
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
                                        SExpr::string("cwd").erase_type(),
                                    ],
                                ),
                                SExpr::string("/").erase_type(),
                            ],
                        ),
                    ],
                ),
                // Build new path
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("new_path").erase_type(),
                        SExpr::call(
                            "std.if",
                            vec![
                                SExpr::call(
                                    "bool.eq",
                                    vec![
                                        SExpr::call(
                                            "std.var",
                                            vec![SExpr::string("path").erase_type()],
                                        ),
                                        SExpr::string("..").erase_type(),
                                    ],
                                ),
                                // Go up one level
                                SExpr::call(
                                    "std.seq",
                                    vec![
                                        SExpr::call(
                                            "std.let",
                                            vec![
                                                SExpr::string("parts").erase_type(),
                                                SExpr::call(
                                                    "str.split",
                                                    vec![
                                                        SExpr::call(
                                                            "std.var",
                                                            vec![SExpr::string("cwd").erase_type()],
                                                        ),
                                                        SExpr::string("/").erase_type(),
                                                    ],
                                                ),
                                            ],
                                        ),
                                        SExpr::call(
                                            "list.pop",
                                            vec![SExpr::call(
                                                "std.var",
                                                vec![SExpr::string("parts").erase_type()],
                                            )],
                                        ),
                                        SExpr::call(
                                            "std.if",
                                            vec![
                                                SExpr::call(
                                                    "bool.eq",
                                                    vec![
                                                        SExpr::call(
                                                            "list.len",
                                                            vec![SExpr::call(
                                                                "std.var",
                                                                vec![
                                                                    SExpr::string("parts")
                                                                        .erase_type(),
                                                                ],
                                                            )],
                                                        ),
                                                        SExpr::number(0).erase_type(),
                                                    ],
                                                ),
                                                SExpr::string("/").erase_type(),
                                                SExpr::call(
                                                    "str.join",
                                                    vec![
                                                        SExpr::call(
                                                            "std.var",
                                                            vec![
                                                                SExpr::string("parts").erase_type(),
                                                            ],
                                                        ),
                                                        SExpr::string("/").erase_type(),
                                                    ],
                                                ),
                                            ],
                                        ),
                                    ],
                                ),
                                // Navigate to subdir
                                SExpr::call(
                                    "str.concat",
                                    vec![
                                        SExpr::call(
                                            "std.var",
                                            vec![SExpr::string("cwd").erase_type()],
                                        ),
                                        SExpr::string("/").erase_type(),
                                        SExpr::call(
                                            "std.var",
                                            vec![SExpr::string("path").erase_type()],
                                        ),
                                    ],
                                ),
                            ],
                        ),
                    ],
                ),
                // Update cwd
                SExpr::call(
                    "update",
                    vec![
                        SExpr::call("std.caller", vec![]),
                        SExpr::call(
                            "obj.new",
                            vec![
                                SExpr::list(vec![
                                    SExpr::string("cwd").erase_type(),
                                    SExpr::call(
                                        "std.var",
                                        vec![SExpr::string("new_path").erase_type()],
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
                        SExpr::string("navigated").erase_type(),
                        SExpr::string("path").erase_type(),
                        SExpr::call("std.var", vec![SExpr::string("new_path").erase_type()]),
                    ],
                ),
            ],
        );
        storage_lock.add_verb(user_id, "go", &go_verb)?;

        // Add back verb (go up one directory)
        let back_verb = SExpr::call(
            "call",
            vec![
                SExpr::call("std.this", vec![]),
                SExpr::string("go").erase_type(),
                SExpr::string("..").erase_type(),
            ],
        );
        storage_lock.add_verb(user_id, "back", &back_verb)?;

        // Add simulated look verb (returns contents from fs_structure)
        let look_verb = SExpr::call(
            "std.seq",
            vec![
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("cwd").erase_type(),
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
                                        SExpr::string("cwd").erase_type(),
                                    ],
                                ),
                                SExpr::string("/").erase_type(),
                            ],
                        ),
                    ],
                ),
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("fs_structure").erase_type(),
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
                                        SExpr::string("fs_structure").erase_type(),
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
                        SExpr::string("entries").erase_type(),
                        SExpr::call(
                            "bool.guard",
                            vec![
                                SExpr::call(
                                    "obj.get",
                                    vec![
                                        SExpr::call(
                                            "std.var",
                                            vec![SExpr::string("fs_structure").erase_type()],
                                        ),
                                        SExpr::call(
                                            "std.var",
                                            vec![SExpr::string("cwd").erase_type()],
                                        ),
                                    ],
                                ),
                                SExpr::call("list.new", vec![]),
                            ],
                        ),
                    ],
                ),
                SExpr::call(
                    "obj.new",
                    vec![
                        SExpr::string("type").erase_type(),
                        SExpr::string("directory_listing").erase_type(),
                        SExpr::string("path").erase_type(),
                        SExpr::call("std.var", vec![SExpr::string("cwd").erase_type()]),
                        SExpr::string("entries").erase_type(),
                        SExpr::call("std.var", vec![SExpr::string("entries").erase_type()]),
                    ],
                ),
            ],
        );
        storage_lock.add_verb(user_id, "look", &look_verb)?;

        user_id
    };

    // Test 1: Check initial location
    let result = runtime.execute_verb(user_id, "where", vec![], Some(user_id))?;
    assert_eq!(result["path"], "/home/user");
    println!("✓ Initial location: {}", result["path"]);

    // Test 2: Look at current directory
    let result = runtime.execute_verb(user_id, "look", vec![], Some(user_id))?;
    assert_eq!(result["type"], "directory_listing");
    assert_eq!(result["path"], "/home/user");
    let entries = result["entries"].as_array().unwrap();
    assert!(entries.contains(&json!("documents")));
    assert!(entries.contains(&json!("projects")));
    println!("✓ Directory listing: {} entries", entries.len());

    // Test 3: Navigate to documents
    let result = runtime.execute_verb(user_id, "go", vec![json!("documents")], Some(user_id))?;
    assert_eq!(result["type"], "navigated");
    assert_eq!(result["path"], "/home/user/documents");
    println!("✓ Navigated to: {}", result["path"]);

    // Test 4: Look at documents directory
    let result = runtime.execute_verb(user_id, "look", vec![], Some(user_id))?;
    let entries = result["entries"].as_array().unwrap();
    assert!(entries.contains(&json!("notes.txt")));
    assert!(entries.contains(&json!("report.pdf")));
    println!("✓ Documents contents: {:?}", entries);

    // Test 5: Go back to parent
    let result = runtime.execute_verb(user_id, "back", vec![], Some(user_id))?;
    assert_eq!(result["path"], "/home/user");
    println!("✓ Back to: {}", result["path"]);

    // Test 6: Navigate to projects
    runtime.execute_verb(user_id, "go", vec![json!("projects")], Some(user_id))?;
    let result = runtime.execute_verb(user_id, "look", vec![], Some(user_id))?;
    let entries = result["entries"].as_array().unwrap();
    assert!(entries.contains(&json!("project1")));
    println!("✓ Projects contents: {:?}", entries);

    // Cleanup
    std::fs::remove_dir_all(&test_dir)?;

    println!("\n✅ All navigation tests passed!");
    Ok(())
}

/// Test file metadata operations (tags, annotations)
#[tokio::test]
async fn test_file_metadata() -> Result<(), Box<dyn std::error::Error>> {
    use rhizome_lotus_ir::SExpr;

    // Create temporary test directory
    let test_dir = std::env::temp_dir().join("bloom-test-fb-metadata");
    let db_path = test_dir.join("test.db");

    // Clean up from previous runs
    let _ = std::fs::remove_dir_all(&test_dir);
    std::fs::create_dir_all(&test_dir)?;

    // Create runtime
    let runtime = Arc::new(LotusRuntime::open(db_path.to_str().unwrap())?);

    // Create file browser user entity with metadata verbs
    let user_id = {
        let storage = runtime.storage();
        let storage_lock = storage.lock().unwrap();

        let user_id = storage_lock.create_entity(
            serde_json::json!({
                "name": "FileBrowserUser",
                "cwd": "/home/user",
                "file_metadata": {}
            }),
            None,
        )?;

        // Add tag verb
        let tag_verb = SExpr::call(
            "std.seq",
            vec![
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("path").erase_type(),
                        SExpr::call("std.arg", vec![SExpr::number(0).erase_type()]),
                    ],
                ),
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("tag_name").erase_type(),
                        SExpr::call("std.arg", vec![SExpr::number(1).erase_type()]),
                    ],
                ),
                // Get metadata map
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("metadata").erase_type(),
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
                                        SExpr::string("file_metadata").erase_type(),
                                    ],
                                ),
                                SExpr::call("obj.new", vec![]),
                            ],
                        ),
                    ],
                ),
                // Get or create file data
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("file_data").erase_type(),
                        SExpr::call(
                            "std.if",
                            vec![
                                SExpr::call(
                                    "obj.has",
                                    vec![
                                        SExpr::call(
                                            "std.var",
                                            vec![SExpr::string("metadata").erase_type()],
                                        ),
                                        SExpr::call(
                                            "std.var",
                                            vec![SExpr::string("path").erase_type()],
                                        ),
                                    ],
                                ),
                                SExpr::call(
                                    "obj.get",
                                    vec![
                                        SExpr::call(
                                            "std.var",
                                            vec![SExpr::string("metadata").erase_type()],
                                        ),
                                        SExpr::call(
                                            "std.var",
                                            vec![SExpr::string("path").erase_type()],
                                        ),
                                    ],
                                ),
                                SExpr::call(
                                    "obj.new",
                                    vec![
                                        SExpr::string("tags").erase_type(),
                                        SExpr::call("list.new", vec![]),
                                        SExpr::string("annotations").erase_type(),
                                        SExpr::call("list.new", vec![]),
                                    ],
                                ),
                            ],
                        ),
                    ],
                ),
                // Get tags array
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("tags").erase_type(),
                        SExpr::call(
                            "bool.guard",
                            vec![
                                SExpr::call(
                                    "obj.get",
                                    vec![
                                        SExpr::call(
                                            "std.var",
                                            vec![SExpr::string("file_data").erase_type()],
                                        ),
                                        SExpr::string("tags").erase_type(),
                                    ],
                                ),
                                SExpr::call("list.new", vec![]),
                            ],
                        ),
                    ],
                ),
                // Add tag if not already present
                SExpr::call(
                    "std.if",
                    vec![
                        SExpr::call(
                            "bool.not",
                            vec![SExpr::call(
                                "list.includes",
                                vec![
                                    SExpr::call(
                                        "std.var",
                                        vec![SExpr::string("tags").erase_type()],
                                    ),
                                    SExpr::call(
                                        "std.var",
                                        vec![SExpr::string("tag_name").erase_type()],
                                    ),
                                ],
                            )],
                        ),
                        SExpr::call(
                            "list.push",
                            vec![
                                SExpr::call("std.var", vec![SExpr::string("tags").erase_type()]),
                                SExpr::call(
                                    "std.var",
                                    vec![SExpr::string("tag_name").erase_type()],
                                ),
                            ],
                        ),
                    ],
                ),
                // Update file_data
                SExpr::call(
                    "obj.set",
                    vec![
                        SExpr::call("std.var", vec![SExpr::string("file_data").erase_type()]),
                        SExpr::string("tags").erase_type(),
                        SExpr::call("std.var", vec![SExpr::string("tags").erase_type()]),
                    ],
                ),
                // Update metadata
                SExpr::call(
                    "obj.set",
                    vec![
                        SExpr::call("std.var", vec![SExpr::string("metadata").erase_type()]),
                        SExpr::call("std.var", vec![SExpr::string("path").erase_type()]),
                        SExpr::call("std.var", vec![SExpr::string("file_data").erase_type()]),
                    ],
                ),
                // Update entity
                SExpr::call(
                    "update",
                    vec![
                        SExpr::call("std.caller", vec![]),
                        SExpr::call(
                            "obj.new",
                            vec![
                                SExpr::list(vec![
                                    SExpr::string("file_metadata").erase_type(),
                                    SExpr::call(
                                        "std.var",
                                        vec![SExpr::string("metadata").erase_type()],
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
                        SExpr::string("tag_added").erase_type(),
                        SExpr::string("path").erase_type(),
                        SExpr::call("std.var", vec![SExpr::string("path").erase_type()]),
                        SExpr::string("tag").erase_type(),
                        SExpr::call("std.var", vec![SExpr::string("tag_name").erase_type()]),
                    ],
                ),
            ],
        );
        storage_lock.add_verb(user_id, "tag", &tag_verb)?;

        // Add tags verb (get tags for a path)
        let tags_verb = SExpr::call(
            "std.seq",
            vec![
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("path").erase_type(),
                        SExpr::call("std.arg", vec![SExpr::number(0).erase_type()]),
                    ],
                ),
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("metadata").erase_type(),
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
                                        SExpr::string("file_metadata").erase_type(),
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
                        SExpr::string("file_data").erase_type(),
                        SExpr::call(
                            "std.if",
                            vec![
                                SExpr::call(
                                    "obj.has",
                                    vec![
                                        SExpr::call(
                                            "std.var",
                                            vec![SExpr::string("metadata").erase_type()],
                                        ),
                                        SExpr::call(
                                            "std.var",
                                            vec![SExpr::string("path").erase_type()],
                                        ),
                                    ],
                                ),
                                SExpr::call(
                                    "obj.get",
                                    vec![
                                        SExpr::call(
                                            "std.var",
                                            vec![SExpr::string("metadata").erase_type()],
                                        ),
                                        SExpr::call(
                                            "std.var",
                                            vec![SExpr::string("path").erase_type()],
                                        ),
                                    ],
                                ),
                                SExpr::call(
                                    "obj.new",
                                    vec![
                                        SExpr::string("tags").erase_type(),
                                        SExpr::call("list.new", vec![]),
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
                        SExpr::string("tags").erase_type(),
                        SExpr::string("path").erase_type(),
                        SExpr::call("std.var", vec![SExpr::string("path").erase_type()]),
                        SExpr::string("tags").erase_type(),
                        SExpr::call(
                            "bool.guard",
                            vec![
                                SExpr::call(
                                    "obj.get",
                                    vec![
                                        SExpr::call(
                                            "std.var",
                                            vec![SExpr::string("file_data").erase_type()],
                                        ),
                                        SExpr::string("tags").erase_type(),
                                    ],
                                ),
                                SExpr::call("list.new", vec![]),
                            ],
                        ),
                    ],
                ),
            ],
        );
        storage_lock.add_verb(user_id, "tags", &tags_verb)?;

        user_id
    };

    // Test 1: Add a tag to a file
    let result = runtime.execute_verb(
        user_id,
        "tag",
        vec![json!("/home/user/notes.txt"), json!("important")],
        Some(user_id),
    )?;
    assert_eq!(result["type"], "tag_added");
    assert_eq!(result["tag"], "important");
    println!("✓ Added tag 'important' to notes.txt");

    // Test 2: Add another tag
    runtime.execute_verb(
        user_id,
        "tag",
        vec![json!("/home/user/notes.txt"), json!("work")],
        Some(user_id),
    )?;
    println!("✓ Added tag 'work' to notes.txt");

    // Test 3: Get tags for file
    let result = runtime.execute_verb(
        user_id,
        "tags",
        vec![json!("/home/user/notes.txt")],
        Some(user_id),
    )?;
    assert_eq!(result["type"], "tags");
    let tags = result["tags"].as_array().unwrap();
    assert!(tags.contains(&json!("important")));
    assert!(tags.contains(&json!("work")));
    println!("✓ Tags for notes.txt: {:?}", tags);

    // Test 4: Add tag to another file
    runtime.execute_verb(
        user_id,
        "tag",
        vec![json!("/home/user/report.pdf"), json!("important")],
        Some(user_id),
    )?;
    println!("✓ Added tag 'important' to report.pdf");

    // Test 5: Verify tags are separate per file
    let result = runtime.execute_verb(
        user_id,
        "tags",
        vec![json!("/home/user/report.pdf")],
        Some(user_id),
    )?;
    let tags = result["tags"].as_array().unwrap();
    assert_eq!(tags.len(), 1);
    assert!(tags.contains(&json!("important")));
    assert!(!tags.contains(&json!("work")));
    println!("✓ Tags for report.pdf: {:?}", tags);

    // Cleanup
    std::fs::remove_dir_all(&test_dir)?;

    println!("\n✅ All metadata tests passed!");
    Ok(())
}
