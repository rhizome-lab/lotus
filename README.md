# Viwo

**Viwo** (Virtual World) is a persistent, multiplayer, scriptable virtual world engine. It combines the interactive storytelling of MUDs/MOOs with modern web technologies and AI integration.

## Overview

Viwo allows players to explore a persistent world, interact with objects and NPCs, and extend the world through a built-in scripting language. The engine is designed to be modular, supporting multiple frontends (Web, TUI, Discord) connected to a central core server.

## Key Features

- **Scriptable World**: Everything in the world (rooms, items, NPCs) can be scripted using **ViwoScript**, a custom Lisp-like language.
- **Persistent State**: The world state is persisted in a SQLite database.
- **Multiplayer**: Real-time interaction with other players.
- **AI Integration**: Built-in support for AI-driven NPCs and content generation.
- **Multiple Frontends**:
  - **Web Client**: A modern, responsive web interface with a visual script editor.
  - **TUI**: A terminal user interface for a retro experience.
  - **Discord Bot**: Play directly from Discord.

## Architecture

The project is organized as a monorepo:

- **`packages/core`**: The heart of the engine. Handles the game loop, database, scripting interpreter, and WebSocket server.
- **`packages/client`**: A shared TypeScript client library for connecting to the core.
- **`packages/shared`**: Shared types and utilities (JSON-RPC protocol, etc.).
- **`apps/web`**: The main web frontend (React/Solid/Vite).
- **`apps/tui`**: The terminal user interface.
- **`apps/discord-bot`**: The Discord bot integration.
- **`plugins/ai`**: AI integration plugin.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (v1.0.0 or later)

### Installation

```bash
# Clone the repository
git clone https://github.com/pterror/viwo.git
cd viwo

# Install dependencies
bun install
```

### Running the Project

To start the core server and the web frontend in development mode:

```bash
# Start the core server (default port 8080)
bun run dev:core

# In a separate terminal, start the web client
bun run dev:web
```

Access the web client at `http://localhost:5173`.

## Scripting

Viwo uses a custom Lisp-like scripting language. Scripts are attached to entities as "verbs".

Example script (Greeting):

```lisp
(seq
  (let "name" (arg 0))
  (call (caller) "tell" (str.concat "Hello, " (var "name") "!"))
)
```

## Contributing

Check [TODO.md](./TODO.md) for current tasks and future plans.

## License

[MIT](LICENSE)
