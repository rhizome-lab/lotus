# Codebase Map

This document lists key files and directories to help navigation.
**Note**: All paths are relative to the project root.

## Core Server (`packages/core`)

- **`src/index.ts`**: The main entry point. Sets up WebSocket server, handles JSON-RPC connections, and the main command loop.
- **`src/repo.ts`**: Repository layer for Entity access (CRUD operations) and Verb management.
- **`src/db.ts`**: Database connection (SQLite) and schema setup.
- **`src/schema.ts`**: Database schema definitions.
- **`src/plugin.ts`**: Plugin system definitions (`PluginManager`, interfaces).
- **`src/scripting/interpreter.ts`**: The custom script interpreter (S-expression evaluator).
- **`src/scripting/lib/`**: Standard libraries for the scripting language (`core`, `list`, `object`, `string`, `time`).

## Client SDK (`packages/client`)

- **`src/client.ts`**: The main `LotusClient` class. Handles connection, state, and JSON-RPC.
- **`src/index.ts`**: Exports.

## Shared Library (`packages/shared`)

- **`src/jsonrpc.ts`**: JSON-RPC 2.0 type definitions and notification schemas.
- **`src/index.css`**: Global styles.

## Web Client (`apps/web`)

- **`src/App.tsx`**: Main SolidJS component. Handles WebSocket connection and global state.
- **`src/store/`**: State management.
- **`src/components/`**: UI components.

## TUI Client (`apps/tui`)

- **`src/index.tsx`**: Entry point for the Ink application.

## Other Apps

- **`apps/discord-bot/`**: Discord bot implementation.
- **`apps/cli/`**: Command-line interface.
- **`apps/server/`**: Standalone server entry point.

## Plugins

- **`plugins/ai/`**: AI integration features.

## Configuration

- **`package.json`**: Root configuration, workspaces definition.
- **`flake.nix`**: Nix development environment configuration.
