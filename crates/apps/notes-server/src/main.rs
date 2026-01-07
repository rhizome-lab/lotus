//! Viwo Notes Server
//!
//! Wiki-style notes with wikilinks and backlinks, built on the Viwo engine.
//!
//! ## Usage
//!
//! ```sh
//! cargo run --bin notes-server
//! # Or with custom port:
//! PORT=8081 cargo run --bin notes-server
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
        .unwrap_or(8081);

    tracing::info!("Starting Viwo Notes Server...");

    // Create runtime (opens database connections)
    let runtime = Arc::new(ViwoRuntime::open("notes.db")?);

    // Get path to TypeScript entity definitions
    // Relative to workspace root: apps/notes-server/src/definitions/
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let workspace_root = manifest_dir
        .parent() // crates/apps
        .and_then(|p| p.parent()) // crates
        .and_then(|p| p.parent()) // workspace root
        .expect("Failed to find workspace root");

    let definitions_path = workspace_root.join("apps/notes-server/src/definitions");

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

        // Load and create NotesBase
        let notes_base_def = seed_system.load_definition("Notes.ts", "NotesBase", None)?;
        let notes_base_id = seed_system.create_entity(&storage_lock, &notes_base_def, None)?;
        tracing::info!("NotesBase created with ID: {}", notes_base_id);

        // Load and create NotesUser (Notebook instance)
        let notes_user_def = seed_system.load_definition("Notes.ts", "NotesUser", None)?;
        let notebook_id =
            seed_system.create_entity(&storage_lock, &notes_user_def, Some(notes_base_id))?;
        tracing::info!("Notebook created with ID: {}", notebook_id);
    }

    // Start WebSocket server
    let config = viwo_transport_websocket_jsonrpc::ServerConfig {
        host: "127.0.0.1".to_string(),
        port,
        db_path: "notes.db".to_string(),
    };

    let server = Server::new(runtime, config);
    tracing::info!("Server listening on ws://127.0.0.1:{}", port);

    // Run server (blocks until shutdown)
    server.run().await?;

    Ok(())
}
