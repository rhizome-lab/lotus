# Reed Development Rules

## Core Tenets

- **Synchronous by Default**: Most opcodes are synchronous. Only IO, network, and file system operations are asynchronous.
- **Capability Security**: You cannot just "do" things. You need a `Capability`.
  - `sys.create`: Required to create new entities.
  - `entity.control`: Required to modify an entity (set props, change location).
  - `sys.sudo`: Required to act as another entity.
  - **WARNING**: Avoid `entity.control { "*": true }` (root access) unless absolutely necessary. It bypasses all security checks.
- **Write in TypeScript**: Write Reed as standard TypeScript functions (e.g. in `verbs.ts`). The transpiler converts this to Reed. Do not write raw JSON S-expressions manually.
- **Type Definitions**: The available global functions (opcodes) are defined in `packages/core/src/types.ts`. Use this file to check function signatures.

## Common Patterns

### Entity Interaction

```typescript
// Get an entity
const room = entity(someId);

// Resolve properties (handle prototypes)
const props = resolve_props(room);
const name = props["name"];

// Move an entity
const cap = get_capability("entity.control", { target_id: mover.id });
if (cap) {
  mover["location"] = destId;
  set_entity(cap, mover);
}
```

### Lists and Iteration

```typescript
// Filter a list
const items = (room["contents"] as number[]) ?? [];
const visibleItems = list.filter(items, (id: number) => {
  const e = resolve_props(entity(id));
  return !e["invisible"];
});

// Map a list
const names = list.map(visibleItems, (id: number) => {
  return resolve_props(entity(id))["name"];
});
```

### Messaging

```typescript
// Send a message to the caller
call(caller(), "tell", "Hello!");

// Send a system message
send("message", "Something happened.");
```

## Type Definitions

Refer to `packages/core/src/types.ts` for the authoritative list of available global functions (opcodes).
Common ones include:
- `log(...args)`
- `call(target, verb, ...args)`
- `create(cap, data)`
- `destroy(cap, target)`
- `list.*` (new, push, map, filter, etc.)
- `obj.*` (get, set, keys, etc.)
- `str.*` (len, concat, split, etc.)
