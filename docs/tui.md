# Text User Interface (TUI)

The Viwo TUI is a terminal-based interface for interacting with the Viwo world. It provides a lightweight, keyboard-centric way to connect to the server.

## Overview

The TUI is built using [Ink](https://github.com/vadimdemedes/ink), which allows building command-line apps using React. It connects to the Viwo server via WebSocket, similar to the web frontend.

## Features

- **Terminal-based**: Runs entirely in the terminal.
- **React-based**: Built with React components using Ink.
- **Real-time**: Connects to the server via WebSocket for real-time updates.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) runtime

### Installation

The TUI is part of the Viwo monorepo. Ensure you have installed dependencies at the root:

```bash
bun install
```

### Running the TUI

To start the TUI in development mode:

```bash
cd apps/tui
bun run dev
```

This will launch the TUI application in your terminal.

## Architecture

The TUI application is located in `apps/tui`.

- **`src/index.tsx`**: The entry point of the application. It sets up the Ink render process.
- **`src/App.tsx`**: The main application component. It handles the WebSocket connection and renders the UI.
- **`src/components/`**: Contains reusable UI components.

## Development

The TUI uses `ink` for rendering. When developing, you can use standard React patterns.

- **Layout**: Use `<Box>` for layout (flexbox).
- **Text**: Use `<Text>` for displaying text.
- **Input**: Use `ink-text-input` for user input.

To run the TUI with type checking:

```bash
bun run typecheck
```
