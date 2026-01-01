# Viwo Roadmap & TODOs

## Next Up

(All items completed)

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

## Testing & Hardening

- [ ] **Object Creation Flows**: Add regression tests around create/dig/set verbs covering prototype assignment, room contents updates, and capability-gated creation failures.
- [ ] **Adversarial Actors**: Red-team scenarios for capability abuse (missing caps, spoofed locations, recursive containment, excessive gas) with assertions that operations are rejected and state remains consistent.

## 4. Knowledge & Productivity (Notion)

- [x] **Vector Plugin**: Core integration with `sqlite-vec` for semantic search.
- [ ] **Graph Queries**: Standard library functions for traversing entity relationships (backlinks, children, parents). (Status: Deferred, awaiting further design. We do not want to have a single fixed schema.)
- [ ] **Wiki Features**: Bi-directional linking, revision history, and transclusion support.
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
