//! Viwo File Browser Server
//!
//! Sandboxed file browser with filesystem access, built on the Viwo engine.
//!
//! ## Usage
//!
//! ```sh
//! cargo run --bin filebrowser-server
//! # Or with custom port and sandbox root:
//! PORT=8080 FS_ROOT=./sandbox cargo run --bin filebrowser-server
//! ```

use std::path::PathBuf;
use std::sync::Arc;
use viwo_core::seed::{SeedSystem, seed_basic_world};
use viwo_runtime::ViwoRuntime;
use viwo_transport_websocket_jsonrpc::Server;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    // Get port from environment or use default
    let port = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);

    // Get filesystem sandbox root from environment or use default
    let fs_root = std::env::var("FS_ROOT").unwrap_or_else(|_| "./sandbox".to_string());

    tracing::info!("Starting Viwo File Browser Server...");
    tracing::info!("Filesystem sandbox root: {}", fs_root);

    // Create runtime (opens database connections)
    let runtime = Arc::new(ViwoRuntime::open("filebrowser.db")?);

    // Load the fs plugin
    runtime.load_plugin("target/debug/libviwo_plugin_fs.so", "fs")?;
    tracing::info!("Loaded fs plugin");

    // Get path to TypeScript entity definitions
    // Relative to workspace root: apps/filebrowser-server/src/definitions/
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let workspace_root = manifest_dir
        .parent() // crates/apps
        .and_then(|p| p.parent()) // crates
        .and_then(|p| p.parent()) // workspace root
        .expect("Failed to find workspace root");

    let definitions_path = workspace_root.join("apps/filebrowser-server/src/definitions");

    tracing::info!("Entity definitions path: {}", definitions_path.display());

    // Initialize seed system
    let seed_system = SeedSystem::new(definitions_path);

    // Seed the world
    {
        let storage = runtime.storage();
        let storage_lock = storage.lock().unwrap();

        // Seed basic world (Void, EntityBase, System)
        let entity_ids = seed_basic_world(&storage_lock, &seed_system)?;
        tracing::info!("Basic world seeded: {:?}", entity_ids);

        // Load and create FileBrowserBase
        let filebrowser_base_def =
            seed_system.load_definition("FileBrowser.ts", "FileBrowserBase", None)?;
        let filebrowser_base_id =
            seed_system.create_entity(&storage_lock, &filebrowser_base_def, None)?;
        tracing::info!("FileBrowserBase created with ID: {}", filebrowser_base_id);

        // Load and create FileBrowserUser (instance with fs_root set)
        let filebrowser_user_def =
            seed_system.load_definition("FileBrowser.ts", "FileBrowserUser", None)?;
        let user_id = seed_system.create_entity(
            &storage_lock,
            &filebrowser_user_def,
            Some(filebrowser_base_id),
        )?;
        tracing::info!("FileBrowserUser created with ID: {}", user_id);

        // Set the fs_root and cwd on the user entity
        let mut user_entity = storage_lock
            .get_entity(user_id)?
            .ok_or("Failed to get created user entity")?;

        if let serde_json::Value::Object(ref mut props) = user_entity.props {
            props.insert("fs_root".to_string(), serde_json::json!(fs_root));
            props.insert("cwd".to_string(), serde_json::json!(fs_root));
        }

        storage_lock.update_entity(user_id, user_entity.props)?;
        tracing::info!("Set fs_root and cwd to: {}", fs_root);
    }

    // Start WebSocket server
    let config = viwo_transport_websocket_jsonrpc::ServerConfig {
        host: "127.0.0.1".to_string(),
        port,
        db_path: "filebrowser.db".to_string(),
    };

    let server = Server::new(runtime, config);
    tracing::info!("Server listening on ws://127.0.0.1:{}", port);

    // Run server (blocks until shutdown)
    server.run().await?;

    Ok(())
}
