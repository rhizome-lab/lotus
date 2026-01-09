# Roadmap: Maximizing Maintainability & Safe Coding

**Goal:** Optimize the Lotus ecosystem for humans and AI to write code as simply and safely as possible, minimizing the potential for broken code. Prioritize Discoverability and Maintainability over refactor cost.

## Core Philosophy: "The Pit of Success"

APIs and tools should be designed so that the _easiest_ way to do something is also the _correct_ and _secure_ way.

---

## Phase 1: Short-term (High Impact, Low Refactor)

These steps can be implemented immediately on top of the current engine to strictly enforce safety and improve DX.

### Current Status (Dec 2025)

- **Typed Facade**:- **Deprecated**: `WrappedEntity` (Removed/Replaced by Capability Classes)
- **Implemented**: `std.call_method` (Accessing Capability Methods)
- **Implemented**: Capability Classes (e.g. `EntityControl` for `update`, `destroy`, `setPrototype`)
- **Protected**: `create` (Requires `sys.create`), `sudo` (Requires `sys.sudo`)
- **Removed**: Raw `destroy`, `set_entity`, `set_prototype` opcodes (Now handled by `EntityControl`), ensuring 100% type safety and runtime security without manual checks in methods.
- **Strict Type Generation**: In Progress. `generated_types.ts` is being generated with interfaces for Entities and Verbs.
- **Standard Library**:
  - ✅ `std.int`, `std.float`, `std.number` added for safe parsing.
  - ✅ `std.random` refactored for clarity.
  - ✅ `std.call_method` is **implemented**.

### 0. Language Agnosticism & The SDK Layer

Reed is designed to be language-agnostic. The strategies below distinguish between the **Kernel** (Opcodes, VM) which remains universal, and the **SDK** (Language-Specific Bindings) which provides the "Human/AI Friendly" surface area.

- **Kernel:** Remains low-level, opcode-based, and secure. Validated by the engine.
- **SDK:** Provides the "Typed Facade". For TypeScript, this means **Capability Classes**.
- **Goal:** The AI/Human writes against the SDK. The SDK talks to the Kernel.

### Phase 2: Capability Classes (Status: Implemented)

We have moved away from raw opcodes for sensitive operations. Instead, we use **Capability Classes** which expose methods via `std.call_method`.

- **EntityControl**: Wraps `target_id` or `*` wildcard.
  - `update(id, props)`: Replaces `set_entity`. Checks ownership.
  - `destroy(id)`: Replaces `destroy`. Checks ownership.
  - `setPrototype(id, protoId)`: Replaces `set_prototype`. Checks ownership.

Raw opcodes `destroy`, `set_entity`, and `set_prototype` have been **removed** from the runtime.

### Phase 3: Typed Facade & Validation (Status: In Progress)

### 1. The "Typed Facade" (Capability Classes)

Instead of exposing raw opcodes (`sys.create(cap, ...)`), we expose **Typed Capability Classes** to the scripting environment.

- **Concept:** The runtime provides classes that wrap specific capabilities.
- **Benefit:**
  - **Discoverability:** `cap.` triggers autocomplete showing exactly what _this_ capability can do.
  - **Safety:** You cannot pass the wrong capability to the wrong opcode. The method _is_ the opcode.
  - **Strictness:** The raw opcodes (`sys.destroy`, `sys.create`) are **deprecated** in user code, favoring the class methods.
  - **Zero Overhead:** These classes are lightweight wrappers around the internal opcodes.

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

### 2. New Opcode: `std.call_method` (Critical for Polyglot)

- **Problem:** `std.apply(obj.get("method"), args)` loses the `this` context in JS and doesn't map to Lua's `obj:method()` syntax.
- **Solution:** Introduce `std.call_method(obj, "method", args)`.
- **Compilation:**
  - **JS:** `obj["method"](...args)` (Preserves `this`)
  - **Lua:** `obj:method(...args)`
- **Benefit:** Allows the SDK to wrap methods correctly in any language.

### 3. Strict Type Generation for Scripts

- **Action:** Auto-generate TypeScript definitions (`.d.ts`) for every available verb and capability in the system.
- **Result:** The user (or AI) gets red squiggles immediately if they try to call `entity.jump()` on an entity that doesn't have a `jump` verb.

### 4. Hidden Opcodes (Deprecated Raw Opcodes)

- **Action:** Add a `hidden` property to `OpcodeMetadata`.
- **Result:** Opcodes marked as `hidden: true` are excluded from the generated TypeScript definitions. This effectively hides "Raw" opcodes like `sys.create` from the SDK surface, forcing users to use the safe wrapper classes, without requiring a separate linter.

---

## Phase 2: Medium-term (Structural Safety)

### 5. "Result" Pattern for Opcodes

- **Problem:** Currently, failures might throw or return null/undefined ambiguously.
- **Solution:** Standardize on a `Result<T, E>` type for all potentially failing operations.
- **Enforcement:** compiler forces handling the error case (or explicitly unwrapping).

### 6. Simulator / Dry-Run Mode

- **Action:** Expose a `sys.simulate(() => { ... })` context.
- **Benefit:** Allows scripts to "try" an action to see if it would fail (e.g., check if a capability is valid for a target) without actually committing the side effect. Crucial for AI agents planning actions.

---

## Phase 3: Long-term (The "True" Object-Capability Model)

### 7. Type-Tagged Persistence (The Polyglot Approach)

- **Goal:** Unify the mental model while supporting multiple languages.
- **Architecture:**
  - **Database:** Stores **Typed Objects** (Structs) with a stable Type ID (e.g., `"lotus.capability.control"`). It does _not_ store language-specific class names.
  - **Kernel:** Passes Typed Objects to the Scripting Host.
  - **Scripting Host (SDK):** Responsible for **Hydration**. It maintains a registry mapping Type IDs to Native Classes (TS Class, Lua Table, Python Class).
- **Refactor:** Requires `repo.ts` to support storing/retrieving the `_type` discriminator.
- **Benefit:** A `lotus.capability.control` stored in the DB can be loaded as a `class EntityControl` in TypeScript or a `meta_table` in Lua. The data is universal; the behavior is native.

### 8. Formal Verification Hooks

- **Concept:** Allow defining Invariants on Entities (e.g., `hp >= 0`).
- **Mechanism:** The runtime checks these invariants after every transaction. If violated, the transaction rolls back.
- **Why:** Impossible to leave an entity in a broken state.

---

## Recommendation for Immediate Action

1.  **Implement Phase 1 (Typed Facade):** This gives 90% of the DX benefit (autocomplete, type safety) with 0% of the persistence refactor risk.
2.  **Define the Wrapper Classes:** Create a standard library of `Capability` wrappers.
3.  **Deprecate Raw Opcodes:** Mark `sys.create` etc. as `@internal` or `@deprecated` to discourage direct use.
