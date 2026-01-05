# Viwo Roadmap & TODOs

## Next Up

### Rust Port - Scripting Layer ✅ COMPLETE

Goal: Mirror `packages/scripting/src/compiler.ts` semantics exactly.

- [x] **Codegen**: Split codegen.rs into per-library modules (math, list, str, obj, std, bool)
- [x] **Tests**: Port tests from TypeScript (285 tests passing total)
- [x] **Transpiler**: Support `while_statement`, `for_in_statement`, `break_statement`, `continue_statement`
- [x] **Transpiler**: Support `parenthesized_expression` as call target (e.g. `((x) => x + 1)(5)`)
- [x] **Transpiler**: Support `assignment_expression` for `i = i + 1` in loops
- [x] **Codegen**: Implement `std.apply` for calling lambdas
- [x] **Codegen**: No IIFEs needed - lambda calls use `std.apply` which compiles to `(func)(args)`
- [x] **Stdlib Math**: All ops (`+`, `-`, `*`, `/`, `%`, `^`, `abs`, `floor`, `ceil`, `trunc`, `round`, `sqrt`, `min`, `max`, `clamp`, `sign`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `log`, `log2`, `log10`, `exp`)
- [x] **Stdlib List**: All ops (`new`, `len`, `empty`, `get`, `set`, `push`, `pop`, `unshift`, `shift`, `map`, `filter`, `reduce`, `find`, `concat`, `slice`, `includes`, `indexOf`, `reverse`, `sort`, `join`)
- [x] **Stdlib String**: All ops (`len`, `concat`, `lower`, `upper`, `split`, `sub`, `trim`, `indexOf`, `includes`, `replace`, `slice`, `join`, `startsWith`, `endsWith`, `repeat`)
- [x] **Stdlib Object**: All ops (`new`, `get`, `set`, `keys`, `values`, `entries`, `has`, `delete`, `del`, `merge`, `map`, `filter`, `reduce`, `flatMap`)
- [x] **Stdlib List**: `splice`, `flatMap`
- [x] **Stdlib Std**: `typeof`
- [x] **Stdlib JSON**: `stringify`, `parse` (via cjson serde bindings)
- [x] **Transpiler**: `nullish` (??) coalescing operator
- [x] **Codegen**: `bool.guard` - like && but only null/undefined are falsy (not false)
- [x] **Codegen**: `std.continue` with goto label support in loops
- [x] **Codegen**: Type coercion (`std.string`, `std.number`, `std.boolean`)
- [x] **Codegen**: Error handling (`std.throw`, `std.try`)
- [x] **Codegen**: Logging (`std.log`, `std.warn`)

### Rust Port - Game Engine (IN PROGRESS) 🚀

**Core Infrastructure: (MAJOR PROGRESS - 90% complete)**
- [x] **viwo-core**: Port entity repository (create, read, update, delete with SQLite) ✅
- [x] **viwo-core**: Port verb resolution via prototype chain ✅
- [x] **viwo-core**: Port capability enforcement and validation ✅
- [x] **viwo-core**: Port scheduler system with task queue ✅
- [x] **viwo-runtime**: Create integrated runtime combining storage + LuaJIT ✅
- [x] **viwo-runtime**: Implement context opcodes (`std.arg`, `std.args`, `std.this`, `std.caller`) ✅
- [x] **viwo-runtime**: Fix entity flattening to match TypeScript behavior ✅
- [x] **viwo-runtime**: Implement kernel capability operations (get, has, give) ✅
- [x] **viwo-runtime**: Port game opcodes (`entity`, `update`, `create`, `call`, `schedule`) ✅
- [x] **viwo-runtime**: Implement entity mutation tracking (obj.set auto-persists) ✅
- [x] **viwo-runtime**: Convert to sync Mutex for simpler Lua integration ✅
- [x] **viwo-runtime**: Port kernel capability opcodes (`mint`, `delegate`) ✅
- [x] **viwo-core**: Port seed system (load entities/verbs from TypeScript DSL) ✅
  - [x] **viwo-syntax-typescript**: Entity definition parser (tree-sitter based) ✅
  - [x] **viwo-core**: SeedSystem for loading TypeScript entity classes ✅
  - [x] **Tests**: Entity parsing (properties, methods, verbs) ✅

**Tests Ported: (20/20+ tests, 95% complete, 331 passing)**
- [x] **Tests**: Port basic gameloop tests (state_persistence, verb_inheritance) ✅
- [x] **Tests**: Port capability tests (get_capability, transfer) ✅
- [x] **Tests**: Port capability delegation tests (mint, delegate with restrictions) ✅
- [x] **Tests**: Port scheduler integration tests (3 tests) ✅
- [x] **Tests**: Port complex workflow tests (conditionals, loops, lambdas, lists) ✅
- [x] **Tests**: Port verb calling tests (call opcode, entity mutations) ✅
- [x] **Tests**: Port multi-entity interaction tests ✅
- [ ] **Tests**: Port remaining edge cases and error handling tests

**Type-Safe IR & Code Generation: (COMPLETE ✅)**
- [x] **viwo-ir**: Implement opaque inner enum SExpr design with phantom types ✅
- [x] **viwo-ir**: TOML schema format with dual-type system (TS generics + Rust runtime types) ✅
- [x] **viwo-ir**: Schema-based code generator for type-safe Rust builders ✅
- [x] **viwo-ir**: Prevent invalid SExpr construction at compile time (e.g., `SExpr::<Num>::bool(true)`) ✅
- [x] **viwo-ir**: Add `cast_type()` and `erase_type()` for type conversion ✅
- [x] **viwo-ir**: Rust keyword escaping in generated code (else → r#else) ✅
- [ ] **viwo-ir**: Extract remaining opcode definitions from TypeScript to schema

**Plugin System: (COMPLETE ✅ - 7/8 plugins ported)**
- [x] **Plugins**: Implement plugin opcode registry in viwo-runtime-luajit ✅
- [x] **Plugins**: Complete plugin loader (dynamic loading with libloading) ✅
- [x] **Plugins**: Port `fs` plugin (filesystem access with capability enforcement) ✅
- [x] **Plugins**: Port `net` plugin (HTTP client with reqwest) ✅
- [x] **Plugins**: Port `sqlite` plugin (direct SQL access with rusqlite) ✅
- [x] **Plugins**: Port `procgen` plugin (seeded random, simplex noise) ✅
- [x] **Plugins**: Port `ai` plugin (multi-provider LLM via rig: OpenAI, Anthropic, Cohere, Perplexity) ✅
- [x] **Plugins**: Port `vector` plugin (sqlite-vec embeddings for semantic search) ✅
- [x] **Plugins**: Port `memory` plugin (RAG with vector search + AI embeddings) ✅
- [ ] **Plugins**: Port `diffusers` plugin (image generation - LOW PRIORITY, waiting on Rust diffusion impls)

**Server & Transport:**
- [ ] **viwo-core**: Port scheduler system (periodic task execution from database queue)
- [ ] **viwo-transport-websocket-jsonrpc**: Integrate runtime with verb execution
- [ ] **Server**: Expand JSON-RPC handlers (look, create, dig, go, set, teleport, etc.)
- [ ] **Server**: Implement authentication system
- [ ] **Server**: Session management with player entity association
- [ ] **Server**: Broadcast system for multi-client updates
- [ ] **Server**: Hook scheduler into server tick loop

**Rust Server Applications:**
- [x] **notes-server**: Port notes server to Rust ✅
  - [x] Create `crates/apps/notes-server` with main.rs ✅
  - [x] Bootstrap: load plugins → seed world → start WebSocket server ✅
  - [x] Reuse existing TypeScript entity definitions (`apps/notes-server/src/definitions/Notes.ts`) ✅
  - [ ] Test: CRUD operations, backlinks, search
- [x] **filebrowser-server**: Port file browser server to Rust ✅
  - [x] Create `crates/apps/filebrowser-server` with main.rs ✅
  - [x] Bootstrap: load fs plugin → seed world → start WebSocket server ✅
  - [x] Reuse existing TypeScript entity definitions (`apps/filebrowser-server/src/definitions/FileBrowser.ts`) ✅
  - [ ] Test: navigation, file reading, bookmarks

## 1. Deep Simulation (Sandbox)

- [x] **Combat System**: Standardized libraries for turn-based combat math and state.
- [x] **Quest Engine**: State machine implementation for tracking multi-stage narrative arcs.
- [x] **World Gen**: Procedural generation tools for creating vast maps.

## 2. AI-Native Roleplay (SillyTavern)

- [x] **Memory Systems**: Integrate `sqlite-vec` for RAG-based long-term memory.
- [x] **Streaming**: Implement `streamText` support in `plugins/ai` for real-time typing effects.
- [x] **Dynamic State Context**: Implement system for mutable personality traits and ephemeral emotions that feed into LLM context.
- [x] **Director AI**: Meta-AI agent for pacing and environment control.
- [x] **Chat Tree**: SillyTavern-style chat tree for roleplay (implemented in `seed.ts`).

## 3. Ubiquitous Access (Chatbot)

- [ ] **Rich Embeds**: Map game state to platform-specific UI (Discord Embeds, Slack Blocks).
- [ ] **Async Play**: Design mechanics suitable for slow, correspondence-style gameplay.
- [ ] **Discord Bot**: Flesh out full feature parity with Web client.
- [ ] **Integration Tests**: Add end-to-end `bun:test` harness for core: boot server, seed minimal world, connect via `packages/client`, exercise login/move/verb flow, assert DB state/events/capability enforcement.
- [x] **File Browser App**: Sandboxed file browser paradigm.
  - `apps/filebrowser-server/`: Server with FileBrowserUser entity, CRUD + bookmarks + tags
  - `apps/filebrowser/`: SolidJS client with toolbar, preview, bookmarks panel
  - Run: `bun dev:filebrowser-server` (port 8080) + `bun dev:filebrowser` (port 3003)

## Testing & Hardening

- [ ] **Object Creation Flows**: Add regression tests around create/dig/set verbs covering prototype assignment, room contents updates, and capability-gated creation failures.
- [ ] **Adversarial Actors**: Red-team scenarios for capability abuse (missing caps, spoofed locations, recursive containment, excessive gas) with assertions that operations are rejected and state remains consistent.

## 4. Knowledge & Productivity (Notion)

- [x] **Vector Plugin**: Core integration with `sqlite-vec` for semantic search.
- [ ] **Graph Queries**: Standard library functions for traversing entity relationships (backlinks, children, parents). (Status: Deferred, awaiting further design. We do not want to have a single fixed schema.)
- [x] **Wiki Notes App**: Obsidian-style notes with wikilinks and backlinks.
  - `apps/notes-server/`: Server with NotesUser entity, CRUD verbs, backlinks via stored links array
  - `apps/notes/`: SolidJS client with remark-gfm + remark-wiki-link + rehype pipeline
  - Run: `bun dev:notes-server` (port 8081) + `bun dev:notes` (port 3004)
- [ ] **Wiki Features (Extended)**: Revision history and transclusion support.
- [ ] **Custom Views**: Support for defining custom DB views/indexes for performance.
- [ ] **Cloud Sync**: Plugins to sync whole DB (e.g. notes) to cloud storage (S3-compatible, Backblaze B2, Cloudflare R2, Google Drive, Dropbox, OneDrive etc.)

## Architecture & Core

- [ ] **Hybrid ECS Implementation**: Implement optional structured components for hot data (Position, Health) alongside flexible props.
- [ ] **Smart Context Caching**: Optimize LLM context usage by caching static lore/bio data.
- [ ] **TUI**: Update TUI to match Web frontend layout.

## Maintenance & Fixes

- [ ] **Interpreter**: Refactor `OpcodeHandler` to avoid recursion when calling lambdas. _Status: Postponed_.
- [ ] **Security**: Ensure kernel restrictions are actually restrictive (subset) in `packages/core/src/runtime/lib/kernel.ts`.
- [ ] **Auth**: Implement proper authentication checks in `packages/core/src/index.ts`.
- [ ] **Core**: Solve transactional updates for multiple entities with capabilities in `packages/core/src/runtime/lib/core.ts`.
- [ ] **Core**: Atomic multi-entity moves (e.g. moving item from room A to room B atomically).
- [ ] **Core**: Add capability-based permissions for verbs
- [ ] **Core**: Re-add verb checking if it makes sense (removed `ops/verbs` and `check:verbs` script due to failures)
- [ ] **Scripting**: Add async support to compiler
- [ ] **Seed**: Make sure mailbox uses capability based permissions. (And add it back, I guess, and add _new_ tests in `mailbox.test.ts` to verify that functionality works)
- [ ] **Seed**: Add object literal support to `extractLiteral` in `packages/core/src/seeds/loader.ts` (currently only supports strings, numbers, booleans, null, and arrays)
- [ ] **Transpiler**: Handle all compiler constructs
- [x] **Transpiler**: Support ES6 shorthand property syntax - FIXED: now handles ShorthandPropertyAssignment
- [ ] **Transpiler**: Support native array methods (`.push()`, `.reverse()` currently not transpiled)
- [ ] **Transpiler**: Fix for-in loop transpilation (currently causes `obj.get` errors during iteration)
- [ ] **Transpiler**: Make dictionary/object access safer (bracket notation `obj[key]` throws if key missing - should use `obj.get` with defaults or add null-safe operator support)
- [ ] **Compiler**: Consider tracking usages of `__ctx__` and removing it from the parameter list if it is unused
- [ ] **Scripting**: Either document wildcard capability support (see `packages/core/src/runtime/lib/kernel.ts`), or remove it
- [ ] **Lint**: Enable type-aware linting: https://oxc.rs/docs/guide/usage/linter/type-aware.html
- [ ] **Codegen**: Autogenerate `packages/core/src/plugin_types.ts` without introducing dependency on `@viwo/plugin-ai`
- [ ] **Codegen**: Add all other plugins to `packages/core/src/plugin_types.ts` (net, fs, procgen)
- [ ] **AI**: Better syntax for custom OpenAI-compatible endpoints for `getProvider`
- [ ] **Plugins**: Consider making calls like `this.context.getPlugin("memory")` type-safe
- [ ] **AI**: Make `modelSpec`s configurable in `plugins/ai/src/index.ts`
- [ ] **AI**: Remove dependency on Zod since all schemas should be defined at runtime
- [ ] **Libraries**: Library with opcodes to construct JSON Schemas. Also export regular functions for other plugins to construct JSON Schemas at compile-time
- [ ] **AI**: Return images and audio in a usable format in `plugins/ai/src/lib.ts`
- [ ] **AI**: Add support for specifying image size in `plugins/ai/src/lib.ts`
- [ ] **AI**: Add support for streaming text in `plugins/ai/src/lib.ts`

## Issues Found During Architecture Review

- [x] **Transpiler**: Temp variable generation uses `Math.random()` suffix - theoretically can collide (use counter instead) - FIXED: uses counter now
- [x] **Transpiler**: Optional chaining `obj?.method()` may lose `this` context - FIXED: buildChain() fuses prop+call into callMethod
- [x] **Interpreter**: `std.set` silently does nothing if variable not found in scope chain - should throw or create at top level - FIXED: throws ScriptError
- [x] **Optimizer**: Catches all errors silently with `console.error` - FIXED: now supports onWarning callback
- [x] **Stdlib**: Several opcode labels are wrong (e.g., `listEmpty` labeled "Index Of", `listGet` labeled "Insert Item") - FIXED: corrected 10 labels
- [ ] **Core**: Copy-on-Write pattern only helps scope forking, doesn't protect against external mutation of vars object
- [ ] **Core**: Verb compilation cache uses `JSON.stringify(code)` as key - inefficient for large verbs
- [x] **Kernel**: `delegate` opcode allows privilege ESCALATION - FIXED: now validates subset restrictions
