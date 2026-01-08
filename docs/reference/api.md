# Lotus API Specification

Lotus uses **JSON-RPC 2.0** over WebSockets for communication between the Core Server and Clients (Web, TUI, CLI).

> **Note**: The `@lotus/client` package provides a type-safe TypeScript SDK that implements this protocol. It is recommended to use this SDK for building new frontends.

## Protocol Basics

All messages are JSON objects.

### Request

```json
{
  "jsonrpc": "2.0",
  "method": "method_name",
  "params": [...],
  "id": 1
}
```

### Response (Success)

```json
{
  "jsonrpc": "2.0",
  "result": { ... },
  "id": 1
}
```

### Response (Error)

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32xxx,
    "message": "Error message"
  },
  "id": 1
}
```

### Notification (Server -> Client)

```json
{
  "jsonrpc": "2.0",
  "method": "notification_name",
  "params": { ... }
}
```

## Methods (Client -> Server)

### `execute`

Executes a command (verb) on behalf of the player.

- **Params**: `[command, ...args]` (Array of strings)
- **Result**: `{ "status": "ok" }`
- **Error**: Returns error if verb not found or execution fails.

Example:

```json
{
  "jsonrpc": "2.0",
  "method": "execute",
  "params": ["look"],
  "id": 1
}
```

### `get_opcodes`

Retrieves metadata for all available scripting opcodes. Used for syntax highlighting and autocompletion.

- **Params**: `[]`
- **Result**: `OpcodeMetadata[]`

## Notifications (Server -> Client)

### `message`

Displays a text message to the user.

- **Params**:
  - `type`: "info" | "error"
  - `text`: The message content.

```json
{
  "jsonrpc": "2.0",
  "method": "message",
  "params": {
    "type": "info",
    "text": "You see a rusty sword."
  }
}
```

### `update`

Updates the client's local state of entities.

- **Params**:
  - `entities`: Array of `Entity` objects.

```json
{
  "jsonrpc": "2.0",
  "method": "update",
  "params": {
    "entities": [
      { "id": 1, "name": "The Void", "description": "..." },
      { "id": 2, "name": "Rusty Sword", "location": 1 }
    ]
  }
}
```

### `player_id`

Sets the current player's entity ID. Sent on connection.

- **Params**:
  - `playerId`: The ID of the player entity.

### `room_id`

Updates the current room ID (where the player is located).

- **Params**:
  - `roomId`: The ID of the room entity.

### `stream_start`

Indicates the start of a streamed response (e.g., from an AI agent).

- **Params**:
  - `streamId`: Unique ID for the stream.

### `stream_chunk`

Contains a chunk of text for an active stream.

- **Params**:
  - `streamId`: The ID of the stream.
  - `chunk`: The text content.

### `stream_end`

Indicates the end of a stream.

- **Params**:
  - `streamId`: The ID of the stream.

## Types

### Entity

```typescript
interface Entity {
  id: number;
  [key: string]: unknown; // Dynamic properties
}
```
