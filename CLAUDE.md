# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Core Rule

ALWAYS NOTE THINGS DOWN. When you discover something important, write it immediately:
- Bugs/issues → fix them or add to TODO.md
- Design decisions → docs/ or code comments
- Future work → TODO.md
- Conventions → this file
- Areas for improvement → TODO.md (self-evaluate constantly)
- Key insights → this file, immediately

**Triggers to document immediately:**
- User corrects you → write down what you learned before fixing
- Trial-and-error (2+ failed attempts) → document what actually works
- Framework/library quirk discovered → add to relevant docs/ file
- "I'll remember this" thought → you won't, write it down now
- "Aha" moment about design → add to this file NOW

**Don't say these phrases, instead edit first:**
- "Fair point" / "Good point" / "You're right" → edit TODO.md/CLAUDE.md BEFORE responding
- "Should have" / "I forgot to" → you're admitting failure, edit docs to prevent recurrence

## Negative Constraints

Do not:
- Announce actions with "I will now..." - just do them
- Write preamble or summary in generated content
- Leave work uncommitted
- Create special cases - design to avoid them; if stuck, ask user rather than special-casing
- Create "legacy" APIs - one API, one way. If signature changes, update all callers. No `foo_legacy()` or `foo_v2()`
- Do half measures - when adding a trait/abstraction, migrate ALL callers immediately. No "we can consolidate later"
- Return tuples from functions - use structs with named fields. Tuples obscure meaning. Only use tuples when names would be ceremony (e.g., coordinates)
- Replace content when editing lists - when adding to TODO.md or similar, extend existing content, don't replace sections
- Mark as done prematurely - if work is incomplete, note what remains in TODO.md

## Design Principles

**Unify, don't multiply.** Fewer concepts = less mental load for humans and LLMs.
- One interface that handles multiple cases > separate interfaces per case
- Extend existing abstractions > create parallel ones

**Simplicity over cleverness.**
- If proposing a new dependency, ask: can stdlib/existing code do this?
- HashMap > inventory crate. Functions > traits (until you need the trait).
- "Going in circles" = signal to simplify, not add complexity.

**Explicit over implicit.**
- Convenience = zero-config. Hiding information = pretending everything is okay.
- Log when skipping something - user should know why.

**When stuck (2+ failed attempts):**
- Step back and reconsider the problem itself, not just try more solutions.
- Ask: "Am I solving the right problem?"

## Working Style

Start by checking TODO.md. Default: work through ALL items in "Next Up" unless user specifies otherwise.

Agentic by default - continue through tasks unless:
- Genuinely blocked and need clarification
- Decision has significant irreversible consequences
- User explicitly asked to be consulted

When you say "do X first" or "then we can Y" - add it to TODO.md immediately. Don't just say it, track it.

Bail out early if stuck in a loop rather than burning tokens.

Fresh mode (active): Consider wrapping up when:
- Major feature complete
- 50+ tool calls
- Re-reading files repeatedly (context degradation)
- Conversation drifted across unrelated topics

See `docs/session-modes.md` to switch modes.

Self-evaluate constantly: note friction points and areas for improvement in TODO.md.

## Commits

Commit after each logical unit of work. Each commit = one logical change.

## Session Handoffs

Before ending a session:
1. Commit current work
2. Move completed tasks to TODO.md "Completed" section
3. Update TODO.md "Next Up" with 3-5 concrete tasks
4. Note any open questions or blockers

Goal: next session completes ALL "Next Up" items.

## Architecture

Bloom is a multiplayer scriptable virtual world engine. See `docs/architecture.md` for deep-dive.

### Rust Crates (Primary Codebase)

Crate structure in `crates/`:
- `bloom-ir` - S-expression types and validation
- `bloom-core` - Entity system, capabilities, SQLite storage
- `bloom-runtime` - Script execution context with LuaJIT
- `bloom-plugin-abi` - Stable ABI for dynamic plugins
- `bloom-cli` - CLI binary (server)
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

## BloomScript

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
