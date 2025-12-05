# Development Guide

Welcome to the Viwo development guide! This document will help you get set up and contributing to the project.

## Getting Started

### Prerequisites

- **[Bun](https://bun.sh/)**: Viwo is built on the Bun runtime. Ensure you have the latest version installed.

### Installation

1.  Clone the repository:

    ```bash
    git clone https://github.com/pterror/viwo.git
    cd viwo
    ```

2.  Install dependencies:
    ```bash
    bun install
    ```

### Project Structure

Viwo is a monorepo managed by Bun workspaces.

- **`apps/`**: Deployable applications.
  - `server`: The core game server.
  - `web`: The web frontend.
  - `cli`: The terminal client.
  - `discord-bot`: The Discord integration.
- **`packages/`**: Shared libraries.
  - `core`: The game engine logic.
  - `scripting`: The ViwoScript compiler and interpreter.
  - `client`: The TypeScript SDK.
  - `shared`: Shared types and utilities.
- **`plugins/`**: Optional game features.
  - `ai`: LLM integration.
  - `memory`: Vector memory system.

### Running Tests

To run tests across the entire workspace:

```bash
bun test
```

To run tests for a specific package:

```bash
bun test --filter @viwo/core
```

## Building the Documentation

The documentation site is built using [VitePress](https://vitepress.dev/).

### Local Development

To start the documentation server locally with hot reload:

```bash
cd docs
npm run dev
# or
bun run dev
```

This will start the VitePress dev server at `http://localhost:5173`.

### Building for Production

To build the documentation for production, you should use the root workspace script. This script ensures that the **Playground** application is also built and integrated into the documentation site.

From the root directory:

```bash
npm run build:docs
# or
bun run build:docs
```

This command performs the following steps:

1. Builds the `@viwo/docs` package (VitePress site).
2. Builds the `@viwo/playground` package.
3. Copies the playground build output to `docs/.vitepress/dist/playground`.

### Previewing the Build

To preview the production build locally:

```bash
npm run preview:docs
# or
bun run preview:docs
```

## Build Commands

The following packages and applications have specific build steps. All other packages are designed to be run directly with Bun or imported as source.

| Package               | Command         | Description                                   |
| :-------------------- | :-------------- | :-------------------------------------------- |
| `apps/web`            | `npm run build` | Builds the main web application using Vite.   |
| `apps/playground`     | `npm run build` | Builds the playground application using Vite. |
| `packages/web-editor` | `npm run build` | Builds the web editor package.                |
| `docs`                | `npm run build` | Builds the documentation site.                |

### Root Build Scripts

- `npm run build:docs`: Builds the documentation and the playground, then copies the playground build to the docs distribution.
