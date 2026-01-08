# Shared Package

The Shared package (`@lotus/shared`) contains utilities, types, and constants shared between the Core, Client, and other packages.

## JSON-RPC Types

The `src/jsonrpc.ts` file defines the TypeScript interfaces for the JSON-RPC 2.0 protocol used by Lotus.

### Key Interfaces

- **`JsonRpcRequest`**: Structure of a request sent to the server.
- **`JsonRpcResponse`**: Structure of a response from the server.
- **`JsonRpcNotification`**: Structure of a one-way message (server -> client).
- **`Entity`**: The base interface for all game objects.

## Constants

The `src/constants` directory contains shared game data, such as lists of adjectives used for procedural generation.
