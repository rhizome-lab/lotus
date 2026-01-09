# Architectural Challenges & Mitigations

This document outlines the key technical challenges identified in the [Vision](./vision.md) and the strategies we are employing to mitigate them.

## 1. Scripting Performance

**Challenge**: A custom interpreted language (Reed) running inside another interpreted language (JavaScript/TypeScript) could be too slow for complex simulations (e.g., pathfinding, economy, combat math).

**Mitigation**: **Just-In-Time (JIT) Compilation**.

- We have implemented a `compiler` (`packages/scripting/src/compiler.ts`) that translates Reed AST directly into native JavaScript functions.
- This removes the interpretation overhead, allowing scripts to run at near-native V8 speeds.
- Critical paths can be optimized by the V8 engine itself.

## 2. Data Structure & Querying

**Challenge**: The "Schemaless" nature of the Entity system (JSON `props`) provides flexibility but makes efficient querying and indexing difficult. How do we filter "All Tasks due tomorrow" from a soup of generic objects?

**Mitigation**: **Hybrid Storage & Future ECS**.

- **Current**: SQLite's JSON extensions allow for indexing specific JSON paths (e.g., `CREATE INDEX idx_props_due_date ON entities(json_extract(props, '$.dueDate'))`).
- **Future**: We plan to adopt a **Hybrid ECS** pattern.
  - **Core Components**: Performance-critical data (Position, Velocity, Health) can be moved to structured tables ("Components").
  - **Flexible Props**: The existing JSON `props` will remain as the default "Bag of Data" for ad-hoc or less frequently accessed properties.
  - **Seamless Interop**: The system will transparently query both. ECS becomes an _optimization_ for hot paths, not a mandatory rewrite.

## 3. AI Context Costs

**Challenge**: Injecting the full world state (Inventory, Quests, Nearby NPCs, History) into every LLM prompt is expensive (tokens) and slow (latency).

**Mitigation**: **Smart Context & Caching**.

- **Context Window**: Modern "Corporate" LLMs (Gemini 1.5, GPT-4o) have massive, cheap context windows.
- **Caching**: We can cache the "Static" part of the context (World Lore, Character Bio) and only update the "Dynamic" part (Current Conversation).
- **RAG**: For long-term memory, we will use Vector Search (RAG) to retrieve only the _relevant_ memories, keeping the prompt size manageable.

## 4. Frontend Fragmentation

**Challenge**: Supporting diverse use cases (MUD, Kanban, Graph) requires building multiple complex frontends, which is a significant resource drain.

**Mitigation**: **Leverage Existing Ecosystems**.

- **Headless Core**: The core is API-first. We don't _need_ to build every frontend ourselves.
- **Standard Patterns**:
  - **Block Editor**: We can reuse existing block editor libraries.
  - **Graph View**: Libraries like `force-graph` or `cytoscape.js` handle the rendering; we just provide the data.
  - **Text-First**: The "Graph" view doesn't need complex WebGL for everything; text searchability is often more important for knowledge bases.
