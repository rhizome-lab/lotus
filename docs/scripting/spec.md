# Scripting Language Specification

The Viwo scripting language is a dynamic, JSON-based language that uses S-expressions (Lisp-like syntax) represented as JSON arrays. It is designed to be embedded in JSON documents and executed by the Viwo core engine.

## Core Syntax

Scripts are represented as JSON arrays where the first element is the opcode (a string) and the subsequent elements are arguments. Arguments can be literals (numbers, strings, booleans, null), other S-expressions (nested arrays), or variable references.

Example:

```json
[
  "seq",
  ["log", "Hello World"],
  ["let", "x", 10],
  [
    "if",
    [">", ["var", "x"], 5],
    ["log", "x is greater than 5"],
    ["log", "x is small"]
  ]
]
```

### Evaluation

- **Literals**: Numbers, strings, booleans, and null evaluate to themselves.
- **Arrays**: The first element is treated as the opcode. If the opcode is registered, the function is executed with the evaluated arguments (unless the opcode is a special form like `if` or `let` which might handle evaluation differently).
- **Unknown Opcodes**: If an array starts with a string that is not a known opcode, a `ScriptError` is thrown.

## Std Library

_Defined in: `packages/scripting/src/lib/std.ts`_

The standard library provides essential control flow, variable management, and system interaction tools.

### Context

- `["this"]`: The `Entity` the script is attached to (`ctx.this`).
- `["caller"]`: The `Entity` executing the script (`ctx.caller`).

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

### System & Debugging

- `["log", ...msgs]`: Logs messages to the server console.
- `["warn", msg]`: Adds a warning to the context.
- `["send", type, payload]`: Sends a system message (notification) to the caller.
- `["arg", index]`: Gets a script argument by index.
- `["args"]`: Gets all script arguments.
- `["typeof", value]`: Returns the type of the value ("string", "number", "boolean", "object", "null", "array").
- `["quote", value]`: Returns the value unevaluated.

### Functions & Calls

- `["lambda", [argNames], body]`: Creates a lambda function.
- `["apply", func, ...args]`: Calls a lambda function.

### Data Structures

- `["json.stringify", value]`: Converts value to JSON string.
- `["json.parse", string]`: Parses JSON string.

## Math Library

_Defined in: `packages/scripting/src/lib/math.ts`_

- `["+", a, b, ...]`: Addition.
- `["-", a, b, ...]`: Subtraction.
- `["*", a, b, ...]`: Multiplication.
- `["/", a, b, ...]`: Division.
- `["%", a, b]`: Modulo.
- `["^", a, b, ...]`: Exponentiation.
- `["random", min?, max?]`: Generates a random number.

## Boolean Library

_Defined in: `packages/scripting/src/lib/boolean.ts`_

All comparison operators support chaining (e.g., `["<", 1, 2, 3]` checks `1 < 2` AND `2 < 3`).

- `["==", a, b, ...]`: Equality check.
- `["!=", a, b, ...]`: Inequality check.
- `["<", a, b, ...]`: Less than.
- `[">", a, b, ...]`: Greater than.
- `["<=", a, b, ...]`: Less than or equal.
- `[">=", a, b, ...]`: Greater than or equal.
- `["and", ...args]`: Logical AND.
- `["or", ...args]`: Logical OR.
- `["not", arg]`: Logical NOT.

## Core Library (DB & Entity)

_Defined in: `packages/core/src/runtime/lib/core.ts`_

The core library provides interaction with the game world, database, and entities.

### Entity Interaction

- `["create", data]`: Creates a new entity. `data` is an object with props. Returns the new ID.
- `["destroy", target]`: Destroys an entity.
- `["entity", id]`: Gets an entity by ID.
- `["set_entity", ...entities]`: Transactional update of properties for one or more entities.
- `["get_prototype", entity]`: Gets the prototype ID of an entity.
- `["set_prototype", entity, protoId]`: Sets the prototype ID of an entity.
- `["resolve_props", entity]`: Returns an entity with all properties resolved (merged with prototype).
- `["verbs", entity]`: Gets a list of verbs available on an entity.
- `["get_verb", entity, name]`: Gets a specific verb from an entity.

### Calls & Scheduling

- `["call", target, verb, ...args]`: Calls a verb on an entity.
- `["schedule", verb, args, delay]`: Schedules a verb call on `this` entity after `delay` milliseconds.
- `["sudo", target, verb, args]`: Executes a verb as another entity (System/Bot only).
- `["get_capability", type, filter?]`: Retrieves a capability.
- `["mint", authority, type, params]`: Mints a new capability.
- `["delegate", parent, restrictions]`: Delegates a capability.
- `["give_capability", cap, target]`: Transfers a capability.

### File System Library

_Defined in: `packages/core/src/runtime/lib/fs.ts`_

- `["fs.read", cap, path]`: Reads a file.
- `["fs.write", cap, path, content]`: Writes to a file.
- `["fs.list", cap, path]`: Lists directory contents.

### Network Library

_Defined in: `packages/core/src/runtime/lib/net.ts`_

- `["net.http.get", cap, url]`: Performs an HTTP GET request.
- `["net.http.post", cap, url, body]`: Performs an HTTP POST request.

## List Library

_Defined in: `packages/scripting/src/lib/list.ts`_

- `["list.new", ...items]`: Creates a list.
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

_Defined in: `packages/scripting/src/lib/object.ts`_

- `["obj.new", [key1, val1], [key2, val2], ...]`: Creates an object from key-value pairs.
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

_Defined in: `packages/scripting/src/lib/string.ts`_

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

_Defined in: `packages/scripting/src/lib/time.ts`_

- `["time.now"]`: Returns current ISO timestamp.
- `["time.format", timestamp]`: Formats a timestamp.
- `["time.parse", datetime]`: Parses a datetime string.
- `["time.from_timestamp", number]`: Converts number to ISO string.
- `["time.to_timestamp", datetime]`: Converts ISO string to number.
- `["time.offset", amount, unit, base?]`: Adds an offset to a date.

## Permissions

Viwo uses a **Capability-Based Security** model. See [Security](../core/security.md) for details.

To check if an actor can edit an entity, the system checks for `entity.control` capability.
