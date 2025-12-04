# Viwo Roadmap & TODOs

## 1. Deep Simulation (Sandbox)

- [ ] **Combat System**: Standardized libraries for turn-based combat math and state.
- [ ] **Quest Engine**: State machine implementation for tracking multi-stage narrative arcs.
- [ ] **World Gen**: Procedural generation tools for creating vast maps.

## 2. AI-Native Roleplay (SillyTavern)

- [ ] **Memory Systems**: Integrate `sqlite-vec` for RAG-based long-term memory.
- [ ] **Streaming**: Implement `streamText` support in `plugins/ai` for real-time typing effects.
- [ ] **Dynamic State Context**: Implement system for mutable personality traits and ephemeral emotions that feed into LLM context.
- [ ] **Director AI**: Meta-AI agent for pacing and environment control.

## 3. Ubiquitous Access (Chatbot)

- [ ] **Rich Embeds**: Map game state to platform-specific UI (Discord Embeds, Slack Blocks).
- [ ] **Async Play**: Design mechanics suitable for slow, correspondence-style gameplay.
- [ ] **Discord Bot**: Flesh out full feature parity with Web client.

## 4. Knowledge & Productivity (Notion)

- [x] **Vector Plugin**: Core integration with `sqlite-vec` for semantic search.
- [ ] **Graph Queries**: Standard library functions for traversing entity relationships (backlinks, children, parents).
- [ ] **Wiki Features**: Bi-directional linking, revision history, and transclusion support.
- [ ] **Custom Views**: Support for defining custom DB views/indexes for performance.

## Architecture & Core

- [ ] **Hybrid ECS Implementation**: Implement optional structured components for hot data (Position, Health) alongside flexible props.
- [ ] **Smart Context Caching**: Optimize LLM context usage by caching static lore/bio data.
- [ ] **TUI**: Update TUI to match Web frontend layout.

## Maintenance & Fixes

- [ ] **Interpreter**: Refactor `OpcodeHandler` to avoid recursion when calling lambdas. _Status: Postponed_.
- [ ] **Security**: Ensure kernel restrictions are actually restrictive (subset) in `packages/core/src/runtime/lib/kernel.ts`.
- [ ] **Auth**: Implement proper authentication checks in `packages/core/src/index.ts`.
- [ ] **TUI**: Fetch script content properly in `apps/tui/src/App.tsx`.
- [ ] **Web**: Batch retrieve items in `apps/web/src/components/ItemEditor.tsx`.
- [ ] **Web**: Implement ErrorView in `apps/web/src/components/GameLog.tsx`.
- [ ] **Core**: Solve transactional updates for multiple entities with capabilities in `packages/core/src/runtime/lib/core.ts`.
