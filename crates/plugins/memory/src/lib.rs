//! Memory plugin for Viwo - RAG with vector search and AI embeddings.

use rusqlite::Connection;
use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int};
use std::sync::Mutex;

type RegisterFunction = unsafe extern "C" fn(*const c_char, PluginLuaFunction) -> c_int;
type PluginLuaFunction = unsafe extern "C" fn(*mut mlua::ffi::lua_State) -> c_int;

/// Global connection pool indexed by database path
static CONNECTIONS: Mutex<Option<HashMap<String, Connection>>> = Mutex::new(None);

/// Initialize the connection pool
fn init_connections() {
    let mut conns = CONNECTIONS.lock().unwrap();
    if conns.is_none() {
        *conns = Some(HashMap::new());
    }
}

/// Validate that capabilities grant access
fn validate_capabilities(
    db_capability: &serde_json::Value,
    ai_capability: &serde_json::Value,
    current_entity_id: i64,
) -> Result<(), String> {
    // Check ownership of database capability
    let db_owner_id = db_capability["owner_id"]
        .as_i64()
        .ok_or("memory: db_capability missing owner_id")?;
    if db_owner_id != current_entity_id {
        return Err("memory: db_capability does not belong to current entity".to_string());
    }

    // Check ownership of AI capability
    let ai_owner_id = ai_capability["owner_id"]
        .as_i64()
        .ok_or("memory: ai_capability missing owner_id")?;
    if ai_owner_id != current_entity_id {
        return Err("memory: ai_capability does not belong to current entity".to_string());
    }

    Ok(())
}

/// Get or create a connection to a database and initialize tables
fn get_connection(db_path: &str) -> Result<&'static mut Connection, String> {
    init_connections();

    let mut conns_lock = CONNECTIONS.lock().unwrap();
    let conns = conns_lock.as_mut().unwrap();

    if !conns.contains_key(db_path) {
        let conn = Connection::open(db_path)
            .map_err(|e| format!("memory: failed to open database: {}", e))?;

        // Initialize tables
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             CREATE TABLE IF NOT EXISTS memories_content (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 content TEXT NOT NULL,
                 metadata TEXT,
                 created_at INTEGER DEFAULT (unixepoch())
             );
             CREATE TABLE IF NOT EXISTS memories_vec (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 rowid INTEGER NOT NULL,
                 embedding BLOB NOT NULL,
                 FOREIGN KEY(rowid) REFERENCES memories_content(id)
             );
             CREATE INDEX IF NOT EXISTS idx_memories_vec_rowid ON memories_vec(rowid);",
        )
        .map_err(|e| format!("memory: failed to initialize tables: {}", e))?;

        conns.insert(db_path.to_string(), conn);
    }

    // SAFETY: We hold the mutex lock, so we have exclusive access
    let conn_ptr = conns.get_mut(db_path).unwrap() as *mut Connection;
    unsafe { Ok(&mut *conn_ptr) }
}

/// Add a memory with embedding
pub async fn memory_add(
    db_capability: &serde_json::Value,
    ai_capability: &serde_json::Value,
    entity_id: i64,
    db_path: &str,
    provider: &str,
    model: &str,
    content: &str,
    metadata: &serde_json::Value,
) -> Result<i64, String> {
    validate_capabilities(db_capability, ai_capability, entity_id)?;

    // 1. Generate embedding using AI plugin
    let embedding = viwo_plugin_ai::ai_embed(ai_capability, entity_id, provider, model, content)
        .await
        .map_err(|e| format!("memory.add: failed to generate embedding: {}", e))?;

    // 2. Insert content into memories_content table
    let conn = get_connection(db_path)?;

    let metadata_str = serde_json::to_string(metadata)
        .map_err(|e| format!("memory.add: failed to serialize metadata: {}", e))?;

    conn.execute(
        "INSERT INTO memories_content (content, metadata) VALUES (?, ?)",
        rusqlite::params![content, &metadata_str],
    )
    .map_err(|e| format!("memory.add: failed to insert content: {}", e))?;

    let content_id = conn.last_insert_rowid();

    // 3. Convert f64 embedding to f32 for storage
    let embedding_f32: Vec<f32> = embedding.iter().map(|&x| x as f32).collect();

    // 4. Insert vector into memories_vec table
    let embedding_bytes: Vec<u8> = embedding_f32
        .iter()
        .flat_map(|f| f.to_le_bytes())
        .collect();

    conn.execute(
        "INSERT INTO memories_vec (rowid, embedding) VALUES (?, ?)",
        rusqlite::params![content_id, &embedding_bytes],
    )
    .map_err(|e| format!("memory.add: failed to insert vector: {}", e))?;

    Ok(content_id)
}

/// Search memories by query embedding
pub async fn memory_search(
    db_capability: &serde_json::Value,
    ai_capability: &serde_json::Value,
    entity_id: i64,
    db_path: &str,
    provider: &str,
    model: &str,
    query: &str,
    options: &serde_json::Value,
) -> Result<Vec<serde_json::Value>, String> {
    validate_capabilities(db_capability, ai_capability, entity_id)?;

    // 1. Generate embedding for query
    let query_embedding = viwo_plugin_ai::ai_embed(ai_capability, entity_id, provider, model, query)
        .await
        .map_err(|e| format!("memory.search: failed to generate query embedding: {}", e))?;

    // Convert to f32 for comparison
    let query_embedding_f32: Vec<f32> = query_embedding.iter().map(|&x| x as f32).collect();

    // 2. Get all vectors and compute similarity
    let conn = get_connection(db_path)?;

    let limit = options["limit"].as_u64().unwrap_or(5) as usize;
    let filter = options.get("filter").cloned().unwrap_or(serde_json::Value::Object(Default::default()));

    let mut stmt = conn
        .prepare("SELECT rowid, embedding FROM memories_vec")
        .map_err(|e| format!("memory.search: failed to prepare vector query: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            let rowid: i64 = row.get(0)?;
            let embedding_bytes: Vec<u8> = row.get(1)?;

            // Convert bytes back to f32 array
            let embedding: Vec<f32> = embedding_bytes
                .chunks_exact(4)
                .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
                .collect();

            // Compute cosine similarity
            let similarity = cosine_similarity(&query_embedding_f32, &embedding);

            Ok((rowid, similarity))
        })
        .map_err(|e| format!("memory.search: vector query failed: {}", e))?;

    let mut results: Vec<(i64, f32)> = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("memory.search: failed to collect vectors: {}", e))?;

    // Sort by similarity (descending)
    results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    // 3. Retrieve content and apply filter
    let mut memories = Vec::new();
    for (rowid, similarity) in results.iter().take(limit * 10) {
        // Fetch more candidates for filtering
        if memories.len() >= limit {
            break;
        }

        let row_result = conn.query_row(
            "SELECT id, content, metadata, created_at FROM memories_content WHERE id = ?",
            rusqlite::params![rowid],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            },
        );

        match row_result {
            Ok((id, content, metadata_str, created_at)) => {
                let metadata: serde_json::Value = metadata_str
                    .as_ref()
                    .and_then(|s| serde_json::from_str(s).ok())
                    .unwrap_or(serde_json::Value::Object(Default::default()));

                // Apply filter
                if !filter.is_null() && filter.is_object() {
                    let filter_obj = filter.as_object().unwrap();
                    let metadata_obj = metadata.as_object();

                    let mut matches = true;
                    for (key, value) in filter_obj {
                        if metadata_obj.map_or(true, |m| m.get(key) != Some(value)) {
                            matches = false;
                            break;
                        }
                    }

                    if !matches {
                        continue;
                    }
                }

                memories.push(serde_json::json!({
                    "id": id,
                    "content": content,
                    "metadata": metadata,
                    "created_at": created_at,
                    "similarity": similarity,
                }));
            }
            Err(_) => continue, // Skip if content not found
        }
    }

    Ok(memories)
}

/// Compute cosine similarity between two vectors
fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() {
        return 0.0;
    }

    let dot_product: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let magnitude_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let magnitude_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();

    if magnitude_a == 0.0 || magnitude_b == 0.0 {
        return 0.0;
    }

    dot_product / (magnitude_a * magnitude_b)
}

// ============================================================================
// Lua C API Integration
// ============================================================================

/// Helper: Convert Lua value at index to JSON
unsafe fn lua_value_to_json(L: *mut mlua::ffi::lua_State, idx: c_int) -> Result<serde_json::Value, String> {
    use mlua::ffi::*;

    let lua_type = lua_type(L, idx);
    match lua_type {
        LUA_TNIL => Ok(serde_json::Value::Null),
        LUA_TBOOLEAN => {
            let b = lua_toboolean(L, idx);
            Ok(serde_json::Value::Bool(b != 0))
        }
        LUA_TNUMBER => {
            let n = lua_tonumber(L, idx);
            Ok(serde_json::json!(n))
        }
        LUA_TSTRING => {
            let mut len = 0;
            let ptr = lua_tolstring(L, idx, &mut len);
            if ptr.is_null() {
                return Err("Invalid string".to_string());
            }
            let slice = std::slice::from_raw_parts(ptr as *const u8, len);
            let s = std::str::from_utf8(slice).map_err(|_| "Invalid UTF-8")?;
            Ok(serde_json::Value::String(s.to_string()))
        }
        LUA_TTABLE => lua_table_to_json(L, idx),
        _ => Err(format!("Unsupported Lua type: {}", lua_type)),
    }
}

/// Helper: Convert Lua table at index to JSON (object or array)
unsafe fn lua_table_to_json(L: *mut mlua::ffi::lua_State, idx: c_int) -> Result<serde_json::Value, String> {
    use mlua::ffi::*;

    let abs_idx = if idx < 0 && idx > LUA_REGISTRYINDEX {
        lua_gettop(L) + idx + 1
    } else {
        idx
    };

    let mut map = serde_json::Map::new();
    let mut array = Vec::new();
    let mut is_array = true;
    let mut expected_idx = 1;

    lua_pushnil(L);
    while lua_next(L, abs_idx) != 0 {
        let key_type = lua_type(L, -2);

        if key_type == LUA_TNUMBER {
            let key_num = lua_tointeger(L, -2);
            if key_num == expected_idx {
                let value = lua_value_to_json(L, -1)?;
                array.push(value);
                expected_idx += 1;
            } else {
                is_array = false;
            }
        } else {
            is_array = false;
        }

        let key = match key_type {
            LUA_TSTRING => {
                let mut len = 0;
                let ptr = lua_tolstring(L, -2, &mut len);
                let slice = std::slice::from_raw_parts(ptr as *const u8, len);
                String::from_utf8_lossy(slice).to_string()
            }
            LUA_TNUMBER => {
                let n = lua_tointeger(L, -2);
                n.to_string()
            }
            _ => {
                lua_pop(L, 1);
                continue;
            }
        };

        let value = lua_value_to_json(L, -1)?;
        map.insert(key, value);

        lua_pop(L, 1);
    }

    if is_array && !array.is_empty() {
        Ok(serde_json::Value::Array(array))
    } else {
        Ok(serde_json::Value::Object(map))
    }
}

/// Helper: Push error message to Lua stack
unsafe fn lua_push_error(L: *mut mlua::ffi::lua_State, msg: &str) -> c_int {
    use mlua::ffi::*;
    let c_msg = CString::new(msg).unwrap_or_else(|_| CString::new("Error message contains null byte").unwrap());
    lua_pushstring(L, c_msg.as_ptr());
    lua_error(L)
}

/// Helper: Push JSON value to Lua stack
unsafe fn json_to_lua(L: *mut mlua::ffi::lua_State, value: &serde_json::Value) -> Result<(), String> {
    use mlua::ffi::*;

    match value {
        serde_json::Value::Null => lua_pushnil(L),
        serde_json::Value::Bool(b) => lua_pushboolean(L, if *b { 1 } else { 0 }),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                lua_pushinteger(L, i);
            } else if let Some(f) = n.as_f64() {
                lua_pushnumber(L, f);
            } else {
                return Err("Invalid number".to_string());
            }
        }
        serde_json::Value::String(s) => {
            let c_str = CString::new(s.as_str()).map_err(|_| "String contains null byte")?;
            lua_pushstring(L, c_str.as_ptr());
        }
        serde_json::Value::Array(arr) => {
            lua_createtable(L, arr.len() as c_int, 0);
            for (i, item) in arr.iter().enumerate() {
                json_to_lua(L, item)?;
                lua_rawseti(L, -2, (i + 1) as i64);
            }
        }
        serde_json::Value::Object(obj) => {
            lua_createtable(L, 0, obj.len() as c_int);
            for (key, value) in obj {
                let c_key = CString::new(key.as_str()).map_err(|_| "Key contains null byte")?;
                json_to_lua(L, value)?;
                lua_setfield(L, -2, c_key.as_ptr());
            }
        }
    }
    Ok(())
}

/// Lua wrapper for memory.add
#[unsafe(no_mangle)]
unsafe extern "C" fn memory_add_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    let nargs = lua_gettop(L);
    if nargs != 7 {
        return lua_push_error(L, "memory.add requires 7 arguments (db_capability, ai_capability, db_path, provider, model, content, metadata)");
    }

    // Get db_capability (table)
    let db_cap_json = match lua_value_to_json(L, 1) {
        Ok(json) => json,
        Err(e) => return lua_push_error(L, &format!("Invalid db_capability: {}", e)),
    };

    // Get ai_capability (table)
    let ai_cap_json = match lua_value_to_json(L, 2) {
        Ok(json) => json,
        Err(e) => return lua_push_error(L, &format!("Invalid ai_capability: {}", e)),
    };

    // Get db_path (string)
    let mut len = 0;
    let db_path_ptr = lua_tolstring(L, 3, &mut len);
    if db_path_ptr.is_null() {
        return lua_push_error(L, "memory.add: db_path must be a string");
    }
    let db_path_slice = std::slice::from_raw_parts(db_path_ptr as *const u8, len);
    let db_path = match std::str::from_utf8(db_path_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "memory.add: db_path contains invalid UTF-8"),
    };

    // Get provider (string)
    let provider_ptr = lua_tolstring(L, 4, &mut len);
    if provider_ptr.is_null() {
        return lua_push_error(L, "memory.add: provider must be a string");
    }
    let provider_slice = std::slice::from_raw_parts(provider_ptr as *const u8, len);
    let provider = match std::str::from_utf8(provider_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "memory.add: provider contains invalid UTF-8"),
    };

    // Get model (string)
    let model_ptr = lua_tolstring(L, 5, &mut len);
    if model_ptr.is_null() {
        return lua_push_error(L, "memory.add: model must be a string");
    }
    let model_slice = std::slice::from_raw_parts(model_ptr as *const u8, len);
    let model = match std::str::from_utf8(model_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "memory.add: model contains invalid UTF-8"),
    };

    // Get content (string)
    let content_ptr = lua_tolstring(L, 6, &mut len);
    if content_ptr.is_null() {
        return lua_push_error(L, "memory.add: content must be a string");
    }
    let content_slice = std::slice::from_raw_parts(content_ptr as *const u8, len);
    let content = match std::str::from_utf8(content_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "memory.add: content contains invalid UTF-8"),
    };

    // Get metadata (table)
    let metadata = match lua_value_to_json(L, 7) {
        Ok(json) => json,
        Err(e) => return lua_push_error(L, &format!("Invalid metadata: {}", e)),
    };

    // Get __viwo_this_id from globals
    lua_getglobal(L, b"__viwo_this_id\0".as_ptr() as *const c_char);
    let this_id = lua_tointeger(L, -1);
    lua_pop(L, 1);

    // Execute async operation
    let result = tokio::runtime::Runtime::new()
        .map_err(|e| format!("Failed to create tokio runtime: {}", e))
        .and_then(|rt| {
            rt.block_on(memory_add(&db_cap_json, &ai_cap_json, this_id, db_path, provider, model, content, &metadata))
        });

    match result {
        Ok(id) => {
            lua_pushinteger(L, id);
            1
        }
        Err(e) => lua_push_error(L, &e),
    }
}

/// Lua wrapper for memory.search
#[unsafe(no_mangle)]
unsafe extern "C" fn memory_search_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    let nargs = lua_gettop(L);
    if nargs != 7 {
        return lua_push_error(L, "memory.search requires 7 arguments (db_capability, ai_capability, db_path, provider, model, query, options)");
    }

    // Get db_capability (table)
    let db_cap_json = match lua_value_to_json(L, 1) {
        Ok(json) => json,
        Err(e) => return lua_push_error(L, &format!("Invalid db_capability: {}", e)),
    };

    // Get ai_capability (table)
    let ai_cap_json = match lua_value_to_json(L, 2) {
        Ok(json) => json,
        Err(e) => return lua_push_error(L, &format!("Invalid ai_capability: {}", e)),
    };

    // Get db_path (string)
    let mut len = 0;
    let db_path_ptr = lua_tolstring(L, 3, &mut len);
    if db_path_ptr.is_null() {
        return lua_push_error(L, "memory.search: db_path must be a string");
    }
    let db_path_slice = std::slice::from_raw_parts(db_path_ptr as *const u8, len);
    let db_path = match std::str::from_utf8(db_path_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "memory.search: db_path contains invalid UTF-8"),
    };

    // Get provider (string)
    let provider_ptr = lua_tolstring(L, 4, &mut len);
    if provider_ptr.is_null() {
        return lua_push_error(L, "memory.search: provider must be a string");
    }
    let provider_slice = std::slice::from_raw_parts(provider_ptr as *const u8, len);
    let provider = match std::str::from_utf8(provider_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "memory.search: provider contains invalid UTF-8"),
    };

    // Get model (string)
    let model_ptr = lua_tolstring(L, 5, &mut len);
    if model_ptr.is_null() {
        return lua_push_error(L, "memory.search: model must be a string");
    }
    let model_slice = std::slice::from_raw_parts(model_ptr as *const u8, len);
    let model = match std::str::from_utf8(model_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "memory.search: model contains invalid UTF-8"),
    };

    // Get query (string)
    let query_ptr = lua_tolstring(L, 6, &mut len);
    if query_ptr.is_null() {
        return lua_push_error(L, "memory.search: query must be a string");
    }
    let query_slice = std::slice::from_raw_parts(query_ptr as *const u8, len);
    let query = match std::str::from_utf8(query_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "memory.search: query contains invalid UTF-8"),
    };

    // Get options (table)
    let options = match lua_value_to_json(L, 7) {
        Ok(json) => json,
        Err(e) => return lua_push_error(L, &format!("Invalid options: {}", e)),
    };

    // Get __viwo_this_id from globals
    lua_getglobal(L, b"__viwo_this_id\0".as_ptr() as *const c_char);
    let this_id = lua_tointeger(L, -1);
    lua_pop(L, 1);

    // Execute async operation
    let result = tokio::runtime::Runtime::new()
        .map_err(|e| format!("Failed to create tokio runtime: {}", e))
        .and_then(|rt| {
            rt.block_on(memory_search(&db_cap_json, &ai_cap_json, this_id, db_path, provider, model, query, &options))
        });

    match result {
        Ok(memories) => {
            let memories_json = serde_json::Value::Array(memories);
            if let Err(e) = json_to_lua(L, &memories_json) {
                return lua_push_error(L, &format!("Failed to convert results: {}", e));
            }
            1
        }
        Err(e) => lua_push_error(L, &e),
    }
}

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
    let mut conns = CONNECTIONS.lock().unwrap();
    *conns = None;
    0 // Success
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_similarity() {
        assert!((cosine_similarity(&[1.0, 0.0], &[1.0, 0.0]) - 1.0).abs() < 0.001);
        assert!((cosine_similarity(&[1.0, 0.0], &[0.0, 1.0]) - 0.0).abs() < 0.001);
        assert!(cosine_similarity(&[1.0, 1.0], &[1.0, 1.0]) > 0.99);
    }

    fn create_test_db_capability(owner_id: i64, path: &str) -> serde_json::Value {
        serde_json::json!({
            "owner_id": owner_id,
            "params": {
                "path": path
            }
        })
    }

    fn create_test_ai_capability(owner_id: i64, api_key: &str) -> serde_json::Value {
        serde_json::json!({
            "owner_id": owner_id,
            "params": {
                "api_key": api_key
            }
        })
    }

    #[test]
    fn test_capability_validation() {
        let db_cap = create_test_db_capability(1, "/tmp/test.db");
        let ai_cap = create_test_ai_capability(1, "test-key");

        // Valid capabilities
        assert!(validate_capabilities(&db_cap, &ai_cap, 1).is_ok());

        // Wrong entity ID for db capability
        assert!(validate_capabilities(&db_cap, &ai_cap, 2).is_err());

        // Wrong entity ID for ai capability
        let ai_cap_wrong = create_test_ai_capability(2, "test-key");
        assert!(validate_capabilities(&db_cap, &ai_cap_wrong, 1).is_err());
    }
}
