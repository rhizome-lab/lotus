# Investigation: Class-based Capability Security

This document details the investigation into replacing the current opcode-based capability system with a class-based (Object-Capability) approach, including a comparison of pros and cons.

## Current Architecture: Opcode/Token

Currently, security is implemented using **Opcodes** and **Data Tokens**.

- **Capabilities** contain an `id` (UUID) and metadata, stored in a database.
- **Opcodes** (like `create`, `set_entity`, `sudo`) accept a `Capability` object as an argument.
- **Verification** happens inside the opcode via `checkCapability`, which verifies the token against the database and checks ownership (must be owned by the caller).

```typescript
// Current Pattern
const cap = get_capability(...);
sys.create(cap, { ... });
```

## Proposed Architecture: Class-based (Object-Cap)

In a class-based, object-capability model, the capability itself is an object with methods that perform the privileged actions. The "token" is internal to the object and hidden from the user.

```typescript
// Proposed Pattern
const cap = get_capability(...); // Returns an instance of SystemCreateCapability
cap.create({ ... });
```

### Prototype Findings

A prototype (`scratch/capability_prototype.ts`) demonstrated that:

1.  **Encapsulation:** Using private class fields (`#id` or closures) effectively hides the underlying security token from the script, preventing forgery even if the token logic was client-side (though currently, server-side DB checks prevent forgery regardless).
2.  **Ergonomics:** The API is significantly cleaner (`cap.create()` vs `create(cap)`).

## Comparison

| Feature           | Opcode / Token (Current)                                               | Class-based (Proposed)                                                                                  |
| :---------------- | :--------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------ |
| **API Style**     | Procedural: `verb(cap, arg)`                                           | Object-Oriented: `cap.verb(arg)`                                                                        |
| **Granularity**   | Coarse: `Capability` type string determines permissions.               | Fine: Methods on the object determine permissions. Can return limited subsets (e.g., ReadOnly wrapper). |
| **Encapsulation** | Low: Token is visible property of object. Security relies on DB check. | High: Token can be hidden. Object _is_ the authority.                                                   |
| **Persistence**   | **Simple:** JSON serialize/deserialize.                                | **Complex:** Must hydrate specific classes/closures from DB state.                                      |
| **Delegation**    | **Restricted:** Must transfer ownership in DB.                         | **Flexible:** Passing the object reference delegates authority immediately.                             |
| **Revocation**    | **Easy:** Delete row in DB.                                            | **Harder:** If using loose references. (Can be solved with Revocable Proxies).                          |

## Pros and Cons

### Class-based Approach

**Pros:**

- **Better DX:** More intuitive API for developers.
- **Encapsulation:** Follows "Principle of Least Authority" more naturally. You possess the tool to do the job, rather than a key to a global tool.
- **Static Analysis:** TypeScript can better infer what you can do based on the object type (e.g., `EntityControlCap` has `.destroy()`, but `EntityReadCap` wouldn't).

**Cons:**

- **Serialization Complexity:** Resuming a script requires reconstructing the exact object graph.
- **Global Pollution:** Instead of 5-10 global security opcodes, we might need to expose many Capability classes or factories.
- **Refactor Cost:** Requires changing the compiler/runtime to support these "magic" objects and potentially removing the global opcodes.

## Conclusion & Recommendation

It is entirely **possible** to implement class-based security.

**Recommendation:**
If the primary goal is **Security**, the current system is adequate.
If the primary goal is **Developer Experience (DX)** and **Modularity**, the Class-based approach is superior.

**Hybrid Suggestion:**
We could implement a "Client-side Wrapper" pattern where the runtime provides classes that wrap the opcodes.

- User sees: `cap.create(...)`
- Implementation: `class Cap { create(data) { return sys.create(this.token, data); } }`
  This gives the DX benefits without rewriting the low-level security kernel or persistence layer.
