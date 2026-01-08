# Lotus Architecture Deep-Dive

Comprehensive architecture documentation. For quick reference, see `CLAUDE.md`.

## Execution Model

Lotus uses a "Sandwich Architecture" with three layers:

```
+-------------------------------------------------------------+
|  TOP: Host Language (TypeScript)                            |
|  - Developer experience layer                               |
|  - Transpiled to S-expressions, never executed directly     |
+-------------------------------------------------------------+
|  MIDDLE: Universal Bytecode (S-expressions / JSON AST)      |
|  - Stable ABI, language-agnostic                            |
|  - Serializable (can pause/resume scripts)                  |
|  - Secure (only valid opcodes, no arbitrary code)           |
+-------------------------------------------------------------+
|  BOTTOM: Kernel (Rust + LuaJIT)                             |
|  - Codegen: compiles S-expressions to Lua                   |
|  - LuaJIT: executes Lua for high performance                |
|  - Opcodes are the only way to affect world state           |
+-------------------------------------------------------------+
```

See `docs/execution_model.md` for detailed rationale.

## Scripting Pipeline

```
TypeScript -> transpiler -> S-expressions -> codegen -> Lua -> LuaJIT
                                 ^
                            decompiler (TODO: needs WASM bindings)
                                 |
                            Source code
```

### Key Rust Crates

| Crate | Purpose |
|-------|---------|
| `lotus-ir` | S-expression types, validation, type-safe builders |
| `lotus-syntax-typescript` | TypeScript -> S-expressions (tree-sitter based) |
| `lotus-runtime-luajit` | S-expressions -> Lua codegen + mlua execution |
| `lotus-core` | Entity system, capabilities, SQLite storage |
| `lotus-runtime` | Integrated runtime combining core + LuaJIT |
| `lotus-cli` | CLI binary (`lotus`) |

### Standard Libraries

Codegen modules in `crates/runtime/luajit/src/codegen/`:
- `std.rs`: Control flow, variables, functions, I/O
- `math.rs`: Arithmetic, trigonometry, logarithms
- `list.rs`: Array operations
- `obj.rs`: Object CRUD and transformations
- `str.rs`: String manipulation
- `bool.rs`: Logic and comparisons
- `json.rs`: JSON parsing and stringification
- `game.rs`: Entity operations, verb calling, scheduling

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

```rust
// Recursive CTE walks prototype chain from instance to root
// Properties merge root->leaf (child overrides parent)
let entity = repo.get_entity(42)?;  // Returns flattened props
```

### Verb Resolution

```rust
// Searches prototype chain, returns closest match
let verb = repo.get_verb(entity_id, "look")?;  // May be inherited
```

## Capability System

Capabilities are authorization tokens with parameters:

```typescript
// Create capability that can modify entity 42
mint("entity.control", { target_id: 42 });

// Create wildcard capability
mint("entity.control", { "*": true });

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

Plugins provide native Lua C API functions that can be called from LotusScript.

### Plugin ABI

```rust
pub trait Plugin: Send + Sync {
    fn name(&self) -> &'static str;
    fn version(&self) -> &'static str;
    fn register_to_lua(&self, lua: &Lua) -> Result<()>;
}
```

### Available Plugins

| Plugin | Functions |
|--------|-----------|
| `fs` | read, write, list, stat, exists, mkdir, remove |
| `net` | get, post |
| `sqlite` | query, execute |
| `procgen` | seed, noise, random, randomRange, between |
| `vector` | insert, search, delete |
| `ai` | generateText, embed, chat |
| `memory` | store, recall, search (orchestrates sqlite+ai+vector) |
| `diffusers` | generate (Stable Diffusion image generation) |

### Plugin Dependencies

```
ai -----------------------> (none)
vector ------------------> (none)
memory ------------------> ai, vector
procgen, fs, net, sqlite -> (none)
diffusers ---------------> (none, uses burn-models)
```

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

**Notification (server->client):**
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
- `get_verb { entityId, name }`: Get verb source
- `update_verb { entityId, name, source }`: Update verb code
- `get_opcodes`: Get opcode metadata for editor
- `schedule { entityId, verb, args, delay }`: Schedule task

## Scheduler

Background task execution:

```typescript
// In verb code:
schedule("delayed_verb", [arg1, arg2], 5000);  // Run in 5 seconds

// Background loop (every 100ms by default):
scheduler.process();  // Executes all due tasks
```

Tasks stored in `scheduled_tasks` table, executed via verb invocation.

## App Architecture

```
+-----------------------------------------------------------+
|                    Rust Servers                           |
|  lotus-notes-server     - Notes app backend (port 8081)   |
|  lotus-filebrowser-server - File browser (port 8080)      |
+-----------------------------------------------------------+
|                    @lotus/runtime                         |
|  Entity system, verbs, capabilities, LuaJIT execution     |
+-----------------------------------------------------------+
           ^ WebSocket (JSON-RPC)
+----------+------------------------------------------------+
|          |           TypeScript Frontends                 |
|  +-------+-------+  +---------+  +-------------+         |
|  |   apps/web   |  |apps/tui |  |apps/discord |         |
|  |  SolidJS UI  |  | Ink UI  |  |    Bot      |         |
|  +---------------+  +---------+  +-------------+         |
|  +---------------+  +----------------+                   |
|  |  apps/notes  |  | apps/filebrowser|                   |
|  |  Wiki client |  | File browser UI |                   |
|  +---------------+  +----------------+                   |
+-----------------------------------------------------------+
```

## Key Design Decisions

1. **S-expressions as intermediate format**: Enables multiple frontends, serialization, security
2. **Prototype-based inheritance**: Flexible, no schema migrations needed
3. **Capability-based security**: Fine-grained, auditable, transferable
4. **Lazy evaluation for control flow**: Efficient branching without special-casing
5. **LuaJIT execution**: High performance, embeddable, portable
6. **JSON-RPC over WebSocket**: Standard protocol, easy to implement clients
7. **Native Lua C API plugins**: Full access to Lua state, high performance
