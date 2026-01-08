# Text User Interface (TUI)

The Lotus TUI is a terminal-based interface for interacting with the Lotus world. It provides a lightweight, keyboard-centric way to connect to the server.

## Overview

The TUI is built using [Ink](https://github.com/vadimdemedes/ink), which allows building command-line apps using React. It connects to the Lotus server via WebSocket, similar to the web frontend.

## Features

- **Terminal-based**: Runs entirely in the terminal.
- **React-based**: Built with React components using Ink.
- **Real-time**: Connects to the server via WebSocket for real-time updates.
- **Script Editor**: Built-in multi-line script editor with syntax highlighting and AI completion.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) runtime

### Installation

The TUI is part of the Lotus monorepo. Ensure you have installed dependencies at the root:

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
- **`src/components/Editor.tsx`**: The multi-line script editor component.
- **`src/components/`**: Contains reusable UI components.

## Development

The TUI uses `ink` for rendering. When developing, you can use standard React patterns.

- **Layout**: Use `<Box>` for layout (flexbox).
- **Text**: Use `<Text>` for displaying text.
- **Input**: Use `ink-text-input` for user input.

## Script Editor

The TUI includes a powerful script editor that allows you to modify entity scripts directly from the terminal.

### Usage

1.  **Open Editor**: Type `edit <script_id>` to open the editor for a specific script.
2.  **Navigation**: Use Arrow keys to move the cursor.
3.  **Editing**: Type to insert text. Use Backspace/Delete to remove text. Enter creates a new line.
4.  **AI Completion**: Press `Tab` to request AI code completion (smart generation).
5.  **Local Completion**: Press `Ctrl+Space` for fast, local opcode completion (standard library).
6.  **Save**: Press `Ctrl+S` to save changes to the server.
7.  **Exit**: Press `Esc` or `Ctrl+C` to close the editor without saving (unless already saved).
