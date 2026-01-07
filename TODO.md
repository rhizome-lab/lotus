# Bloom Roadmap & TODOs

## Next Up

### Frontends & Clients

- [ ] **TUI**: Update TUI to match Web frontend layout
- [ ] **Discord Bot**: Full feature parity with Web client
- [ ] **Rich Embeds**: Map game state to platform-specific UI (Discord Embeds, Slack Blocks)
- [ ] **Async Play**: Design mechanics suitable for slow, correspondence-style gameplay

### Testing

- [ ] **Integration Tests**: End-to-end tests via `packages/client` (boot server → connect → exercise login/move/verb flow → assert state)

### Knowledge & Productivity

- [ ] **Wiki Features**: Revision history and transclusion support
- [ ] **Custom Views**: Support for defining custom DB views/indexes for performance
- [ ] **Cloud Sync**: Plugins to sync DB to cloud storage (S3, R2, Google Drive, Dropbox, etc.)
- [ ] **Graph Queries**: Standard library for traversing entity relationships (deferred - no fixed schema yet)

### Architecture

- [ ] **Web Editor**: Re-add visual script editor (needs Rust→WASM bindings for transpile/decompile)
- [ ] **Hybrid ECS**: Optional structured components for hot data (Position, Health) alongside flexible props
- [ ] **Smart Context Caching**: Optimize LLM context by caching static lore/bio data
- [ ] **Atomic Transactions**: Multi-entity moves (item from room A to room B atomically)
- [ ] **Capability Verbs**: Add capability-based permissions for verb execution

### Transpiler & Codegen

- [ ] **Safe Object Access**: Bracket notation `obj[key]` should use `obj.get` with defaults or null-safe operator
- [ ] **Handle All Constructs**: Complete coverage of TypeScript language features

### Tooling

- [ ] **Type-Aware Linting**: Enable oxlint type-aware rules for TypeScript frontends

---

## Completed

<details>
<summary>Rust Port - Scripting Layer ✅</summary>

- [x] Codegen split into per-library modules (math, list, str, obj, std, bool)
- [x] Tests ported from TypeScript (285 tests)
- [x] Transpiler: while, for-in, break, continue, parenthesized expressions, assignment expressions
- [x] Codegen: std.apply, IIFEs, all stdlib ops
- [x] Nullish coalescing, bool.guard, std.continue with goto labels
- [x] Type coercion, error handling, logging
</details>

<details>
<summary>Rust Port - Game Engine ✅</summary>

- [x] bloom-core: Entity repo, verb resolution, capabilities, scheduler, seed system
- [x] bloom-runtime: Context opcodes, game opcodes, mutation tracking, kernel ops
- [x] bloom-ir: Type-safe S-expression builders with phantom types
- [x] All game engine tests ported (331 passing)
</details>

<details>
<summary>Plugin System ✅</summary>

- [x] Native Lua C API for all plugins (fs, net, sqlite, procgen, vector, ai, memory, diffusers)
- [x] Dynamic plugin loading via libloading
- [x] Generic plugin registration
</details>

<details>
<summary>Server & Transport ✅</summary>

- [x] WebSocket JSON-RPC server
- [x] All handlers: login, execute, entity CRUD, verb CRUD, schedule
- [x] Broadcast system, scheduler integration
- [x] notes-server and filebrowser-server apps
</details>

<details>
<summary>Deep Simulation ✅</summary>

- [x] Combat system, quest engine, world gen
</details>

<details>
<summary>AI-Native Roleplay ✅</summary>

- [x] Memory systems (sqlite-vec), streaming, dynamic state context
- [x] Director AI, chat tree
</details>

<details>
<summary>Testing & Hardening ✅</summary>

- [x] Object creation flows (6 tests)
- [x] Adversarial actors (13 tests)
- [x] Notes-server integration (4 tests)
- [x] Filebrowser-server integration (3 tests)
</details>

<details>
<summary>Bug Fixes ✅</summary>

- [x] bool.guard semantics
- [x] obj.new flat pairs format
- [x] entity() returns flattened props
- [x] std.if IIFE for expressions
- [x] str.split preserves empty strings
- [x] std.seq semicolons for Lua parsing
- [x] std.if avoids IIFE with break/continue/return
- [x] Transpiler: temp var counter, optional chaining, std.set throws
- [x] Optimizer: onWarning callback
- [x] Kernel: delegate validates subset restrictions
</details>

---

## Apps

| App | Server | Client | Status |
|-----|--------|--------|--------|
| Notes | `cargo run -p bloom-notes-server` (8081) | `bun dev:notes` (3004) | ✅ |
| FileBrowser | `cargo run -p bloom-filebrowser-server` (8080) | `bun dev:filebrowser` (3003) | ✅ |
| Web | - | `bun dev:web` (5173) | ✅ |
| TUI | - | `bun dev:tui` | Needs update |
| Discord | - | `bun dev:discord-bot` | Needs features |
