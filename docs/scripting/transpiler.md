# ViwoScript Transpiler

The Transpiler is a tool that converts TypeScript code into ViwoScript's internal JSON S-expression format. This allows developers to write scripts in a familiar, type-safe language (TypeScript) and execute them within the Viwo runtime.

## Usage

```typescript
import { transpile } from "@viwo/scripting";

const code = `
  let x = 10;
  console.log("Value:", x);
`;

const script = transpile(code);
console.log(JSON.stringify(script, null, 2));
/* Output:
[
  "seq",
  ["let", "x", 10],
  ["log", "Value:", ["var", "x"]]
]
*/
```

## Features

The transpiler supports a subset of TypeScript that maps to ViwoScript opcodes:

### Variables

- **Declaration**: `let x = 1;` -> `["let", "x", 1]`
- **Access**: `x` -> `["var", "x"]`
- **Assignment**: `x = 2;` -> `["set", "x", 2]`

### Special Variables

- **this**: `this` -> `["this_"]` (Accesses the current entity context)

### Literals

- **Numbers**: `123`
- **Strings**: `"hello"`
- **Template Strings**: `` `Hello ${name}` `` -> `["str.concat", "Hello ", name]`
- **Booleans**: `true`, `false`
- **Null**: `null`

### Data Structures

- **Arrays**: `[1, 2, 3]` -> `["list.new", 1, 2, 3]`
- **Objects**: `{ a: 1 }` -> `["obj.new", "a", 1]`

### Object Access

- **Property**: `obj.x` -> `["obj.get", obj, "x"]`
- **Index**: `obj['x']` -> `["obj.get", obj, "x"]`
- **Fallback**: `obj.x || default` -> `["obj.get", obj, "x", default]`
- **Fallback**: `obj.x ?? default` -> `["obj.get", obj, "x", default]`
- **Assignment**: `obj.x = 1` -> `["obj.set", obj, "x", 1]`
- **Delete**: `delete obj.x` -> `["obj.del", obj, "x"]`
- **In**: `'x' in obj` -> `["obj.has", obj, "x"]`

### Operators

- **Arithmetic**: `+`, `-`, `*`, `/`, `%`, `**`
- **Comparison**: `==`, `!=`, `<`, `>`, `<=`, `>=`
- **Logical**: `&&`, `||`, `!`

### Control Flow

- **If/Else**: `if (c) { ... } else { ... }` -> `["if", c, then, else]`
- **While**: `while (c) { ... }` -> `["while", c, body]`
- **For...Of**: `for (let x of list) { ... }` -> `["for", "x", list, body]`
- **Try/Catch**: `try { ... } catch (e) { ... }` -> `["try", try, "e", catch]`
- **Throw**: `throw "err"` -> `["throw", "err"]`

### Functions

- **Lambdas**: `(x) => x + 1` -> `["lambda", ["x"], ...]`
- **Function Declarations**: `function f(x) { ... }` -> `["let", "f", ["lambda", ["x"], ...]]`
- **Calls**: `f(x)` -> `["apply", ["var", "f"], x]` (if `f` is a variable)

## Opcode Resolution Heuristic

ViwoScript uses opcodes (e.g., `log`, `if`) that look like function calls in TypeScript. To distinguish between a call to a local variable (which requires `apply`) and a direct opcode call, the transpiler uses the following heuristic:

1.  **Scope Tracking**: The transpiler tracks all locally defined variables (via `let`, `function`, parameters).
2.  **Resolution**:
    - If an identifier **is** in the local scope, it is treated as a variable: `f(x)` -> `["apply", ["var", "f"], x]`.
    - If an identifier is **NOT** in the local scope, it is assumed to be an opcode: `log(x)` -> `["log", x]`.

### Sanitization Reversal

TypeScript reserved keywords (like `if`, `while`, `try`) cannot be used as function names. To use these opcodes, append an underscore in TypeScript:

- `if_(cond, then, else)` -> `["if", cond, then, else]`

### Ambient Declarations

`declare` statements are ignored by the transpiler and do **not** add variables to the scope. This allows you to declare types or globals for TypeScript's type checker without affecting the transpiler's opcode resolution.

```typescript
declare function myOpcode(x: number): void;
myOpcode(1); // Transpiles to ["myOpcode", 1]
```

## Usage in Seeds

The transpiler is heavily used in the seeding process to allow writing verbs in TypeScript.

1.  **Define Verbs**: Verbs are defined as exported functions in `packages/core/src/seeds/verbs.ts`.
2.  **Extract Body**: The `extractVerb` helper reads the function body from the source file.
3.  **Transpile**: The body string is passed to `transpile()` to generate the ViwoScript AST.

```typescript
// In seeds/verbs.ts
// @verb look
export function look() {
  // ... code ...
}
// @endverb

// In seed.ts
import { transpile } from "@viwo/scripting";
import { extractVerb } from "./verb_loader";

addVerb(id, "look", transpile(extractVerb(verbsPath, "look")));
```
