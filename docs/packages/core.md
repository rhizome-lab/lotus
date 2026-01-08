# Core Package

The core engine of Lotus. Contains the fundamental logic for the game world, including the object model, database persistence layer, and runtime environment.

## Overview

This package is the heart of the Lotus server. It manages the lifecycle of game entities, handles player commands, and executes game logic. It is designed to be modular and extensible.

## Key Components

- **`src/repo.ts`**: The Database Persistence Layer. It handles Create, Read, Update, and Delete (CRUD) operations for game entities, ensuring state is saved and retrieved correctly.
- **`src/runtime/`**: The Runtime Environment. This directory contains the logic for the game loop, command processing, and the execution context for scripts.
- **`src/scheduler.ts`**: The Scheduler. It manages timed events and background tasks, allowing the game world to be dynamic and responsive.
- **`src/plugin.ts`**: The Plugin Manager. It facilitates the loading and management of plugins, allowing for easy extension of the game's functionality.
- **`src/index.ts`**: The Entry Point. It sets up the server, initializes the core components, and handles incoming WebSocket connections.
