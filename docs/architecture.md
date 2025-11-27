# Viwo Architecture

Viwo is a modern, web-based Multi-User Dungeon (MUD) engine built with TypeScript. It uses a monorepo structure to separate the core game logic, shared definitions, and frontend applications.

## Design Philosophy

Viwo is inspired by ChatMUD and LambdaMOO, focusing on a semantic world state, rich object interactions, and deep AI integration.

## Tech Stack

- **Runtime**: Bun
- **Database**: Bun:SQLite
- **Frontend**: SolidJS (Web), React + Ink (TUI)
- **AI**: Vercel AI SDK

## High-Level Overview

The system consists of several main parts:

1.  **Core Server (`packages/core`)**: The authoritative game server. It handles the game loop, entity management, scripting, and WebSocket connections.
2.  **Web Client (`apps/web`)**: A **SolidJS**-based frontend that connects to the Core via WebSockets.
3.  **TUI Client (`apps/tui`)**: A text-based UI built with **React + Ink**.
4.  **Discord Bot (`apps/discord-bot`)**: A bridge to play the game via Discord, built with **discord.js**.
5.  **CLI (`apps/cli`)**: A command-line interface for the game, using **minimist** and **chalk**.
6.  **Shared Library (`packages/shared`)**: Contains types, schemas, and utility functions shared between the Core and clients.

## Core Concepts

### Entities

Everything in the game world is an **Entity**. Entities are stored in a SQLite database and loaded into memory.

- **Kind**: Entities have a `kind` (e.g., `ROOM`, `ACTOR`, `ITEM`, `EXIT`, `ZONE`).
- **Props**: Entities have a JSON `props` field for flexible data storage (e.g., description, custom CSS, adjectives).
- **Location**: Entities form a hierarchy via `location_id`.
- **Inheritance**: Objects can inherit properties and methods from parent objects (Prototypes).

### Scripting

Viwo features a custom scripting language (Lisp-like S-expressions) for dynamic game logic.

- **Verbs**: Scripts attached to entities that define actions (e.g., `push`, `open`).
- **Interpreter**: A secure sandbox that executes scripts with access to game primitives.

## AI Integration

- **Text Generation**: For NPC dialogue, room descriptions, and dynamic responses.
- **Image Generation**: For character avatars and item icons.
- **Vercel AI SDK**: Used for abstracting LLM providers.

## Data Flow

1.  **Input**: User types a command in the Web Client.
2.  **Transport**: Command is sent as a JSON array (S-expression) via WebSocket.
3.  **Processing**:
    - **Plugin Check**: `PluginManager` checks if a plugin handles the command.
    - **Validation**: Core validates arguments using Zod schemas from `@viwo/shared`.
    - **Verb Search**: Core looks for a matching "verb" on the player, room, or target objects.
    - **Execution**: If a verb is found, the script is executed.
    - **Fallback**: If no verb is found, hardcoded commands (look, move, dig) are executed.
4.  **Output**: State updates (room description, inventory, messages) are sent back to the client.

## Directory Structure

- `apps/`
  - `web/`: The SolidJS frontend.
  - `tui/`: The React + Ink terminal UI.
  - `discord-bot/`: The Discord integration.
  - `cli/`: The command-line interface.
  - `server/`: Entry point for the standalone server.
- `packages/`
  - `core/`: The game server logic.
  - `shared/`: Shared types and schemas.
- `plugins/`
  - `ai/`: AI integration plugin.
