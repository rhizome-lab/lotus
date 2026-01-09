# Lotus

**Lotus** is a persistent, multiplayer, scriptable virtual world engine. It combines the interactive storytelling of MUDs/MOOs with modern web technologies and AI integration.

## Overview

Lotus allows players to explore a persistent world, interact with objects and NPCs, and extend the world through a built-in scripting language. The engine is designed to be modular, supporting multiple frontends (Web, TUI, Discord) connected to a Rust-powered server.

## Key Features

- **Scriptable World**: Everything in the world (rooms, items, NPCs) can be scripted using **Reed**, an S-expression language using JSON syntax.
- **Persistent State**: The world state is persisted in a SQLite database.
- **Multiplayer**: Real-time interaction with other players via WebSockets.
- **AI Integration**: Built-in plugins for AI-driven NPCs and content generation.
- **LuaJIT Execution**: Scripts compile to Lua for high-performance execution.
- **Multiple Frontends**:
  - **Web Client**: A modern, responsive web interface.
  - **TUI**: A terminal user interface for a retro experience.
  - **Discord Bot**: Play directly from Discord.

## Architecture

The project is organized as a monorepo with Rust backend and TypeScript frontends:

### Rust Backend (`crates/`)

- **`lotus-ir`**: S-expression types and validation (the IR format)
- **`lotus-core`**: Entity system, capabilities, SQLite storage
- **`lotus-runtime`**: LuaJIT integration for script execution
- **`lotus-cli`**: CLI binary (`lotus`)
- **`syntax/typescript`**: TypeScript → S-expression transpiler
- **`runtime/luajit`**: S-expression → Lua codegen
- **`transport/websocket-jsonrpc`**: WebSocket server with JSON-RPC
- **`plugins/*`**: Native Lua C API plugins (ai, fs, net, sqlite, procgen, vector, memory)

### TypeScript Frontends (`apps/`, `packages/`)

- **`packages/client`**: Shared WebSocket client library for connecting to servers
- **`packages/shared`**: Shared types (JSON-RPC protocol)
- **`apps/web`**: Main web frontend (SolidJS/Vite)
- **`apps/tui`**: Terminal user interface
- **`apps/discord-bot`**: Discord bot integration
- **`apps/notes`**: Wiki-style notes app
- **`apps/filebrowser`**: File browser app

## Getting Started

> **Note**: Pre-built binaries are not yet available. For now, you'll need to build from source.

### Prerequisites (Development)

- [Rust](https://rustup.rs/) (latest stable) — builds the server and game engine
- [Bun](https://bun.sh/) (v1.0.0+) — builds the web/TUI/Discord clients

Scripts are written in TypeScript and compile down to Lua internally — you don't need to know Lua.

### Installation

```bash
# Clone the repository
git clone https://github.com/rhizome-lab/lotus.git
cd lotus

# Install TypeScript dependencies
bun install

# Build Rust backend
cargo build --release
```

### Running the Project

```bash
# Start the notes server (Rust)
cargo run -p notes-server

# In a separate terminal, start the web client
bun run dev:notes
```

Access the notes app at `http://localhost:3004`.

## Scripting

Lotus uses **Reed**, an S-expression language that uses JSON as its syntax. Scripts are transpiled from TypeScript to S-expressions, then compiled to Lua for execution.

Example script (Greeting) represented in JSON:

```json
["std.seq",
  ["std.let", "name", ["std.arg", 0]],
  ["game.call", ["std.caller"], "tell", ["str.concat", "Hello, ", ["std.var", "name"], "!"]]
]
```

The same script in TypeScript:

```typescript
const name = args[0];
caller.tell("Hello, " + name + "!");
```

## Contributing

Check [TODO.md](./TODO.md) for current tasks and future plans.

## License

[MIT](LICENSE)
