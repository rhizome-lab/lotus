# Server

The core Viwo backend server.

## Overview

This application runs the main game loop, handles WebSocket connections from clients, and manages the state of the Viwo world. It is the central hub that all other clients connect to.

## Contents

- **src/index.ts**: Server entry point and initialization.
- **src/routes**: HTTP API route definitions.
- **src/socket**: WebSocket event handlers and connection management.

## Usage

Start the server in development mode:

```bash
bun run dev
```
