# Viwo Roadmap & TODOs

## 1. Deep Simulation (Sandbox)

- [x] **Combat System**: Standardized libraries for turn-based combat math and state.
- [x] **Quest Engine**: State machine implementation for tracking multi-stage narrative arcs.
- [x] **World Gen**: Procedural generation tools for creating vast maps.

## 2. AI-Native Roleplay (SillyTavern)

- [x] **Memory Systems**: Integrate `sqlite-vec` for RAG-based long-term memory.
- [x] **Streaming**: Implement `streamText` support in `plugins/ai` for real-time typing effects.
- [x] **Dynamic State Context**: Implement system for mutable personality traits and ephemeral emotions that feed into LLM context.
- [x] **Director AI**: Meta-AI agent for pacing and environment control.
- [ ] **Chat Tree**: SillyTavern-style chat tree for roleplay. This should not be the only way to roleplay, so it should be implemented in scripting (`seed.ts`).

## 3. Ubiquitous Access (Chatbot)

- [ ] **Rich Embeds**: Map game state to platform-specific UI (Discord Embeds, Slack Blocks).
- [ ] **Async Play**: Design mechanics suitable for slow, correspondence-style gameplay.
- [ ] **Discord Bot**: Flesh out full feature parity with Web client.

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
- [ ] **Core**: Add capability-based permissions for verbs
- [ ] **Core**: Consider splitting permissions for net.http into multiple capabilities
- [ ] **Plugins**: Add capability-based permissions to opcodes defined by plugins
- [ ] **Scripting**: Add async support to compiler
- [ ] **Scripting**: Attempt to change BreakSignal and ContinueSignal to not throw, since we use a stack based interpreter so we should be able to simply return them
- [ ] **Scripting**: Figure out what to do with the duplication of `procgen.random` vs Std `random` opcodes
- [ ] **Seed**: Fix hotel seed - floors and rooms should be 'ephemeral' - that is, they should be destroyed when a: no longer in use and b: not modified.
- [ ] **Seed**: Make sure mailbox uses capability based permissions.
- [ ] **Transpiler**: Handle all compiler constructs
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
