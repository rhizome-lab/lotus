# Plugin Development Guide

Guide for developing native Rust plugins for Viwo using the Lua C API.

## Architecture Overview

Plugins are dynamic libraries (`.so`/`.dll`/`.dylib`) that expose functions callable from LuaJIT scripts. They use the native Lua C API for maximum performance and capabilities.

### Why Native Lua C API?

**Decision (Jan 2026):** Use raw `lua_State` pointers instead of JSON serialization.

**Rationale:**
- Full Lua capabilities (userdata, handles, metatables)
- No serialization overhead
- Justifies Rust plugins over pure LuaJIT
- Enables returning native objects (file handles, GPU contexts)

**Trade-off:** Verbose stack manipulation code is accepted for correctness and flexibility.

## Plugin Structure

### Required Functions

Every plugin must export two functions via the C ABI:

```rust
/// Plugin initialization - register functions
#[unsafe(no_mangle)]
pub unsafe extern "C" fn plugin_init(register_fn: RegisterFunction) -> c_int {
    // Register your functions here
    0 // Return 0 on success
}

/// Plugin cleanup (optional)
#[unsafe(no_mangle)]
pub unsafe extern "C" fn plugin_cleanup() {
    // Clean up resources if needed
}
```

### Function Signature

All plugin functions must match this signature:

```rust
type PluginLuaFunction = unsafe extern "C" fn(
    lua_state: *mut mlua::ffi::lua_State,
) -> std::os::raw::c_int;
```

**Returns:** Number of values pushed to Lua stack (≥0), or negative on error.

## Example: Simple Plugin

```rust
use std::ffi::CString;
use std::os::raw::{c_char, c_int};

type PluginLuaFunction = unsafe extern "C" fn(
    lua_state: *mut mlua::ffi::lua_State,
) -> c_int;

type RegisterFunction = unsafe extern "C" fn(
    name: *const c_char,
    func: PluginLuaFunction,
) -> c_int;

#[unsafe(no_mangle)]
pub unsafe extern "C" fn plugin_init(register_fn: RegisterFunction) -> c_int {
    unsafe {
        let names = ["math.double"];
        let funcs: [PluginLuaFunction; 1] = [math_double_lua];

        for (name, func) in names.iter().zip(funcs.iter()) {
            let name_cstr = CString::new(*name).unwrap();
            if register_fn(name_cstr.as_ptr(), *func) != 0 {
                return -1;
            }
        }
    }
    0
}

#[unsafe(no_mangle)]
unsafe extern "C" fn math_double_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    // Check argument count
    if lua_gettop(L) != 1 {
        let err = CString::new("math.double requires 1 argument").unwrap();
        lua_pushstring(L, err.as_ptr());
        return lua_error(L);
    }

    // Get number from stack
    let num = lua_tonumber(L, 1);

    // Push result
    lua_pushnumber(L, num * 2.0);

    1 // Return 1 value
}
```

## Lua C API Common Operations

### Getting Arguments

```rust
use mlua::ffi::*;

// Get argument count
let nargs = lua_gettop(L);

// Get string
let mut len = 0;
let ptr = lua_tolstring(L, 1, &mut len);
let slice = std::slice::from_raw_parts(ptr as *const u8, len);
let string = std::str::from_utf8(slice).unwrap();

// Get number
let num = lua_tonumber(L, 1);

// Get integer
let int = lua_tointeger(L, 1);

// Get boolean
let boolean = lua_toboolean(L, 1) != 0;

// Check type
if lua_type(L, 1) != LUA_TTABLE {
    return error(L, "Expected table");
}
```

### Pushing Results

```rust
use mlua::ffi::*;

// Push string
let c_str = CString::new("Hello").unwrap();
lua_pushstring(L, c_str.as_ptr());

// Push number
lua_pushnumber(L, 42.0);

// Push integer
lua_pushinteger(L, 42);

// Push boolean
lua_pushboolean(L, 1); // or 0 for false

// Push nil
lua_pushnil(L);
```

### Creating Tables

```rust
use mlua::ffi::*;

// Create table
lua_createtable(L, 0, 3); // array size, hash size

// Set field
let key = CString::new("name").unwrap();
let val = CString::new("John").unwrap();
lua_pushstring(L, val.as_ptr());
lua_setfield(L, -2, key.as_ptr());

// Or set numeric index (1-indexed)
lua_pushstring(L, val.as_ptr());
lua_rawseti(L, -2, 1);
```

### Reading Tables

```rust
use mlua::ffi::*;

// Ensure it's a table
if lua_type(L, 1) != LUA_TTABLE {
    return error(L, "Expected table");
}

// Normalize index to absolute
let abs_index = if index < 0 && index > LUA_REGISTRYINDEX {
    lua_gettop(L) + index + 1
} else {
    index
};

// Iterate table
lua_pushnil(L); // First key
while lua_next(L, abs_index) != 0 {
    // Stack: ... table ... key value

    // Get key
    let key_ptr = lua_tolstring(L, -2, &mut len);
    let key_slice = std::slice::from_raw_parts(key_ptr as *const u8, len);
    let key_str = std::str::from_utf8(key_slice).unwrap();

    // Get value
    let value = lua_tonumber(L, -1);

    // Pop value, keep key for next iteration
    lua_pop(L, 1);
}
```

### Error Handling

```rust
use mlua::ffi::*;

unsafe fn lua_push_error(L: *mut lua_State, msg: &str) -> c_int {
    let c_msg = CString::new(msg).unwrap_or_else(|_| {
        CString::new("Error").unwrap()
    });
    lua_pushstring(L, c_msg.as_ptr());
    lua_error(L) // Never returns
}

// Usage
if nargs != 2 {
    return lua_push_error(L, "Expected 2 arguments");
}
```

## Accessing Globals

```rust
use mlua::ffi::*;

// Get global
lua_getglobal(L, b"__viwo_this_id\0".as_ptr() as *const c_char);
let this_id = lua_tointeger(L, -1);
lua_pop(L, 1); // Clean up stack
```

## Type Conversions

### Lua to JSON (for capability validation)

```rust
unsafe fn lua_value_to_json(
    L: *mut mlua::ffi::lua_State,
    index: c_int,
) -> Result<serde_json::Value, String> {
    use mlua::ffi::*;

    match lua_type(L, index) {
        LUA_TNIL => Ok(serde_json::Value::Null),
        LUA_TBOOLEAN => Ok(serde_json::Value::Bool(
            lua_toboolean(L, index) != 0
        )),
        LUA_TNUMBER => Ok(serde_json::json!(lua_tonumber(L, index))),
        LUA_TSTRING => {
            let mut len = 0;
            let ptr = lua_tolstring(L, index, &mut len);
            let slice = std::slice::from_raw_parts(ptr as *const u8, len);
            let s = std::str::from_utf8(slice)
                .map_err(|_| "Invalid UTF-8")?;
            Ok(serde_json::Value::String(s.to_string()))
        }
        LUA_TTABLE => lua_table_to_json(L, index),
        _ => Err(format!("Unsupported type")),
    }
}
```

See `crates/plugins/fs/src/lib.rs` for full table conversion implementation.

## Cargo Configuration

```toml
[package]
name = "viwo-plugin-example"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]  # Important: dynamic library

[dependencies]
mlua = { version = "0.10", features = ["luajit", "serialize"] }
serde_json = "1.0"
```

## Best Practices

### 1. Check Argument Count

Always validate the number of arguments:

```rust
let nargs = lua_gettop(L);
if nargs != 2 {
    return lua_push_error(L, "Expected 2 arguments");
}
```

### 2. Validate Argument Types

Check types before accessing:

```rust
if lua_type(L, 1) != LUA_TTABLE {
    return lua_push_error(L, "First argument must be table");
}
```

### 3. Handle UTF-8 Properly

Lua strings are not guaranteed to be UTF-8:

```rust
let path_slice = std::slice::from_raw_parts(path_ptr as *const u8, len);
let path = match std::str::from_utf8(path_slice) {
    Ok(s) => s,
    Err(_) => return lua_push_error(L, "Invalid UTF-8"),
};
```

### 4. Clean Up the Stack

Pop values you don't need:

```rust
lua_getglobal(L, b"__viwo_this_id\0".as_ptr() as *const c_char);
let this_id = lua_tointeger(L, -1);
lua_pop(L, 1); // Important!
```

### 5. Use Descriptive Error Messages

Include context in errors:

```rust
return lua_push_error(L, &format!("fs.read: {}", e));
```

## Testing

Build and test your plugin:

```bash
# Build plugin
cargo build --package viwo-plugin-example

# Plugin will be at:
# Linux: target/debug/libviwo_plugin_example.so
# macOS: target/debug/libviwo_plugin_example.dylib
# Windows: target/debug/viwo_plugin_example.dll

# Test with Viwo runtime
cargo test --package viwo-runtime
```

## Example Plugins

- **fs** (`crates/plugins/fs`) - Filesystem operations with capability validation
- **net** (`crates/plugins/net`) - Network I/O
- **sqlite** (`crates/plugins/sqlite`) - Database access
- **procgen** (`crates/plugins/procgen`) - Procedural generation with seeded RNG

## Common Pitfalls

### Stack Imbalance

Always return the correct number of values:

```rust
// ❌ Wrong
lua_pushstring(L, result.as_ptr());
return 0; // Says 0 returns but pushed 1!

// ✅ Correct
lua_pushstring(L, result.as_ptr());
return 1; // Matches pushed values
```

### Not Handling Null Pointers

```rust
// ❌ Wrong
let ptr = lua_tolstring(L, 1, &mut len);
let slice = std::slice::from_raw_parts(ptr as *const u8, len);

// ✅ Correct
let ptr = lua_tolstring(L, 1, &mut len);
if ptr.is_null() {
    return lua_push_error(L, "Expected string");
}
let slice = std::slice::from_raw_parts(ptr as *const u8, len);
```

### Forgetting CString Null Terminator

```rust
// ❌ Wrong
let name = "fs.read";
register_fn(name.as_ptr() as *const c_char, func);

// ✅ Correct
let name_cstr = CString::new("fs.read").unwrap();
register_fn(name_cstr.as_ptr(), func);
```

## Resources

- [Lua 5.1 C API Reference](https://www.lua.org/manual/5.1/manual.html#3)
- [LuaJIT FFI](https://luajit.org/ext_ffi.html)
- [mlua crate docs](https://docs.rs/mlua/)
- [Example: fs plugin](../../crates/plugins/fs/src/lib.rs)
