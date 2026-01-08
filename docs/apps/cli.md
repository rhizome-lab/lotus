# CLI Client

The CLI Client (`apps/cli`) is a lightweight, terminal-based client for connecting to the Lotus game server. It allows you to play the game directly from your command line.

## Features

- **Direct Connection**: Connects to the local Lotus Core server via WebSockets.
- **Color Support**: Displays game messages with color coding (blue for standard messages, red for errors).
- **Readline Interface**: Provides a standard input prompt for typing commands.

## Usage

To start the CLI client:

1.  Ensure the Lotus Core server is running (`apps/server`).
2.  Run the client:

    ```bash
    cd apps/cli
    bun run start
    ```

### Options

- `--color=off` or `--no-color`: Disable colored output.

## Architecture

The client uses the `@lotus/client` SDK to handle the WebSocket connection and state management.

- **`LotusClient`**: Manages the connection to `ws://localhost:8080`.
- **`readline`**: Handles user input and command parsing.
- **`chalk`**: Handles terminal styling.
