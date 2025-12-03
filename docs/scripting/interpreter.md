# ViwoScript Interpreter

The ViwoScript interpreter is a stack-based virtual machine designed for executing ViwoScript S-expressions. It uses a Structure of Arrays (SOA) layout for its execution stack to optimize for cache locality and reduce garbage collection overhead.

## Architecture

Unlike traditional interpreters that might use recursion or an array of objects for stack frames, the ViwoScript interpreter manages its execution state using parallel arrays. This "Structure of Arrays" (SOA) approach means that instead of having a single `StackFrame` object containing all data for a call, the data is split across multiple typed arrays.

This design allows the interpreter to:

- **Reuse Arrays**: Argument arrays are pooled and reused, significantly reducing memory allocation during execution.
- **Improve Locality**: Accessing related data (like opcodes) is more cache-friendly as they are stored contiguously.

## Stack Layout

The execution stack is composed of several parallel arrays, indexed by a stack pointer (`sp`).

- **`stackOp: string[]`**: Stores the opcode for the current frame.
- **`stackArgs: unknown[][]`**: Stores the evaluated arguments for the current frame. These arrays are reused to minimize GC pressure.
- **`stackAst: any[][]`**: Stores the raw AST (S-expression) being evaluated.
- **`stackIdx: number[]`**: Stores the current index within the AST, tracking which argument is currently being processed.

## Usage

The primary entry point for the interpreter is the `evaluate` function.

```typescript
import { evaluate, createScriptContext } from "@viwo/scripting";

const script = ["seq", ["log", "Hello"], ["+", 1, 2]];
const ctx = createScriptContext({
  // ... context setup
});

const result = await evaluate(script, ctx);
```

### ScriptContext

The `ScriptContext` holds the environment for the script execution, including:

- **`vars`**: Local variables.
- **`args`**: Arguments passed to the script.
- **`this`**: The entity the script is executing on.
- **`caller`**: The entity that called the script.
- **`gas`**: Execution limit to prevent infinite loops.
