# Client SDK

The Client SDK (`@lotus/client`) provides a type-safe interface for connecting to the Lotus Core server via WebSockets. It handles the JSON-RPC protocol, state management, and event subscriptions.

## Installation

```bash
bun add @lotus/client
```

## Usage

### Connecting to the Server

```typescript
import { LotusClient, GameState } from "@lotus/client";

const client = new LotusClient("ws://localhost:8080");

// Subscribe to state changes
client.subscribe((state: GameState) => {
  if (state.isConnected) {
    console.log("Connected!");
  }
});

// Connect
client.connect();
```

### Executing Commands

To send a command to the server (e.g., "look", "go north"):

```typescript
client.execute("look");
client.execute("go", ["north"]);
```

### Handling Messages

To receive game messages (e.g., descriptions, chat):

```typescript
import { GameMessage } from "@lotus/client";

client.onMessage((msg: GameMessage) => {
  console.log(`[${msg.type}] ${msg.text}`);
});
```

## API Reference

### `LotusClient`

#### `constructor(url: string)`

Creates a new client instance.

#### `connect()`

Initiates the WebSocket connection.

#### `execute(command: string, args?: string[])`

Sends a command to the server.

#### `subscribe(callback: (state: GameState) => void)`

Subscribes to state changes (connection status, current room, etc.).

#### `onMessage(callback: (msg: GameMessage) => void)`

Registers a callback for incoming game messages.
