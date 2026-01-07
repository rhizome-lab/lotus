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

Fresh mode (active): Consider wrapping up when:
- Major feature complete
- 50+ tool calls
- Re-reading files repeatedly (context degradation)
- Conversation drifted across unrelated topics

See `docs/session-modes.md` to switch modes.

Self-evaluate constantly: note friction points and areas for improvement in TODO.md.

## Commits

Commit after each logical unit of work. Each commit = one logical change.

## Architecture

Viwo is a multiplayer scriptable virtual world engine. See `docs/architecture.md` for deep-dive.

### Rust Crates (Primary Codebase)

Crate structure in `crates/`:
- `viwo-ir` - S-expression types and validation
- `viwo-core` - Entity system, capabilities, SQLite storage
- `viwo-runtime` - Script execution context with LuaJIT
- `viwo-plugin-abi` - Stable ABI for dynamic plugins
- `viwo-cli` - CLI binary (server)
- `syntax/typescript` - TS → S-expr transpiler
- `runtime/luajit` - S-expr → Lua codegen + mlua runtime
- `apps/notes-server` - Notes app server
- `apps/filebrowser-server` - File browser app server
- `plugins/*` - Plugin implementations (ai, fs, net, procgen, sqlite, vector, memory, diffusers)

### Execution Model ("Sandwich Architecture")
```
TypeScript Code → [transpiler] → S-expressions (JSON AST) → [compiler] → Lua → LuaJIT
```
- **Top**: Developer writes TypeScript (transpiled, never executed directly)
- **Middle**: S-expressions as stable ABI (serializable, language-agnostic, secure)
- **Bottom**: Kernel executes via opcodes in LuaJIT (only way to affect world state)

### TypeScript (UI Clients)

Remaining TypeScript code:
- **apps/web**: SolidJS game client
- **apps/filebrowser**: File browser UI client
- **apps/notes**: Notes UI client
- **apps/tui**: Terminal UI with code editor
- **apps/discord-bot**: Discord integration (channel↔room linking)
- **packages/shared**: JSON-RPC types
- **packages/client**: WebSocket client library

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

## Build & Development Commands

```bash
# Rust (primary)
cargo check              # Type check
cargo build              # Build all crates
cargo test               # Run tests
cargo xtask <task>       # Build automation

# TypeScript (UI clients)
bun install              # Install dependencies
bun run dev:web          # Start web client (port 5173)
bun run dev:tui          # Start terminal UI
bun lint                 # Run oxlint
bun format               # Run oxfmt
bun run check:types      # Type check all packages (uses tsgo)
```

## Code Style

### Rust
- Use `cargo fmt` and `cargo clippy`
- Write tests for all new code

### TypeScript
- Avoid one-letter names: `i` → `idx`, `e` → `event`, `a, b` → `left, right`
- Use `??` not `||` for fallbacks
- Use `+= 1` not `++`
- Avoid `any` - it's infectious like `NaN` for types
- For `apps/web`: use BEM in `packages/shared/src/index.css`, not inline CSS

## Type Checking

Uses `tsgo` (TypeScript native preview). Run `bun run check:types`.
