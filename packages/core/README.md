# Core Package

The core engine of Viwo.

## Overview

This package contains the fundamental logic for the game world. It includes the object model, database persistence layer, and the runtime environment that executes game logic.

## Contents

- **src/repo.ts**: Data repository for object persistence.
- **src/runtime**: The runtime environment and game loop.
- **src/index.ts**: Core exports for the server application.

## Usage

This package is primarily used by the `apps/server` application to instantiate and run the game world.
