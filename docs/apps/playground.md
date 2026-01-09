# Playground

Interactive Reed playground. A web-based environment designed for writing, testing, and debugging Reed code in isolation.

## Overview

The Playground is a standalone application that allows developers and players to experiment with Reed without needing a running game server. It provides immediate feedback and visualization of script execution.

## Architecture

The Playground is built using **SolidJS** and **Vite**, similar to the Web Client.

### Key Integrations

- **`@lotus/web-editor`**: Integrates the specialized code editor components to provide a rich editing experience with syntax highlighting and block-based editing.
- **`@lotus/scripting`**: Uses the scripting package directly in the browser to compile and transpile Reed code on the client side.

## Usage

- **Scripting**: Write Reed code in the editor.
- **Testing**: Run scripts and see the output immediately.
- **Visual Editing**: Switch between code view and block view to understand the structure of the scripts.
