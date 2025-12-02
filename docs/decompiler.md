# ViwoScript Decompiler

The Decompiler is a tool designed to convert the internal JSON representation of ViwoScript into a human-readable, TypeScript-like syntax. This facilitates debugging, editing, and interaction with LLMs.

## Usage

```typescript
import { decompile } from "@viwo/scripting";

const script = ["seq", ["let", "x", 1], ["var", "x"]];
const code = decompile(script);
console.log(code);
// Output:
// let x = 1;
// x;
```

## Mapping Rules

The decompiler attempts to produce valid TypeScript code where possible, mapping internal opcodes to standard TS constructs.

### Control Flow

| Opcode                     | TypeScript Equivalent             | Notes                                                              |
| :------------------------- | :-------------------------------- | :----------------------------------------------------------------- |
| `["seq", ...]`             | Block `{ ... }` or Sequence       | Decompiled as statements in a block or IIFE in expression context. |
| `["if", cond, then, else]` | `if (cond) { ... } else { ... }`  | Uses ternary `cond ? then : else` in expression context.           |
| `["while", cond, body]`    | `while (cond) { ... }`            | Wrapped in IIFE if used as expression.                             |
| `["for", var, list, body]` | `for (const var of list) { ... }` | Wrapped in IIFE if used as expression.                             |

### Variables

| Opcode               | TypeScript Equivalent | Notes |
| :------------------- | :-------------------- | :---- |
| `["let", name, val]` | `let name = val`      |       |
| `["set", name, val]` | `name = val`          |       |
| `["var", name]`      | `name`                |       |

### Functions

| Opcode                     | TypeScript Equivalent | Notes                                             |
| :------------------------- | :-------------------- | :------------------------------------------------ |
| `["lambda", [args], body]` | `(args) => body`      | Body is decompiled as a block if it's a sequence. |
| `["apply", func, ...args]` | `func(...args)`       |                                                   |

### Infix Operators

Standard math and logic operators are mapped to their infix counterparts:

- `+`, `-`, `*`, `/`, `%`
- `==` -> `===`, `!=` -> `!==`
- `<`, `>`, `<=`, `>=`
- `and` -> `&&`, `or` -> `||`
- `^` -> `Math.pow(a, b)`
- `not` -> `!a`

### Data Structures

| Opcode                        | TypeScript Equivalent   |
| :---------------------------- | :---------------------- | ------------------------------------------------------------------------- |
| `["list.new", ...items]`      | `[items...]`            |
| `["obj.new", k1, v1, ...]`    | `{ k1: v1, ... }`       |
| `["obj.get", obj, key, def?]` | `obj[key]` or `obj.key` | Uses dot notation for valid identifiers. Supports default value via `??`. |
| `["obj.set", obj, key, val]`  | `obj[key] = val`        |                                                                           |
| `["obj.has", obj, key]`       | `key in obj`            |                                                                           |
| `["obj.del", obj, key]`       | `delete obj[key]`       |                                                                           |

### Standard Library

Other opcodes are generally decompiled as function calls, e.g., `["log", "msg"]` -> `console.log("msg")`.
Exceptions:

- `["throw", err]` -> `throw err`
- `["try", try, err, catch]` -> `try { ... } catch (err) { ... }`

## Implementation Details

The `decompile` function takes three arguments:

1. `script`: The JSON script to decompile.
2. `indentLevel`: Current indentation level (default 0).
3. `isStatement`: Boolean flag indicating if the current context expects a statement (default `false`).

The `isStatement` flag is crucial for correctly handling constructs that can be both statements and expressions (like `if` and `seq`).
