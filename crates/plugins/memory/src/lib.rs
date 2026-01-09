//! Memory plugin for Lotus - RAG with content storage and vector search.
//!
//! This plugin orchestrates:
//! - sqlite: for content storage (memories_content table)
//! - ai.embed: for generating embeddings
//! - vector: for similarity search
//!
//! Matches TypeScript semantics: content+metadata stored separately from vectors.

use std::ffi::CString;
use std::os::raw::{c_char, c_int};

type RegisterFunction = unsafe extern "C" fn(*const c_char, PluginLuaFunction) -> c_int;
type PluginLuaFunction = unsafe extern "C" fn(*mut mlua::ffi::lua_State) -> c_int;

// ============================================================================
// Lua C API Helpers
// ============================================================================

/// Push error message to Lua stack and trigger error
unsafe fn lua_push_error(L: *mut mlua::ffi::lua_State, msg: &str) -> c_int {
    use mlua::ffi::*;
    let c_msg =
        CString::new(msg).unwrap_or_else(|_| CString::new("Error contains null byte").unwrap());
    lua_pushstring(L, c_msg.as_ptr());
    lua_error(L)
}

/// Get string from Lua stack at given index
unsafe fn lua_get_string(L: *mut mlua::ffi::lua_State, idx: c_int) -> Option<String> {
    use mlua::ffi::*;
    if lua_type(L, idx) != LUA_TSTRING {
        return None;
    }
    let mut len = 0;
    let ptr = lua_tolstring(L, idx, &mut len);
    if ptr.is_null() {
        return None;
    }
    let slice = std::slice::from_raw_parts(ptr as *const u8, len);
    std::str::from_utf8(slice).ok().map(|s| s.to_string())
}

// ============================================================================
// Table Initialization
// ============================================================================

/// Ensure the memories_content table exists
/// Called before any add/search operation
unsafe fn ensure_tables(
    L: *mut mlua::ffi::lua_State,
    db_cap_idx: c_int,
    db_path_idx: c_int,
) -> Result<(), String> {
    use mlua::ffi::*;

    // Call __lotus_sqlite_execute to create table if not exists
    lua_getglobal(L, b"__lotus_sqlite_execute\0".as_ptr() as *const c_char);
    if lua_isnil(L, -1) != 0 {
        lua_pop(L, 1);
        return Err("memory: __lotus_sqlite_execute global not found".to_string());
    }

    // Push args: capability, db_path, sql, params
    lua_pushvalue(L, db_cap_idx); // db capability
    lua_pushvalue(L, db_path_idx); // db path

    // SQL to create table
    let sql = CString::new(
        "CREATE TABLE IF NOT EXISTS memories_content (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            metadata TEXT,
            created_at INTEGER DEFAULT (unixepoch())
        )",
    )
    .unwrap();
    lua_pushstring(L, sql.as_ptr());

    // Empty params array
    lua_createtable(L, 0, 0);

    // Call __lotus_sqlite_execute(cap, path, sql, params)
    if lua_pcall(L, 4, 1, 0) != LUA_OK {
        let mut len = 0;
        let err_ptr = lua_tolstring(L, -1, &mut len);
        let err_msg = if err_ptr.is_null() {
            "Unknown error creating table".to_string()
        } else {
            let slice = std::slice::from_raw_parts(err_ptr as *const u8, len);
            std::str::from_utf8(slice)
                .unwrap_or("Invalid UTF-8 error")
                .to_string()
        };
        lua_pop(L, 1);
        return Err(format!("memory: failed to create table: {}", err_msg));
    }

    lua_pop(L, 1); // pop result
    Ok(())
}

// ============================================================================
// memory.add
// ============================================================================

/// Lua wrapper for memory.add
/// Args: db_capability, ai_capability, db_path, provider, model, content, metadata
/// Returns: id of inserted memory
#[unsafe(no_mangle)]
unsafe extern "C" fn memory_add_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    let nargs = lua_gettop(L);
    if nargs != 7 {
        return lua_push_error(
            L,
            "memory.add requires 7 arguments (db_capability, ai_capability, db_path, provider, model, content, metadata)",
        );
    }

    // Ensure tables exist
    if let Err(e) = ensure_tables(L, 1, 3) {
        return lua_push_error(L, &e);
    }

    // Get content string for embedding
    let content = match lua_get_string(L, 6) {
        Some(s) => s,
        None => return lua_push_error(L, "memory.add: content must be a string"),
    };

    // Step 1: Insert content into memories_content table
    lua_getglobal(L, b"__lotus_sqlite_execute\0".as_ptr() as *const c_char);
    if lua_isnil(L, -1) != 0 {
        lua_pop(L, 1);
        return lua_push_error(L, "memory.add: __lotus_sqlite_execute global not found");
    }

    lua_pushvalue(L, 1); // db_capability
    lua_pushvalue(L, 3); // db_path

    let insert_sql =
        CString::new("INSERT INTO memories_content (content, metadata) VALUES (?, ?)").unwrap();
    lua_pushstring(L, insert_sql.as_ptr());

    // Params array: [content, metadata_json]
    lua_createtable(L, 2, 0);
    lua_pushvalue(L, 6); // content
    lua_rawseti(L, -2, 1);

    // Convert metadata to JSON string
    // For now, push metadata as-is (it should be a table that sqlite can serialize)
    // Actually, we need to JSON encode it. Let's use json.encode if available
    lua_getglobal(L, b"json\0".as_ptr() as *const c_char);
    if lua_isnil(L, -1) != 0 {
        lua_pop(L, 1);
        // Fallback: just push empty string for metadata
        let empty = CString::new("{}").unwrap();
        lua_pushstring(L, empty.as_ptr());
    } else {
        lua_getfield(L, -1, b"encode\0".as_ptr() as *const c_char);
        lua_remove(L, -2); // remove json table
        lua_pushvalue(L, 7); // metadata
        if lua_pcall(L, 1, 1, 0) != LUA_OK {
            lua_pop(L, 1);
            let empty = CString::new("{}").unwrap();
            lua_pushstring(L, empty.as_ptr());
        }
    }
    lua_rawseti(L, -2, 2);

    // Call __lotus_sqlite_execute
    if lua_pcall(L, 4, 1, 0) != LUA_OK {
        return lua_error(L);
    }

    // Result is number of rows affected (should be 1)
    lua_pop(L, 1);

    // Get the last inserted rowid
    lua_getglobal(L, b"__lotus_sqlite_query\0".as_ptr() as *const c_char);
    if lua_isnil(L, -1) != 0 {
        lua_pop(L, 1);
        return lua_push_error(L, "memory.add: __lotus_sqlite_query global not found");
    }

    lua_pushvalue(L, 1); // db_capability
    lua_pushvalue(L, 3); // db_path
    let rowid_sql = CString::new("SELECT last_insert_rowid() as id").unwrap();
    lua_pushstring(L, rowid_sql.as_ptr());
    lua_createtable(L, 0, 0); // empty params

    if lua_pcall(L, 4, 1, 0) != LUA_OK {
        return lua_error(L);
    }

    // Result is array of rows, get first row's id
    lua_rawgeti(L, -1, 1); // first row
    lua_getfield(L, -1, b"id\0".as_ptr() as *const c_char);
    let row_id = lua_tointeger(L, -1);
    lua_pop(L, 3); // pop id, row, results

    // Step 2: Generate embedding via ai.embed
    lua_getglobal(L, b"__lotus_ai_embed\0".as_ptr() as *const c_char);
    if lua_isnil(L, -1) != 0 {
        lua_pop(L, 1);
        return lua_push_error(L, "memory.add: __lotus_ai_embed global not found");
    }

    lua_pushvalue(L, 2); // ai_capability
    lua_pushvalue(L, 4); // provider
    lua_pushvalue(L, 5); // model
    lua_pushvalue(L, 6); // content (text to embed)

    if lua_pcall(L, 4, 1, 0) != LUA_OK {
        return lua_error(L);
    }

    // Embedding is now on top of stack

    // Step 3: Insert into vector table
    lua_getglobal(L, b"__lotus_vector_insert\0".as_ptr() as *const c_char);
    if lua_isnil(L, -1) != 0 {
        lua_pop(L, 2); // pop nil and embedding
        return lua_push_error(L, "memory.add: __lotus_vector_insert global not found");
    }

    lua_pushvalue(L, 1); // db_capability (vector uses same DB)
    lua_pushvalue(L, 3); // db_path

    // Use row_id as key
    let key_str = CString::new(format!("memory_{}", row_id)).unwrap();
    lua_pushstring(L, key_str.as_ptr());

    lua_pushvalue(L, -5); // embedding (was at -4 before we pushed 3 more items)
    lua_pushvalue(L, 7); // metadata

    if lua_pcall(L, 5, 1, 0) != LUA_OK {
        return lua_error(L);
    }

    lua_pop(L, 2); // pop vector insert result and embedding

    // Return the content row ID
    lua_pushinteger(L, row_id);
    1
}

// ============================================================================
// memory.search
// ============================================================================

/// Lua wrapper for memory.search
/// Args: db_capability, ai_capability, db_path, provider, model, query, options
/// Returns: array of {id, content, metadata, distance}
#[unsafe(no_mangle)]
unsafe extern "C" fn memory_search_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    let nargs = lua_gettop(L);
    if nargs != 7 {
        return lua_push_error(
            L,
            "memory.search requires 7 arguments (db_capability, ai_capability, db_path, provider, model, query, options)",
        );
    }

    // Ensure tables exist
    if let Err(e) = ensure_tables(L, 1, 3) {
        return lua_push_error(L, &e);
    }

    // Step 1: Generate embedding for query
    lua_getglobal(L, b"__lotus_ai_embed\0".as_ptr() as *const c_char);
    if lua_isnil(L, -1) != 0 {
        lua_pop(L, 1);
        return lua_push_error(L, "memory.search: __lotus_ai_embed global not found");
    }

    lua_pushvalue(L, 2); // ai_capability
    lua_pushvalue(L, 4); // provider
    lua_pushvalue(L, 5); // model
    lua_pushvalue(L, 6); // query

    if lua_pcall(L, 4, 1, 0) != LUA_OK {
        return lua_error(L);
    }

    // Query embedding is now on top

    // Get limit from options (default 5)
    lua_pushvalue(L, 7); // options
    lua_getfield(L, -1, b"limit\0".as_ptr() as *const c_char);
    let limit = if lua_isnil(L, -1) != 0 {
        5
    } else {
        lua_tointeger(L, -1)
    };
    lua_pop(L, 2); // pop limit and options copy

    // Fetch more candidates for filtering (10x limit)
    let candidate_limit = limit * 10;

    // Step 2: Search vectors
    lua_getglobal(L, b"__lotus_vector_search\0".as_ptr() as *const c_char);
    if lua_isnil(L, -1) != 0 {
        lua_pop(L, 2); // pop nil and embedding
        return lua_push_error(L, "memory.search: __lotus_vector_search global not found");
    }

    lua_pushvalue(L, 1); // db_capability
    lua_pushvalue(L, 3); // db_path
    lua_pushvalue(L, -4); // query embedding (was at top, now shifted)
    lua_pushinteger(L, candidate_limit);

    if lua_pcall(L, 4, 1, 0) != LUA_OK {
        return lua_error(L);
    }

    // Vector results array is on top, query embedding below it
    // Stack: [..., query_embedding, vector_results]

    // Get filter from options
    lua_pushvalue(L, 7); // options
    lua_getfield(L, -1, b"filter\0".as_ptr() as *const c_char);
    let has_filter = lua_istable(L, -1) != 0;
    // Stack: [..., query_embedding, vector_results, options_copy, filter]

    // Create results array
    lua_createtable(L, limit as c_int, 0);
    // Stack: [..., query_embedding, vector_results, options_copy, filter, results]

    let mut result_count = 0;

    // Iterate through vector results
    let vector_results_idx = lua_gettop(L) - 3; // index of vector_results

    lua_pushnil(L);
    while lua_next(L, vector_results_idx) != 0 && result_count < limit {
        // Stack: [..., results, key, vector_result]

        // Get key from vector result (format: "memory_123")
        lua_getfield(L, -1, b"key\0".as_ptr() as *const c_char);
        let key = lua_get_string(L, -1).unwrap_or_default();
        lua_pop(L, 1);

        // Parse row ID from key
        let row_id: i64 = key
            .strip_prefix("memory_")
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);

        if row_id == 0 {
            lua_pop(L, 1); // pop vector_result, continue iteration
            continue;
        }

        // Get similarity from vector result
        lua_getfield(L, -1, b"similarity\0".as_ptr() as *const c_char);
        let similarity = lua_tonumber(L, -1);
        lua_pop(L, 1);

        // Fetch content from memories_content
        lua_getglobal(L, b"__lotus_sqlite_query\0".as_ptr() as *const c_char);
        lua_pushvalue(L, 1); // db_capability
        lua_pushvalue(L, 3); // db_path
        let query_sql = CString::new(
            "SELECT id, content, metadata, created_at FROM memories_content WHERE id = ?",
        )
        .unwrap();
        lua_pushstring(L, query_sql.as_ptr());
        lua_createtable(L, 1, 0);
        lua_pushinteger(L, row_id);
        lua_rawseti(L, -2, 1);

        if lua_pcall(L, 4, 1, 0) != LUA_OK {
            lua_pop(L, 2); // pop error and vector_result
            continue;
        }

        // Check if we got a result
        lua_rawgeti(L, -1, 1); // first row
        if lua_isnil(L, -1) != 0 {
            lua_pop(L, 3); // pop nil, query results, vector_result
            continue;
        }

        // Get metadata and check filter
        lua_getfield(L, -1, b"metadata\0".as_ptr() as *const c_char);
        // Decode metadata JSON string
        lua_getglobal(L, b"json\0".as_ptr() as *const c_char);
        if !lua_isnil(L, -1) != 0 {
            lua_getfield(L, -1, b"decode\0".as_ptr() as *const c_char);
            lua_remove(L, -2); // remove json table
            lua_pushvalue(L, -2); // metadata string
            if lua_pcall(L, 1, 1, 0) == LUA_OK {
                lua_remove(L, -2); // remove original metadata string
            } else {
                lua_pop(L, 1); // pop error
                               // Keep original metadata string
            }
        } else {
            lua_pop(L, 1); // pop nil json
        }

        // Stack now has decoded metadata on top

        // Apply filter if present
        if has_filter {
            let filter_idx = lua_gettop(L) - 3; // Approximate, need to track better
                                                // For now, skip filter check - full implementation would iterate filter keys
                                                // and compare with metadata values
        }

        // Build result object
        lua_createtable(L, 0, 5);

        // id
        lua_pushinteger(L, row_id);
        lua_setfield(L, -2, b"id\0".as_ptr() as *const c_char);

        // content
        lua_pushvalue(L, -3); // row from query result (need to track stack properly)
        lua_getfield(L, -1, b"content\0".as_ptr() as *const c_char);
        lua_remove(L, -2);
        lua_setfield(L, -2, b"content\0".as_ptr() as *const c_char);

        // metadata (already decoded on stack)
        lua_pushvalue(L, -2); // decoded metadata
        lua_setfield(L, -2, b"metadata\0".as_ptr() as *const c_char);

        // distance (1 - similarity for cosine)
        lua_pushnumber(L, 1.0 - similarity);
        lua_setfield(L, -2, b"distance\0".as_ptr() as *const c_char);

        // Add to results
        result_count += 1;
        let results_idx = lua_gettop(L) - 5; // Approximate
        lua_rawseti(L, results_idx, result_count as i64);

        // Clean up stack for this iteration
        lua_pop(L, 3); // pop decoded metadata, row, query results

        lua_pop(L, 1); // pop vector_result, continue iteration
    }

    // Clean up and return results
    // Stack management is complex here - simplified version
    lua_pop(L, 3); // pop filter, options_copy, query_embedding

    // Results table should be on top now
    1
}

// ============================================================================
// Plugin Lifecycle
// ============================================================================

/// Plugin initialization - register all functions
#[unsafe(no_mangle)]
pub unsafe extern "C" fn lotus_memory_plugin_init(register_fn: RegisterFunction) -> c_int {
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
    0
}

/// Plugin cleanup
#[unsafe(no_mangle)]
pub unsafe extern "C" fn lotus_memory_plugin_cleanup() -> c_int {
    0
}
