# Lotus Roadmap & TODOs

## Next Up

### Frontends & Clients

- [ ] **Async Play**: Design mechanics suitable for slow, correspondence-style gameplay

### Knowledge & Productivity
- [ ] **Custom Views**: Support for defining custom DB views/indexes for performance
- [ ] **Graph Queries**: Standard library for traversing entity relationships (deferred - no fixed schema yet)

### Architecture

- [ ] **Web Editor**: Re-add visual script editor (needs Rust→WASM bindings for transpile/decompile)
- [ ] **Hybrid ECS**: Optional structured components for hot data (Position, Health) alongside flexible props
- [ ] **Spore Integration**: Move Lua execution to spore, lotus becomes pure world state
- [ ] **API Simplification**: Redesign lotus-core API surface - current API grew organically and could be cleaner

#### Kernel Operations for Spore Plugin

When execution moves to spore, these kernel operations need to be provided via a `spore-lotus` plugin:

**Entity Operations:**
- `entity(id)` → Get entity by ID (returns flattened props)
- `verbs(entity)` → Get all verbs defined on an entity
- `update(entity_id, props)` → Persist entity property changes
- `create(props, prototype_id?)` → Create new entity

**Verb Execution:**
- `call(target_entity, verb_name, args)` → Call a verb on an entity
  - Checks `required_capability` if set on verb
  - Creates nested execution context with proper `caller_id`
- `schedule(verb_name, args, delay_ms)` → Schedule future verb execution

**Capability System:**
- `capability(id)` → Get capability by ID
- `mint(authority, cap_type, params)` → Create new capability using mint authority
  - Validates authority is `sys.mint` type
  - Validates namespace permissions
- `delegate(parent_cap, restrictions)` → Create restricted child capability
  - Validates restrictions are subset of parent

**Context Variables:**
- `__this` → Current entity (flattened props)
- `__caller` → Entity ID of caller
- `__args` → Arguments passed to verb

**Plugin Integration:**
Existing plugins (fs, net, sqlite, vector, ai, memory, procgen) register Lua C functions directly.
These should continue to work through spore's plugin system.

### Transpiler & Codegen

- [ ] **Handle All Constructs**: Complete coverage of TypeScript language features

### Testing & Fixes

- [ ] **Scheduler Tests**: Rewrite scheduler_integration tests for new async API (process() now takes callback)
- [ ] **Try/Catch Runtime**: Fix std.try codegen (tests failing in edge_cases.rs)
- [ ] **Plugin Loader Test**: Fix plugin init in test environment

---

## Completed

<details>
<summary>Session Jan 2026 ✅</summary>

- [x] TUI: Compass and Inspector panels matching web layout
- [x] Discord Bot: Embeds, help, room, inventory, inspect commands
- [x] Wiki: Revision history (get_revisions, restore_revision)
- [x] Integration Tests: get_opcodes RPC
- [x] Fix docs build (dead links, missing script)
- [x] Fix unused check (knip configuration)
- [x] Safe Object Access: Transpiler uses obj.get for bracket notation with string keys
- [x] Type-Aware Linting: oxlint with --type-aware flag, oxlint-tsgolint, root tsconfig.json
- [x] Wiki Transclusion: ![[Note]] syntax embeds note content with recursion/cycle detection
- [x] Transpiler: Classic for-loops `for (init; cond; update)` and switch statements
- [x] Rich Embeds: Message adapter system for Discord/Slack with formal GameMessage types
- [x] Atomic Transactions: SQLite transactions with nested savepoint support for verb execution
- [x] Capability Verbs: Optional required_capability field on verbs for authorization at call time
- [x] Cloud Storage Plugin: Unified API for S3, GCS, Azure, Dropbox, Google Drive, OneDrive via OpenDAL
</details>

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

- [x] lotus-core: Entity repo, verb resolution, capabilities, scheduler, seed system
- [x] lotus-runtime: Context opcodes, game opcodes, mutation tracking, kernel ops
- [x] lotus-ir: Type-safe S-expression builders with phantom types
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
| Notes | `cargo run -p notes-server` (8081) | `bun dev:notes` (3004) | ✅ |
| FileBrowser | `cargo run -p filebrowser-server` (8080) | `bun dev:filebrowser` (3003) | ✅ |
| Web | - | `bun dev:web` (5173) | ✅ |
| TUI | - | `bun dev:tui` | ✅ |
| Discord | - | `bun dev:discord-bot` | ✅ |
