# Seeding and Verbs

The seeding process in Viwo is responsible for populating the world with initial entities, items, and verbs. This document explains how seeds are structured and how verbs are defined and loaded.

## Overview

Seeds are TypeScript functions that use the repository API to create entities and assign capabilities. To ensure type safety and maintainability, verb logic is defined in a dedicated TypeScript file and then transpiled into ViwoScript at runtime.

## Verb Definitions

All seed verbs are defined in `packages/core/src/seeds/verbs.ts`. Each verb is a standard exported TypeScript function, annotated with special comments to mark its boundaries.

### Format

```typescript
// @verb my_verb_name
export function my_verb_name() {
  const target = arg(0);
  call(caller(), "tell", "Hello from my verb!");
}
// @endverb
```

- **`// @verb <name>`**: Marks the start of the verb definition. The name must match the function name.
- **Function Body**: The code inside the function is what gets transpiled. It can use global ViwoScript functions like `call`, `arg`, `caller`, `entity`, etc.
- **`// @endverb`**: Marks the end of the verb definition.

This approach allows you to write verb logic with full TypeScript support, including type checking (via `types.d.ts`) and IDE autocompletion.

## Verb Loading

The `packages/core/src/verb_loader.ts` utility provides the `extractVerb` function. This function reads the `verbs.ts` file and extracts the body of a specific verb function as a string.

```typescript
import { extractVerb } from "../verb_loader";
import { resolve } from "path";

const verbsPath = resolve(__dirname, "verbs.ts");
const verbBody = extractVerb(verbsPath, "my_verb_name");
```

## Transpilation in Seeds

In the seed files (e.g., `seed.ts`, `seeds/items.ts`, `seeds/hotel.ts`), we use the `transpile` function from `@viwo/scripting` to convert the extracted verb body into ViwoScript opcodes.

```typescript
import { createEntity, addVerb } from "../repo";
import { transpile } from "@viwo/scripting";
import { extractVerb } from "../verb_loader";

// ... inside a seed function ...

addVerb(
  entityId,
  "my_action",
  transpile(extractVerb(verbsPath, "my_verb_name")),
);
```

### Dynamic Values

Sometimes you need to inject dynamic values (like entity IDs) into the verb code. Since `extractVerb` returns a string, you can use string replacement before transpilation.

```typescript
const code = extractVerb(verbsPath, "enter_room");
const finalCode = code.replace("LOBBY_ID_PLACEHOLDER", String(lobbyId));

addVerb(roomId, "enter", transpile(finalCode));
```

## Benefits

1.  **Type Safety**: Verbs are written in TypeScript and checked against the ViwoScript API definitions.
2.  **Maintainability**: Verb logic is centralized in `verbs.ts` rather than being scattered as string literals or manual AST construction in seed files.
3.  **Readability**: Writing standard TypeScript functions is more natural than constructing JSON arrays for opcodes.
