# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Core Rule

ALWAYS NOTE THINGS DOWN. When you discover something important, write it immediately:
- Bugs/issues → fix them or add to TODO.md
- Design decisions → docs/ or code comments
- Future work → TODO.md
- Conventions → this file
- Areas for improvement → TODO.md (self-evaluate constantly)

## Negative Constraints

Do not:
- Announce actions with "I will now..." - just do them
- Write preamble or summary in generated content
- Leave work uncommitted

## Working Style

Start by checking TODO.md. Default: work through ALL items in "Next Up" unless user specifies otherwise.

Agentic by default - continue through tasks unless:
- Genuinely blocked and need clarification
- Decision has significant irreversible consequences
- User explicitly asked to be consulted

Marathon mode (active): Continuous autonomous work through TODO.md until empty or blocked.
- Commit after each logical unit (creates resume points)
- Bail out if stuck in a loop (3+ retries on same error)
- If genuinely blocked, document state in TODO.md and stop

See `docs/session-modes.md` to switch modes.

Self-evaluate constantly: note friction points and areas for improvement in TODO.md.

## Commits

Commit after each logical unit of work. Each commit = one logical change.

## Code Style

- Avoid one-letter names: `i` → `idx`, `e` → `event`, `a, b` → `left, right`
- Use `??` not `||` for fallbacks
- Use `+= 1` not `++`
- Avoid `any` - it's infectious like `NaN` for types
- Prefer `ts-expect-error` over `ts-ignore` (but avoid both)
- For `apps/web` and `apps/playground`: use BEM in `packages/shared/src/index.css`, not inline CSS
- Write tests with `bun test --coverage`

## Build & Development Commands

```bash
# Install dependencies
bun install

# Development
bun run dev:server     # Start core server (port 8080)
bun run dev:web        # Start web client (port 5173)
bun run dev:docs       # Start docs dev server

# Testing
bun test                           # Run all tests
bun --filter @viwo/core test       # Run tests for a specific package
bun test path/to/file.test.ts      # Run a single test file

# Code quality
bun lint                # Run oxlint
bun format              # Run oxfmt
bun run check:types     # Type check all packages (uses tsgo)
bun run check:unused    # Check for unused exports (knip)

# Database
bun run db:wipe         # Delete world.sqlite
```

## Architecture

Viwo is a multiplayer scriptable virtual world engine. See `docs/architecture.md` for deep-dive.

### Execution Model ("Sandwich Architecture")
```
TypeScript Code → [transpiler] → S-expressions (JSON AST) → [compiler] → JavaScript
```
- **Top**: Developer writes TypeScript (transpiled, never executed directly)
- **Middle**: S-expressions as stable ABI (serializable, language-agnostic, secure)
- **Bottom**: Kernel executes via opcodes (only way to affect world state)

### Core Packages
- **packages/scripting**: ViwoScript language (transpiler, compiler, interpreter, decompiler, optimizer)
- **packages/core**: Game engine (entities, verbs, capabilities, scheduler, WebSocket server)
- **packages/shared**: JSON-RPC types
- **packages/client**: WebSocket client library

### Apps
- **apps/server**: Boots core + plugins (the server all clients connect to)
- **apps/web**: SolidJS game client
- **apps/tui**: Terminal UI with code editor
- **apps/discord-bot**: Discord integration (channel↔room linking)
- **apps/playground**: Standalone scripting sandbox
- **apps/imagegen**: Image generation editor

### Plugins
Register via `ctx.core.registerLibrary()` in `onLoad()`. Expose opcodes via `defineFullOpcode()`.
- **ai**: LLM text/image/embeddings (Vercel AI SDK)
- **memory**: RAG with vector search (depends on ai, vector)
- **vector**: sqlite-vec wrapper
- **procgen**: Seeded random, simplex noise
- **fs/net/sqlite**: Capability-gated I/O

### Key Patterns
- **Entities**: Prototype-based inheritance, schema-free props (JSON), stored in SQLite
- **Verbs**: S-expression scripts attached to entities, resolved via prototype chain
- **Capabilities**: Authorization tokens with params (e.g., `entity.control { target_id: 42 }`)
- **Lazy Opcodes**: Control flow opcodes receive raw AST, evaluate conditionally

## ViwoScript

```json
["std.seq",
  ["std.let", "name", ["std.arg", 0]],
  ["send", "message", ["str.concat", "Hello, ", ["std.var", "name"], "!"]]
]
```

Opcodes prefixed by library: `std.*`, `math.*`, `str.*`, `list.*`, `obj.*`, `time.*`, `bool.*`.

## Type Checking

Uses `tsgo` (TypeScript native preview). Run `bun run check:types` or per-package `bun --filter @viwo/core check:types`.
