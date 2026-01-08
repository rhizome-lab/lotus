# LotusScript Compiler

The Compiler is a tool designed to transform the internal JSON representation of LotusScript into executable JavaScript functions. This significantly improves performance by removing the overhead of AST traversal at runtime.

## Usage

```typescript
import { compile, createScriptContext } from "@lotus/scripting";

const script = ["seq", ["let", "x", 1], ["var", "x"]];
const compiledFn = compile(script);

const ctx = createScriptContext({ args: [] });
const result = compiledFn(ctx);
console.log(result); // Output: 1
```

## Compilation Strategy

The compiler generates a synchronous JavaScript function that takes a `ScriptContext` as an argument. It maps LotusScript opcodes directly to JavaScript constructs where possible.

### Control Flow

| Opcode                     | JavaScript Output                  | Notes                                  |
| :------------------------- | :--------------------------------- | :------------------------------------- |
| `["seq", ...]`             | `stmt1; stmt2; ...`                | Compiles to a sequence of statements.  |
| `["if", cond, then, else]` | `if (cond) { ... } else { ... }`   | Compiles to native if/else statements. |
| `["while", cond, body]`    | `while (cond) { body }`            | Compiles to native while loop.         |
| `["for", var, list, body]` | `for (const var of list) { body }` | Compiles to native for-of loop.        |

### Variables

| Opcode               | JavaScript Output | Notes                                                 |
| :------------------- | :---------------- | :---------------------------------------------------- |
| `["let", name, val]` | `let name = val`  | Declares a local variable in the current block scope. |
| `["set", name, val]` | `name = val`      | Assigns to a variable.                                |
| `["var", name]`      | `name`            | Accesses a variable.                                  |

### Functions

| Opcode                     | JavaScript Output    | Notes                                                              |
| :------------------------- | :------------------- | :----------------------------------------------------------------- |
| `["lambda", [args], body]` | `(args) => { ... }`  | Compiles to a JavaScript arrow function.                           |
| `["apply", func, ...args]` | `func(ctx, ...args)` | Calls the function, passing the context if it's a compiled lambda. |

### Standard Library Optimizations

Common standard library opcodes are inlined for performance:

- **Math**: `+`, `-`, `*`, `/`, `%` are compiled to native JS operators.
- **Logic**: `and`, `or`, `not` are compiled to `&&`, `||`, `!`.
- **Comparison**: `==`, `!=`, `<`, `>`, `<=`, `>=` are compiled to native JS comparison operators.
- **Object**: `obj.get`, `obj.set` use direct property access `obj[key]`.

### Generic Fallback

For opcodes that are not explicitly optimized, the compiler generates a call to the generic `evaluate` function or the specific opcode handler if available in the context.

## Performance

Benchmarking shows a **~9.5x speedup** for execution of heavy loops compared to the interpreter. This is achieved by:

1.  Removing the overhead of recursive `evaluate` calls.
2.  Leveraging the V8 engine's JIT compilation for the generated JavaScript code.
3.  Inlining common operations.
