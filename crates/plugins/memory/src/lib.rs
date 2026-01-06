//! Memory plugin for Viwo - RAG orchestration through Lua globals
//!
//! This plugin orchestrates AI embeddings and vector search by calling
//! the __viwo_ai_embed and __viwo_vector_* Lua globals through the C API.
//! This avoids rlib dependencies while maintaining clean orchestration.

use std::ffi::CString;
use std::os::raw::{c_char, c_int};

type RegisterFunction = unsafe extern "C" fn(*const c_char, PluginLuaFunction) -> c_int;
type PluginLuaFunction = unsafe extern "C" fn(*mut mlua::ffi::lua_State) -> c_int;

// ============================================================================
// Lua C API Helper
// ============================================================================

/// Helper: Push error message to Lua stack
unsafe fn lua_push_error(L: *mut mlua::ffi::lua_State, msg: &str) -> c_int {
    use mlua::ffi::*;
    let c_msg = CString::new(msg).unwrap_or_else(|_| CString::new("Error message contains null byte").unwrap());
    lua_pushstring(L, c_msg.as_ptr());
    lua_error(L)
}

// ============================================================================
// Plugin Functions
// ============================================================================

/// Lua wrapper for memory.add - orchestrates ai.embed + vector.insert
#[unsafe(no_mangle)]
unsafe extern "C" fn memory_add_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    let nargs = lua_gettop(L);
    if nargs != 7 {
        return lua_push_error(L, "memory.add requires 7 arguments (db_capability, ai_capability, db_path, provider, model, content, metadata)");
    }

    // Arguments are already on the stack at indices 1-7
    // Stack: [db_cap, ai_cap, db_path, provider, model, content, metadata]

    // Step 1: Call __viwo_ai_embed(ai_capability, provider, model, content)
    lua_getglobal(L, b"__viwo_ai_embed\0".as_ptr() as *const c_char);
    if lua_isnil(L, -1) != 0 {
        lua_pop(L, 1);
        return lua_push_error(L, "memory.add: __viwo_ai_embed global not found");
    }

    // Push arguments for ai.embed: ai_cap (arg 2), provider (arg 4), model (arg 5), content (arg 6)
    lua_pushvalue(L, 2); // ai_capability
    lua_pushvalue(L, 4); // provider
    lua_pushvalue(L, 5); // model
    lua_pushvalue(L, 6); // content

    // Call __viwo_ai_embed(ai_capability, provider, model, content)
    if lua_pcall(L, 4, 1, 0) != LUA_OK {
        // Error message is on top of stack
        return lua_error(L);
    }

    // Stack now has embedding result at top
    // We need to keep it for vector.insert call

    // Step 2: Call __viwo_vector_insert(db_capability, db_path, content, embedding, metadata)
    lua_getglobal(L, b"__viwo_vector_insert\0".as_ptr() as *const c_char);
    if lua_isnil(L, -1) != 0 {
        lua_pop(L, 2); // pop nil and embedding
        return lua_push_error(L, "memory.add: __viwo_vector_insert global not found");
    }

    // Push arguments: db_cap (arg 1), db_path (arg 3), content (arg 6), embedding (from ai.embed), metadata (arg 7)
    lua_pushvalue(L, 1); // db_capability
    lua_pushvalue(L, 3); // db_path
    lua_pushvalue(L, 6); // content (key)
    lua_pushvalue(L, -4); // embedding (result from ai.embed, now at index -4)
    lua_pushvalue(L, 7); // metadata

    // Call __viwo_vector_insert(db_capability, db_path, key, embedding, metadata)
    if lua_pcall(L, 5, 1, 0) != LUA_OK {
        // Error message is on top of stack
        return lua_error(L);
    }

    // Result (id) is now on top of stack
    // Remove the embedding that's still below it
    lua_remove(L, -2);

    // Return the id
    1
}

/// Lua wrapper for memory.search - orchestrates ai.embed + vector.search
#[unsafe(no_mangle)]
unsafe extern "C" fn memory_search_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    let nargs = lua_gettop(L);
    if nargs != 7 {
        return lua_push_error(L, "memory.search requires 7 arguments (db_capability, ai_capability, db_path, provider, model, query, options)");
    }

    // Arguments are already on the stack at indices 1-7
    // Stack: [db_cap, ai_cap, db_path, provider, model, query, options]

    // Step 1: Call __viwo_ai_embed(ai_capability, provider, model, query)
    lua_getglobal(L, b"__viwo_ai_embed\0".as_ptr() as *const c_char);
    if lua_isnil(L, -1) != 0 {
        lua_pop(L, 1);
        return lua_push_error(L, "memory.search: __viwo_ai_embed global not found");
    }

    // Push arguments for ai.embed: ai_cap (arg 2), provider (arg 4), model (arg 5), query (arg 6)
    lua_pushvalue(L, 2); // ai_capability
    lua_pushvalue(L, 4); // provider
    lua_pushvalue(L, 5); // model
    lua_pushvalue(L, 6); // query

    // Call __viwo_ai_embed(ai_capability, provider, model, query)
    if lua_pcall(L, 4, 1, 0) != LUA_OK {
        // Error message is on top of stack
        return lua_error(L);
    }

    // Stack now has query embedding result at top

    // Step 2: Extract limit from options (arg 7)
    // Get options.limit or default to 5
    lua_pushvalue(L, 7); // Push options table
    lua_getfield(L, -1, b"limit\0".as_ptr() as *const c_char);
    let limit = if lua_isnil(L, -1) != 0 {
        5  // default limit
    } else {
        lua_tointeger(L, -1)
    };
    lua_pop(L, 2); // Pop limit value and options table copy

    // Step 3: Call __viwo_vector_search(db_capability, db_path, query_embedding, limit)
    lua_getglobal(L, b"__viwo_vector_search\0".as_ptr() as *const c_char);
    if lua_isnil(L, -1) != 0 {
        lua_pop(L, 2); // pop nil and embedding
        return lua_push_error(L, "memory.search: __viwo_vector_search global not found");
    }

    // Push arguments: db_cap (arg 1), db_path (arg 3), query_embedding (from ai.embed), limit
    lua_pushvalue(L, 1); // db_capability
    lua_pushvalue(L, 3); // db_path
    lua_pushvalue(L, -4); // query_embedding (result from ai.embed, now at index -4)
    lua_pushinteger(L, limit); // limit

    // Call __viwo_vector_search(db_capability, db_path, query_embedding, limit)
    if lua_pcall(L, 4, 1, 0) != LUA_OK {
        // Error message is on top of stack
        return lua_error(L);
    }

    // Result (search results array) is now on top of stack
    // Remove the embedding that's still below it
    lua_remove(L, -2);

    // Return the search results
    1
}

// ============================================================================
// Plugin Lifecycle
// ============================================================================

/// Plugin initialization - register all functions
#[unsafe(no_mangle)]
pub unsafe extern "C" fn plugin_init(register_fn: RegisterFunction) -> c_int {
    unsafe {
        let names = ["memory.add", "memory.search"];
        let funcs: [PluginLuaFunction; 2] = [memory_add_lua, memory_search_lua];

        for (name, func) in names.iter().zip(funcs.iter()) {
            let name_cstr = match CString::new(*name) {
                Ok(s) => s,
                Err(_) => return -1,
            };
            if register_fn(name_cstr.as_ptr(), *func) != 0 {
                return -1;
            }
        }
    }
    0 // Success
}

/// Plugin cleanup - called when unloading
#[unsafe(no_mangle)]
pub unsafe extern "C" fn plugin_cleanup() -> c_int {
    0 // Success - nothing to clean up
}
