# Viwo Architecture Deep-Dive

Comprehensive architecture documentation. For quick reference, see `CLAUDE.md`.

## Execution Model

Viwo uses a "Sandwich Architecture" with three layers:

```
┌─────────────────────────────────────────────────────────────┐
│  TOP: Host Language (TypeScript)                            │
│  - Developer experience layer                               │
│  - Transpiled to S-expressions, never executed directly     │
├─────────────────────────────────────────────────────────────┤
│  MIDDLE: Universal Bytecode (S-expressions / JSON AST)      │
│  - Stable ABI, language-agnostic                           │
│  - Serializable (can pause/resume scripts)                 │
│  - Secure (only valid opcodes, no arbitrary code)          │
├─────────────────────────────────────────────────────────────┤
│  BOTTOM: Kernel (VM + Opcodes)                              │
│  - Interpreter: walks JSON tree                            │
│  - Compiler: generates JS function for speed               │
│  - Opcodes are the only way to affect world state          │
└─────────────────────────────────────────────────────────────┘
```

See `docs/execution_model.md` for detailed rationale.

## Scripting Pipeline

```
TypeScript → transpiler.ts → S-expressions → compiler.ts → JavaScript function
                                ↑                              ↓
                         decompiler.ts                    interpreter.ts
                              ↓                           (fallback)
                         Source code
```

### Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `transpiler.ts` | ~1000 | TS AST → S-expressions (uses TypeScript compiler API) |
| `compiler.ts` | ~700 | S-expressions → JavaScript function via `new Function()` |
| `interpreter.ts` | ~400 | Stack machine evaluator (SOA pattern), handles async |
| `optimizer.ts` | ~170 | Partial evaluation of pure expressions |
| `decompiler.ts` | ~360 | S-expressions → TypeScript source |

### Standard Libraries

All in `packages/scripting/src/lib/`:
- `std.ts`: Control flow, variables, functions, I/O
- `math.ts`: Arithmetic, trigonometry, logarithms
- `list.ts`: Array operations
- `object.ts`: Object CRUD and transformations
- `string.ts`: String manipulation
- `boolean.ts`: Logic and comparisons
- `time.ts`: Date/time operations

### Lazy vs Strict Opcodes

**Strict** (default): Arguments evaluated before handler receives them.
```typescript
math.add(1, 2)  // Handler gets [1, 2]
```

**Lazy** (`metadata.lazy: true`): Handler receives raw AST.
```typescript
std.if(cond, thenBranch, elseBranch)  // Handler evaluates cond first, then one branch
```

Used for: `std.if`, `std.while`, `std.for`, `std.seq`, `std.let`, `std.set`, `std.try`, `obj.new`

## Entity System

### Data Model

```sql
CREATE TABLE entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prototype_id INTEGER,          -- Inheritance chain
  props TEXT DEFAULT '{}'        -- All properties as JSON
);

CREATE TABLE verbs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,            -- S-expression as JSON
  UNIQUE(entity_id, name)
);

CREATE TABLE capabilities (
  id TEXT PRIMARY KEY,           -- UUID
  owner_id INTEGER NOT NULL,
  type TEXT NOT NULL,            -- e.g., "entity.control"
  params TEXT NOT NULL           -- Restrictions as JSON
);

CREATE TABLE scheduled_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id INTEGER NOT NULL,
  verb TEXT NOT NULL,
  args TEXT DEFAULT '[]',
  execute_at INTEGER NOT NULL    -- Unix timestamp
);
```

### Prototype Chain Resolution

```typescript
// Recursive CTE walks prototype chain from instance to root
// Properties merge root→leaf (child overrides parent)
const entity = getEntity(42);  // Returns flattened props
```

### Verb Resolution

```typescript
// Searches prototype chain, returns closest match
const verb = getVerb(entityId, "look");  // May be inherited
```

## Capability System

Capabilities are authorization tokens with parameters:

```typescript
// Create capability that can modify entity 42
createCapability(playerId, "entity.control", { target_id: 42 });

// Create wildcard capability
createCapability(adminId, "entity.control", { "*": true });

// In verb code:
const cap = get_capability("entity.control", { target_id: entity.id });
if (cap) {
  cap.update(entity, { health: 50 });  // Checked at runtime
}
```

### Built-in Capabilities

- `EntityControl`: update, destroy, setPrototype
- `SysMint`: create new capabilities, delegate, transfer
- `SysCreate`: create new entities
- `SysSudo`: impersonate other entities

## Plugin System

### Registration Pattern

```typescript
export class MyPlugin implements Plugin {
  name = "my-plugin";
  version = "1.0.0";

  onLoad(ctx: PluginContext) {
    // Register opcodes
    ctx.core.registerLibrary(MyLib);

    // Register commands
    ctx.registerCommand("mycommand", this.handleCommand.bind(this));

    // Register RPC methods
    ctx.registerRpcMethod("my_method", this.handleRpc.bind(this));
  }
}
```

### Opcode Definition

```typescript
export const myOpcode = defineFullOpcode<[arg1: string], string>(
  "my.opcode",
  {
    handler: async ([arg1], ctx) => {
      return `Result: ${arg1}`;
    },
    metadata: {
      category: "Custom",
      label: "My Opcode",
      description: "Does something",
      parameters: [{ name: "arg1", type: "string" }],
      returnType: "string",
      slots: [{ name: "Argument", type: "string" }],
    },
  },
);
```

### Plugin Dependencies

```
ai ────────────────────────────→ (none)
vector ────────────────────────→ (none)
memory ────────────────────────→ ai, vector
procgen ───────────────────────→ (none)
fs, net, sqlite, diffusers ────→ (none)
```

Load order: vector, ai → memory → others

## WebSocket Protocol

### JSON-RPC 2.0

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "execute",
  "params": ["look"]
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { "status": "ok" }
}
```

**Notification (server→client):**
```json
{
  "jsonrpc": "2.0",
  "method": "message",
  "params": "You see a room."
}
```

### Core RPC Methods

- `login { entityId }`: Switch session to entity
- `execute [verb, ...args]`: Run verb on player
- `get_entities { ids }`: Batch fetch entities
- `get_verb { entityId, name }`: Get verb source (decompiled)
- `update_verb { entityId, name, source }`: Update verb code
- `get_opcodes`: Get opcode metadata for editor
- `plugin_rpc { method, params }`: Delegate to plugin

## Scheduler

Background task execution:

```typescript
// In verb code:
schedule("delayed_verb", [arg1, arg2], 5000);  // Run in 5 seconds

// Background loop (every 100ms by default):
scheduler.process();  // Executes all due tasks
```

Tasks stored in `scheduled_tasks` table, executed via `evaluate()` with script context.

## App Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    apps/server                          │
│  Boots core + plugins, serves WebSocket on :8080        │
├─────────────────────────────────────────────────────────┤
│                      @viwo/core                         │
│  Entity system, verbs, capabilities, scheduler          │
├─────────────────────────────────────────────────────────┤
│                    @viwo/scripting                      │
│  Transpiler, compiler, interpreter, standard library    │
└─────────────────────────────────────────────────────────┘
           ↑ WebSocket (JSON-RPC)
┌──────────┼──────────────────────────────────────────────┐
│          │           Client Apps                        │
│  ┌───────┴───────┐  ┌─────────┐  ┌─────────┐          │
│  │   apps/web    │  │apps/tui │  │apps/cli │          │
│  │  SolidJS UI   │  │ Ink UI  │  │  REPL   │          │
│  └───────────────┘  └─────────┘  └─────────┘          │
│  ┌───────────────┐                                     │
│  │apps/discord-bot│ Links Discord channels ↔ rooms    │
│  └───────────────┘                                     │
└─────────────────────────────────────────────────────────┘

Standalone (no server connection):
┌─────────────────┐  ┌──────────────┐
│ apps/playground │  │ apps/imagegen│
│ Script sandbox  │  │ Image editor │
└─────────────────┘  └──────────────┘
```

## Key Design Decisions

1. **S-expressions as intermediate format**: Enables multiple frontends, serialization, security
2. **Prototype-based inheritance**: Flexible, no schema migrations needed
3. **Capability-based security**: Fine-grained, auditable, transferable
4. **Lazy evaluation for control flow**: Efficient branching without special-casing
5. **Copy-on-Write scoping**: Efficient scope forking for loops
6. **JSON-RPC over WebSocket**: Standard protocol, easy to implement clients
7. **Plugin system with opcode registration**: Extensible without modifying core
