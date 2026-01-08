# Server

The Server (`apps/server`) is the main entry point for the Lotus game engine. It initializes the core systems, loads plugins, and starts the WebSocket server.

## Overview

The server application is responsible for:

1.  **Plugin Loading**: Initializing and registering plugins (e.g., AI, Memory).
2.  **Scheduler**: Starting the game loop scheduler.
3.  **Seeding**: Ensuring the initial game world exists (via `seed()`).
4.  **Networking**: Starting the WebSocket server to accept client connections.

## Configuration

The server configuration is currently defined in `src/index.ts`.

### Default Plugins

- **`AiPlugin`**: Enables AI-driven features.
- **`MemoryPlugin`**: Enables vector-based memory storage.

### Port

The server listens on port `8080` by default.

## Running the Server

To start the server locally:

```bash
cd apps/server
bun run dev
```

This will:

- Initialize the database (`world.sqlite` in `packages/core`).
- Start the WebSocket server on `ws://localhost:8080`.
