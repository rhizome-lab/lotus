# Bloom Rust Port

Design document for porting Bloom to a Rust-based runtime with LuaJIT execution.

## Motivation

- **Embeddable**: Single library that can be embedded in games, apps, servers
- **Portable**: No Node/Bun dependency at runtime
- **Native plugins**: Dynamic libraries with full system access (fs, net, gpu, etc.)
- **Performance**: LuaJIT tracing JIT for hot paths, FFI for native-speed structs

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Clients                              │
│              (web, tui, discord - unchanged)                │
└─────────────────────────┬───────────────────────────────────┘
                          │ WebSocket / JSON-RPC
┌─────────────────────────▼───────────────────────────────────┐
│               transport/websocket-jsonrpc                   │
│            (tokio + tungstenite, plugin loader)             │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                      bloom-core                              │
│           (entities, capabilities, SQLite storage)          │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                   runtime/luajit                            │
│        (S-expr → Lua codegen + mlua/LuaJIT execution)       │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                       Plugins                               │
│    (.so/.dll/.dylib via abi_stable, full system access)     │
│         fs, net, ai, vector, sqlite, procgen, ...           │
└─────────────────────────────────────────────────────────────┘
```

## Crate Structure

```
crates/
├── bloom-ir/              # S-expression types, validation, spec
├── bloom-core/            # Entity, Verb, Capability, SQLite storage
├── bloom-plugin-abi/      # Plugin trait, OpcodeRegistry, Value types
├── bloom-cli/             # Binary entrypoint (serve, transpile, compile, exec)
│
├── syntax/
│   └── typescript/       # TS → S-expr (tree-sitter-typescript)
│
├── runtime/
│   └── luajit/           # S-expr → Lua + mlua execution
│
└── transport/
    └── websocket-jsonrpc/  # WebSocket server, sessions, plugin loader
```

## S-Expression IR

The S-expression format is the universal contract between syntax frontends and execution targets.

```
Syntax                    IR              Targets
─────────────────────────────────────────────────
TypeScript ─┐                          ┌─ LuaJIT (primary)
            ├──→  S-expressions  ─────►│
(others?)   ┘                          └─ JavaScript (browser)
```

### Why S-expressions?

- **Language-agnostic**: JSON serializable, any tool can emit them
- **Sandboxing boundary**: Only allowed opcodes can appear, validated at load time
- **Stable ABI**: Decouples syntax frontends from execution targets
- **Transformable**: Easy to optimize, inline, or analyze

### Binary Format: Cap'n Proto

For production, S-expressions are serialized with Cap'n Proto instead of JSON.

**Why Cap'n Proto over alternatives?**

| Format | Zerocopy | Cross-lang | Schema | Notes |
|--------|----------|------------|--------|-------|
| rkyv | Yes | Rust only | No | Simpler but Rust-only |
| Cap'n Proto | Yes | Yes | Yes | Cross-language, schema evolution |
| FlatBuffers | Yes | Yes | Yes | Similar to Cap'n Proto |
| JSON | No | Yes | No | Current format, slow |

**Cap'n Proto chosen because:**
- **Cross-language**: Syntax frontends could be written in any language, not just Rust
- **Schema evolution**: Can add fields without breaking old readers
- **Zerocopy**: No deserialization cost, read directly from mmap'd file
- **Well-designed**: Created by Kenton Varda (Protocol Buffers v2 author)

JSON remains supported for debugging and human-readable output.

### Example

```typescript
// TypeScript input
const name = std.arg(0);
send("message", str.concat("Hello, ", name, "!"));
```

```json
// S-expression IR (JSON for readability)
["std.seq",
  ["std.let", "name", ["std.arg", 0]],
  ["send", "message", ["str.concat", "Hello, ", ["std.var", "name"], "!"]]
]
```

```lua
-- Lua output
local name = std.arg(0)
send("message", str.concat("Hello, ", name, "!"))
```

## TypeScript Syntax Frontend

Uses tree-sitter-typescript for parsing. No type checking in the transpiler - relies on user's IDE/tsconfig.

**Why tree-sitter instead of tsc?**
- Fast, incremental parsing
- Rust-native (no Node dependency)
- Single binary toolchain

### Why TypeScript syntax?

TypeScript was chosen as the primary authoring syntax for:

- **LLM familiarity**: AI models can write and edit verbs effectively
- **Type safety**: IDE catches errors before transpilation
- **Flow typing**: Generics and type narrowing work well
- **Mature tooling**: VSCode, LSP, formatting, linting all work

Note: TypeScript is just one syntax frontend. The S-expression IR could be emitted by other tools (visual editors, other languages, etc.).

## LuaJIT Target

Primary execution target. Uses mlua for Rust ↔ Lua interop.

### Why LuaJIT specifically?

Not just "any JIT" - LuaJIT was chosen for specific features:

**Tracing JIT with table shape optimization:**
```lua
local e1 = { id = 1, x = 10, y = 20 }
local e2 = { id = 2, x = 30, y = 40 }
-- Same shape: {id, x, y}

for _, e in ipairs(entities) do
  e.x = e.x + 1  -- Tracer sees consistent shape → direct slot access
end
```

When tables have consistent shapes (like entities from the same prototype), the tracer:
1. Records the shape on first iteration
2. Guards on shape staying the same
3. Converts property access to direct slot offset (not hash lookup)
4. Falls back gracefully if shape changes

**FFI for native-speed structs:**
```lua
ffi.cdef[[ typedef struct { double x, y, z; } Vec3; ]]
local v = ffi.new("Vec3", 1, 2, 3)
v.x = v.x + 10  -- Compiles to native field access
```

When traced, FFI struct access becomes direct memory loads/stores - same as C.

**Other JIT options considered:**

| Runtime | JIT | Size | Notes |
|---------|-----|------|-------|
| LuaJIT | Yes | 500KB | Tracing + FFI + shape optimization |
| V8 | Yes | Huge | Too large for embedding |
| QuickJS | No | 3MB | Fast interpreter, no JIT |
| Cranelift | DIY | - | Would need to build our own tracer |

### iOS Compatibility

Apple prohibits JIT on iOS. LuaJIT with `-joff` (JIT disabled) still works:
- Interpreter is ~3x faster than PUC Lua 5.4
- Same codebase, runtime flag to disable
- No code changes needed

## Plugin System

Plugins are dynamic libraries (.so/.dll/.dylib) loaded at runtime via `libloading` + `abi_stable`.

### Why dynamic libraries over WASM?

The goal is to **allow arbitrary system access**. Plugins provide capabilities like filesystem, network, GPU, etc. - they ARE the things that need system access, not sandboxed from it.

**WASM was rejected because:**
- Sandboxed by design - constantly fighting to access system resources
- WASI is limited and evolving
- Every new capability (GPU, raw sockets, custom syscall) requires escape hatches
- Overhead at every host↔guest boundary

**Dynamic libraries provide:**
- Full system access (fs, net, gpu, raw syscalls, C libraries)
- Native performance, no boundary overhead
- Use any Rust crate or C library

**Trust model:** Plugins are trusted code (installed by user/admin), not untrusted user-submitted scripts. Scripts are sandboxed by the S-expression IR; plugins are not.

### Plugin Trait

```rust
#[abi_stable::sabi_trait]
pub trait Plugin: Send + Sync {
    fn name(&self) -> RStr<'static>;
    fn version(&self) -> (u32, u32, u32);
    fn register(&self, registry: &mut OpcodeRegistry);
    fn on_load(&self, host: &HostAPI) -> RResult<(), PluginError>;
}
```

### Why abi_stable?

Rust has no stable ABI - plugins compiled with different rustc versions are incompatible. Options:

| Approach | ABI Stable? | Ergonomics | Safety |
|----------|-------------|------------|--------|
| C ABI (extern "C") | Yes | Low | Unsafe |
| abi_stable crate | Yes | High | Safe-ish |
| WASM | Yes | Medium | Sandboxed |

`abi_stable` provides stable ABI types while keeping Rust ergonomics.

### Core vs Plugin Opcodes

Core (compiled in):
- `std.*` - control flow, variables
- `list.*` - list operations
- `obj.*` - object/table operations
- `str.*` - string operations
- `math.*` - math operations
- `time.*` - time operations
- `bool.*` - boolean operations

Plugins (dynamic):
- `fs.*` - filesystem
- `net.*` - network
- `ai.*` - LLM integration
- `vector.*` - embeddings
- `sqlite.*` - database
- `procgen.*` - procedural generation

## Key Dependencies

| Crate | Purpose |
|-------|---------|
| `mlua` | LuaJIT bindings |
| `tree-sitter` / `tree-sitter-typescript` | TS parsing |
| `capnp` | Binary S-expr serialization (planned) |
| `rusqlite` | SQLite storage |
| `tokio` | Async runtime |
| `tokio-tungstenite` | WebSocket |
| `abi_stable` | Plugin ABI |
| `libloading` | Dynamic library loading |
| `serde` / `serde_json` | JSON S-expr |

## Plugin Interface Architecture

### Decision: Native Lua C API (Jan 2026)

**Context:** Plugins need to expose functions callable from LuaJIT scripts. Two approaches were considered:

1. **JSON Serialization**: Plugin functions accept/return `serde_json::Value`
   - ✅ Simple, high-level mlua API
   - ❌ Serialization overhead on every call
   - ❌ Cannot return Lua userdata (handles, file descriptors, native objects)
   - ❌ If limited to JSON, pure LuaJIT would be faster than Rust+FFI+JSON

2. **Native Lua C API**: Plugin functions use raw `lua_State` pointer
   - ✅ Full Lua capabilities (userdata, metatables, handles)
   - ✅ No serialization overhead
   - ✅ Justifies Rust plugins over pure LuaJIT
   - ❌ Verbose stack manipulation code

**Decision:** Committed to native Lua C API (approach 2).

**Rationale:**
- **Correctness over convenience**: Accept verbosity for full capabilities
- **Performance**: No JSON serialization on hot paths
- **Justify Rust plugins**: If JSON is the limit, LuaJIT native would be faster
- **Future flexibility**: Can return userdata (file handles, GPU contexts, etc.)

**Implementation:**
```rust
// Plugin function signature
type PluginLuaFunction = unsafe extern "C" fn(
    lua_state: *mut mlua::ffi::lua_State,
) -> std::os::raw::c_int;

// Example: fs.read implementation
unsafe extern "C" fn fs_read_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    // Get arguments from stack
    let cap_json = lua_value_to_json(L, 1)?;
    let path = lua_tolstring(L, 2, &mut len);

    // Perform operation
    let content = fs_read(&cap_json, this_id, path)?;

    // Push result to stack
    lua_pushstring(L, c_content.as_ptr());
    1 // Return value count
}
```

**Trade-offs accepted:**
- Manual stack manipulation (`lua_pushstring`, `lua_tolstring`, etc.)
- Type conversions between Lua and Rust done explicitly
- More unsafe code, but contained within plugin boundary

**Alternative considered and rejected:** Supporting both JSON and native APIs was dismissed as unnecessary complexity.

## Decisions Log

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Execution target | LuaJIT | Tracing JIT, FFI, table shapes, small, iOS-compatible |
| Plugin loading | Dynamic libraries | Need full system access, WASM too restrictive |
| Plugin ABI | abi_stable → Native C | Stable ABI (abi_stable dropped, using extern "C" with function registry) |
| Plugin interface | Native Lua C API | Full capabilities, no serialization, justifies Rust over LuaJIT |
| Binary format | Cap'n Proto | Cross-language, zerocopy, schema evolution |
| TS parsing | tree-sitter-typescript | Fast, Rust-native, no Node dependency |
| Keep JS target? | Yes (low priority) | Browser execution without server |

## Migration Path

1. Rust runtime coexists with TypeScript implementation
2. S-expression format is shared (already stable)
3. Clients unchanged (WebSocket/JSON-RPC protocol stays same)
4. Gradually move plugins to Rust
5. TypeScript implementation becomes "reference" / development mode

## Open Questions

- [x] **Binary S-expr format**: Cap'n Proto (cross-language, zerocopy)
- [x] **Interpreter mode for debugging**: Yes, but low priority
- [x] **Hot reload for plugins**: Nice QoL, but consider perf impact
- [x] **Bytecode caching**: Yes, configurable by end user

## Related Documents

- [Architecture](../architecture.md) - System architecture overview
- [BloomScript](../bloomscript.md) - S-expression opcodes reference
