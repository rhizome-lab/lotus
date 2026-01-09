# Development Guide

Welcome to the Lotus development guide! This document will help you get set up and contributing to the project.

> **Note**: Pre-built binaries are not yet available. These prerequisites are for building from source.

## Getting Started

### Prerequisites

- **[Rust](https://rustup.rs/)** (latest stable) — builds the server and game engine
- **[Bun](https://bun.sh/)** (v1.0.0+) — builds the web/TUI/Discord clients

Scripts are written in TypeScript and compile down to Lua internally — you don't need to know Lua.

### Installation

1.  Clone the repository:

    ```bash
    git clone https://github.com/rhizome-lab/lotus.git
    cd lotus
    ```

2.  Install TypeScript dependencies:
    ```bash
    bun install
    ```

3.  Build Rust backend:
    ```bash
    cargo build --release
    ```

### Project Structure

Lotus is a monorepo with Rust backend (`crates/`) and TypeScript frontends (`apps/`, `packages/`).

#### Rust Crates (`crates/`)

- `lotus-ir`: S-expression types and validation
- `lotus-core`: Entity system, capabilities, SQLite storage
- `lotus-runtime`: Script execution with LuaJIT
- `lotus-cli`: CLI binary
- `syntax/typescript`: TypeScript → S-expression transpiler
- `runtime/luajit`: S-expression → Lua codegen
- `transport/websocket-jsonrpc`: WebSocket server
- `plugins/*`: Native plugins (ai, fs, net, sqlite, procgen, vector, memory)
- `apps/notes-server`: Notes app server
- `apps/filebrowser-server`: File browser app server

#### TypeScript (`apps/`, `packages/`)

- **`apps/`**: Frontend applications
  - `web`: Main web frontend (SolidJS)
  - `tui`: Terminal user interface
  - `discord-bot`: Discord integration
  - `notes`: Wiki-style notes client
  - `filebrowser`: File browser client
- **`packages/`**: Shared libraries
  - `client`: WebSocket client SDK
  - `shared`: Shared types (JSON-RPC protocol)

### Running Tests

```bash
# Rust tests
cargo test --workspace

# TypeScript tests
bun test
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

1. Builds the `@lotus/docs` package (VitePress site).
2. Builds the `@lotus/playground` package.
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

## CI Checks

We use a set of scripts to ensure code quality and consistency in the repository. These checks are run automatically in our CI pipeline.

### Checking Documentation

To ensure that every package and application has a corresponding `README.md` and documentation file in `docs/`:

```bash
bun run check:readmes
```

This script will list any missing files and exit with an error code if the repository is incomplete.

### Running All Checks

To run the full suite of CI checks locally (formatting, linting, typechecking, testing, and documentation checks):

```bash
bun run ci:check
```

It is recommended to run this command before pushing your changes to ensure they will pass the CI pipeline.
