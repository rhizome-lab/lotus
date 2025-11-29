# Scripting Language Specification

The Viwo scripting language is a dynamic, JSON-based language that uses S-expressions (Lisp-like syntax) represented as JSON arrays. It is designed to be embedded in JSON documents and executed by the Viwo core engine.

## Core Syntax

Scripts are represented as JSON arrays where the first element is the opcode (a string) and the subsequent elements are arguments. Arguments can be literals (numbers, strings, booleans, null), other S-expressions (nested arrays), or variable references.

Example:
```json
["seq",
  ["log", "Hello World"],
  ["let", "x", 10],
  ["if", [">", ["var", "x"], 5],
    ["log", "x is greater than 5"],
    ["log", "x is small"]
  ]
]
```

### Evaluation
- **Literals**: Numbers, strings, booleans, and null evaluate to themselves.
- **Arrays**: The first element is treated as the opcode. If the opcode is registered, the function is executed with the evaluated arguments (unless the opcode is a special form like `if` or `let` which might handle evaluation differently).
- **Unknown Opcodes**: If an array starts with a string that is not a known opcode, a `ScriptError` is thrown.

### Target Syntax
Many opcodes take a `target` argument (e.g., `tell`, `move`, `give`). This argument is flexible and can be:
- **"me"**: The entity executing the script (`ctx.caller`).
- **"this"**: The entity the script is attached to (`ctx.this`).
- **"here"**: The room the caller is currently in.
- **Entity ID (number)**: The direct ID of an entity.
- **Entity Name (string)**: Searches for an entity by name, first in the caller's inventory, then in the caller's room.
- **Entity Object**: An entity object itself (e.g. from a variable).

> [!WARNING]
> **Common Pitfalls**:
> - Use `"me"` to refer to the caller. Do NOT use `"caller"`.
> - Use `"seq"` for a sequence of commands. Do NOT use `"do"`.


## Core Library
*Defined in: `packages/core/src/scripting/lib/core.ts`*

The core library provides essential control flow, variable management, arithmetic, logic, and system interaction.

### Control Flow
- `["seq", ...steps]`: Executes steps in sequence. Returns the result of the last step.
- `["if", cond, then, else?]`: Conditional execution.
- `["while", cond, body]`: Repeats body while condition is true.
- `["for", varName, list, body]`: Iterates over a list.
- `["try", tryBlock, errorVar?, catchBlock?]`: Exception handling.
- `["throw", msg]`: Throws an error.

### Variables
- `["let", name, value]`: Defines a variable in the current scope.
- `["var", name]`: Retrieves a variable's value.
- `["set", name, value]`: Updates an existing variable.

### Comparison
All comparison operators support chaining (e.g., `["<", 1, 2, 3]` checks `1 < 2` AND `2 < 3`).

- `["==", a, b, ...]`: Equality check. Returns true if all adjacent arguments are equal.
- `["!=", a, b, ...]`: Inequality check. Returns true if all adjacent arguments are different.
- `["<", a, b, ...]`: Less than. Returns true if `a < b < ...`.
- `[">", a, b, ...]`: Greater than. Returns true if `a > b > ...`.
- `["<=", a, b, ...]`: Less than or equal. Returns true if `a <= b <= ...`.
- `[">=", a, b, ...]`: Greater than or equal. Returns true if `a >= b >= ...`.

### Arithmetic
All arithmetic operators support multiple arguments, processing them from left to right.

- `["+", a, b, ...]`: Addition. `a + b + ...`
- `["-", a, b, ...]`: Subtraction. `a - b - ...`
- `["*", a, b, ...]`: Multiplication. `a * b * ...`
- `["/", a, b, ...]`: Division. `a / b / ...`
- `["%", a, b]`: Modulo. `a % b`
- `["^", a, b, ...]`: Exponentiation (Power Tower). `a ^ b ^ ...` (evaluated right-to-left, i.e., `base ^ (next ^ ...)`).

### Logic
- `["and", ...args]`: Logical AND.
- `["or", ...args]`: Logical OR.
- `["not", arg]`: Logical NOT.

### System & Debugging
- `["log", ...msgs]`: Logs messages to the console.
- `["warn", msg]`: Adds a warning.
- `["print", msg]`: Sends a message to the user.
- `["random", min?, max?]`: Generates a random number.
- `["arg", index]`: Gets a script argument by index.
- `["args"]`: Gets all script arguments.

### Entity Interaction
- `["tell", target, msg]`: Sends a message to a target entity.
- `["say", msg]`: Broadcasts a message to the room.
- `["move", target, dest]`: Moves an entity to a destination.
- `["create", data]`: Creates a new entity. `data` can be `{ kind, name, props, location_id }` or arguments `[kind, name, props?, location_id?]`.
- `["destroy", target]`: Destroys an entity.
- `["give", target, dest]`: Transfers ownership of an item.
- `["prop", target, key]`: Gets a property value.
- `["set_prop", target, key, value]`: Sets a property value.
- `["contents", container]`: Gets contents of a container.
- `["verbs", entity]`: Gets verbs of an entity.
- `["entity", id]`: Gets an entity by ID.

### Functions
- `["lambda", [argNames], body]`: Creates a lambda function.
- `["apply", func, ...args]`: Calls a lambda function.
- `["call", target, verb, ...args]`: Calls a verb on an entity.
- `["schedule", verb, args, delay]`: Schedules a verb call.

### Other
- `["broadcast", msg, location?]`: Broadcasts a message.
- `["world.find", name]`: Finds an entity ID by name (supports "me", "here", "this").
- `["sys.can_edit", entityId]`: Checks if the caller can edit an entity.

## List Library
*Defined in: `packages/core/src/scripting/lib/list.ts`*

Operations for working with arrays.

- `["list", ...items]`: Creates a list.
- `["list.len", list]`: Returns the length of a list.
- `["list.empty", list]`: Checks if a list is empty.
- `["list.get", list, index]`: Gets an item at an index.
- `["list.set", list, index, value]`: Sets an item at an index.
- `["list.push", list, value]`: Adds an item to the end.
- `["list.pop", list]`: Removes and returns the last item.
- `["list.unshift", list, value]`: Adds an item to the beginning.
- `["list.shift", list]`: Removes and returns the first item.
- `["list.slice", list, start, end?]`: Returns a sub-list.
- `["list.splice", list, start, deleteCount, ...items]`: Modifies a list.
- `["list.concat", list1, list2]`: Concatenates two lists.
- `["list.includes", list, value]`: Checks if a value exists in the list.
- `["list.reverse", list]`: Reverses the list.
- `["list.sort", list]`: Sorts the list.
- `["list.join", list, sep]`: Joins list elements into a string.
- `["list.find", list, func]`: Finds an element using a predicate.
- `["list.map", list, func]`: Maps a function over the list.
- `["list.filter", list, func]`: Filters the list using a predicate.
- `["list.reduce", list, func, init]`: Reduces the list.
- `["list.flatMap", list, func]`: Maps and flattens the list.

## Object Library
*Defined in: `packages/core/src/scripting/lib/object.ts`*

Operations for working with objects (dictionaries).

- `["object", key1, val1, ...]`: Creates an object.
- `["obj.keys", obj]`: Returns keys.
- `["obj.values", obj]`: Returns values.
- `["obj.entries", obj]`: Returns entries.
- `["obj.get", obj, key]`: Gets a value.
- `["obj.set", obj, key, value]`: Sets a value.
- `["obj.has", obj, key]`: Checks if a key exists.
- `["obj.del", obj, key]`: Deletes a key.
- `["obj.merge", ...objs]`: Merges objects.
- `["obj.map", obj, func]`: Maps values.
- `["obj.filter", obj, func]`: Filters entries.
- `["obj.reduce", obj, func, init]`: Reduces entries.
- `["obj.flatMap", obj, func]`: Maps and flattens.

## String Library
*Defined in: `packages/core/src/scripting/lib/string.ts`*

Operations for working with strings.

- `["str.len", str]`: Returns length.
- `["str.concat", ...strs]`: Concatenates strings.
- `["str.split", str, sep]`: Splits a string.
- `["str.slice", str, start, end?]`: Returns a substring.
- `["str.upper", str]`: Converts to uppercase.
- `["str.lower", str]`: Converts to lowercase.
- `["str.trim", str]`: Trims whitespace.
- `["str.replace", str, search, replace]`: Replaces a substring.
- `["str.includes", str, search]`: Checks if substring exists.
- `["str.join", list, sep]`: Joins a list of strings.

## Time Library
*Defined in: `packages/core/src/scripting/lib/time.ts`*

Operations for working with time.

- `["time.now"]`: Returns current ISO timestamp.
- `["time.format", timestamp]`: Formats a timestamp.
- `["time.parse", datetime]`: Parses a datetime string.
- `["time.from_timestamp", number]`: Converts number to ISO string.
- `["time.to_timestamp", datetime]`: Converts ISO string to number.
- `["time.offset", amount, unit, base?]`: Adds an offset to a date. Units: "year", "month", "day", "hour", "minute", "second".

## World Library
*Defined in: `packages/core/src/scripting/lib/world.ts`*

Operations for querying the game world.

- `["world.time"]`: Returns current world time (timestamp).
- `["world.players"]`: Returns a list of all player IDs.
- `["world.entities"]`: Returns a list of all entity IDs.
- `["world.where", target]`: Returns the location ID of a target.
- `["entity.contents", target]`: Returns contents of an entity (ID list).
- `["entity.descendants", target]`: Returns all descendants of an entity.
- `["entity.ancestors", target]`: Returns all ancestors of an entity.
- `["entity.verbs", target]`: Returns verb names of an entity.
- `["player.verbs"]`: Returns all available verbs for the current player (from self, room, items, inventory).
