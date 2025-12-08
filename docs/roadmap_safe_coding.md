# Roadmap: Maximizing Maintainability & Safe Coding

**Goal:** Optimize the Viwo ecosystem for humans and AI to write code as simply and safely as possible, minimizing the potential for broken code. Prioritize Discoverability and Maintainability over refactor cost.

## Core Philosophy: "The Pit of Success"

APIs and tools should be designed so that the _easiest_ way to do something is also the _correct_ and _secure_ way.

---

## Phase 1: Short-term (High Impact, Low Refactor)

These steps can be implemented immediately on top of the current engine to strictly enforce safety and improve DX.

### 0. Language Agnosticism & The SDK Layer

ViwoScript is designed to be language-agnostic. The strategies below distinguish between the **Kernel** (Opcodes, VM) which remains universal, and the **SDK** (Language-Specific Bindings) which provides the "Human/AI Friendly" surface area.

- **Kernel:** Remains low-level, opcode-based, and secure. Validated by the engine.
- **SDK:** Provides the "Typed Facade". For TypeScript, this means Classes. For Python/Lua, this would be their equivalent idiomatic structures.
- **Goal:** The AI/Human writes against the SDK. The SDK talks to the Kernel.

### 1. The "Typed Facade" (e.g. TypeScript SDK)

Instead of exposing raw opcodes (`sys.create(cap, ...)`), we expose **Typed Capability Classes** to the scripting environment.

- **Concept:** The runtime wraps the raw capabilities in language-specific classes (e.g., TS Classes).
- **Benefit:**
  - **Discoverability:** `cap.` triggers autocomplete showing exactly what _this_ capability can do.
  - **Safety:** You cannot pass the wrong capability to the wrong opcode. The method _is_ the opcode.
  - **No Engine Rewrite:** These classes just call the existing `sys.*` opcodes under the hood.

```typescript
// Script view
export class EntityControl {
  constructor(private id: string) {}

  destroy() {
    // Calls the sophisticated internal opcode
    sys.destroy(this.toCapability());
  }
}
```

### 2. Strict Type Generation for Scripts

- **Action:** Auto-generate TypeScript definitions (`.d.ts`) for every available verb and capability in the system.
- **Result:** The user (or AI) gets red squiggles immediately if they try to call `entity.jump()` on an entity that doesn't have a `jump` verb.

### 3. Static Analysis Linter

- **Action:** Create a targeted linter (or TS plugin) that forbids usage of "Raw" `sys.*` opcodes, forcing usage of the Safe Wrappers.

---

## Phase 2: Medium-term (Structural Safety)

### 4. "Result" Pattern for Opcodes

- **Problem:** Currently, failures might throw or return null/undefined ambiguously.
- **Solution:** Standardize on a `Result<T, E>` type for all potentially failing operations.
- **Enforcement:** compiler forces handling the error case (or explicitly unwrapping).

### 5. Simulator / Dry-Run Mode

- **Action:** Expose a `sys.simulate(() => { ... })` context.
- **Benefit:** Allows scripts to "try" an action to see if it would fail (e.g., check if a capability is valid for a target) without actually committing the side effect. Crucial for AI agents planning actions.

---

## Phase 3: Long-term (The "True" Object-Capability Model)

### 6. Native Class Persistence

- **Goal:** Move away from "Data + Opcodes" entirely.
- **Architecture:** The database stores _Objects_ (properties + prototype reference). Capabilities are just objects with sensitive methods.
- **Refactor:** This requires the `repo.ts` serialization layer to handle hydrating specific classes based on a `_class` discriminator.
- **Benefit:** Unified mental model. No more "Script vs Engine" duality for capabilities. A capability _is_ just a script object.

### 7. Formal Verification Hooks

- **Concept:** Allow defining Invariants on Entities (e.g., `hp >= 0`).
- **Mechanism:** The runtime checks these invariants after every transaction. If violated, the transaction rolls back.
- **Why:** Impossible to leave an entity in a broken state.

---

## Recommendation for Immediate Action

1.  **Implement Phase 1 (Typed Facade):** This gives 90% of the DX benefit (autocomplete, type safety) with 0% of the persistence refactor risk.
2.  **Define the Wrapper Classes:** Create a standard library of `Capability` wrappers.
3.  **Deprecate Raw Opcodes:** Mark `sys.create` etc. as `@internal` or `@deprecated` to discourage direct use.
