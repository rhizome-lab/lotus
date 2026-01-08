# Client Package

Client-side SDK for connecting to Lotus. Provides libraries and utilities for building custom clients that interact with the Lotus server.

## Overview

The Client package abstracts the complexity of WebSocket management and JSON-RPC communication, providing a clean API for developers to build custom frontends or bots for Lotus.

## Key Classes

### `LotusClient`

The main entry point for the SDK. It manages the WebSocket connection, handles automatic reconnection, and routes incoming messages.

- **Connection Management**: Handles connecting, disconnecting, and automatic reconnection strategies.
- **JSON-RPC**: Provides methods to send requests (`execute`, `plugin_rpc`) and handle responses.
- **State Management**: Maintains a local cache of the game state (entities, messages) and provides subscription methods for updates.

## Usage

```typescript
import { LotusClient } from "@lotus/client";

const client = new LotusClient("ws://localhost:8080");

// Subscribe to state updates
client.subscribe((state) => {
  console.log("Current Room:", state.roomId);
});

// Connect to server
client.connect();

// Execute a command
await client.execute("look", []);
```
