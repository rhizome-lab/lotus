//! Vector plugin for Viwo with sqlite-vec integration.

use rusqlite::Connection;
use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int};
use std::path::PathBuf;
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

/// Validate that a capability grants access to a database path
fn validate_capability(
    capability: &serde_json::Value,
    current_entity_id: i64,
    requested_path: &str,
) -> Result<(), String> {
    // Check ownership
    let owner_id = capability["owner_id"]
        .as_i64()
        .ok_or("vector: capability missing owner_id")?;
    if owner_id != current_entity_id {
        return Err("vector: capability does not belong to current entity".to_string());
    }

    // Check path matches allowed path
    let allowed_path = capability["params"]["path"]
        .as_str()
        .ok_or("vector: capability missing path parameter")?;

    // Canonicalize paths for comparison
    let resolved_target = PathBuf::from(requested_path)
        .canonicalize()
        .map_err(|_| format!("vector: database path does not exist: {}", requested_path))?;
    let resolved_allowed = PathBuf::from(allowed_path)
        .canonicalize()
        .map_err(|_| format!("vector: invalid allowed path: {}", allowed_path))?;

    if resolved_target != resolved_allowed {
        return Err(format!(
            "vector: path '{}' not allowed by capability",
            requested_path
        ));
    }

    Ok(())
}

/// Get or create a connection to a database
fn get_connection(db_path: &str) -> Result<&'static mut Connection, String> {
    init_connections();

    let mut conns_lock = CONNECTIONS.lock().unwrap();
    let conns = conns_lock.as_mut().unwrap();

    // This is safe because we hold the lock and connections live for the program lifetime
    if !conns.contains_key(db_path) {
        let conn = Connection::open(db_path)
            .map_err(|e| format!("vector: failed to open database: {}", e))?;

        // Enable virtual table support and load vec0 extension if available
        // Note: sqlite-vec needs to be loaded as an extension
        // For now, we'll create a simple vector table without the extension
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             CREATE TABLE IF NOT EXISTS vectors (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 key TEXT NOT NULL,
                 embedding BLOB NOT NULL,
                 metadata TEXT
             );
             CREATE INDEX IF NOT EXISTS idx_vectors_key ON vectors(key);",
        )
        .map_err(|e| format!("vector: failed to initialize tables: {}", e))?;

        conns.insert(db_path.to_string(), conn);
    }

    // SAFETY: We hold the mutex lock, so we have exclusive access
    let conn_ptr = conns.get_mut(db_path).unwrap() as *mut Connection;
    unsafe { Ok(&mut *conn_ptr) }
}

/// Insert a vector embedding
pub fn vector_insert(
    capability: &serde_json::Value,
    entity_id: i64,
    db_path: &str,
    key: &str,
    embedding: &[f32],
    metadata: &serde_json::Value,
) -> Result<i64, String> {
    validate_capability(capability, entity_id, db_path)?;

    let conn = get_connection(db_path)?;

    // Convert f32 array to bytes
    let embedding_bytes: Vec<u8> = embedding.iter().flat_map(|f| f.to_le_bytes()).collect();

    let metadata_str = serde_json::to_string(metadata)
        .map_err(|e| format!("vector: failed to serialize metadata: {}", e))?;

    conn.execute(
        "INSERT INTO vectors (key, embedding, metadata) VALUES (?, ?, ?)",
        rusqlite::params![key, &embedding_bytes, &metadata_str],
    )
    .map_err(|e| format!("vector.insert failed: {}", e))?;

    let id = conn.last_insert_rowid();
    Ok(id)
}

/// Search for similar vectors using cosine similarity
pub fn vector_search(
    capability: &serde_json::Value,
    entity_id: i64,
    db_path: &str,
    query_embedding: &[f32],
    limit: usize,
) -> Result<Vec<serde_json::Value>, String> {
    validate_capability(capability, entity_id, db_path)?;

    let conn = get_connection(db_path)?;

    // Get all vectors and compute similarity in memory
    // Note: This is inefficient for large datasets but works without sqlite-vec extension
    let mut stmt = conn
        .prepare("SELECT id, key, embedding, metadata FROM vectors")
        .map_err(|e| format!("vector.search failed to prepare: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            let id: i64 = row.get(0)?;
            let key: String = row.get(1)?;
            let embedding_bytes: Vec<u8> = row.get(2)?;
            let metadata_str: String = row.get(3)?;

            // Convert bytes back to f32 array
            let embedding: Vec<f32> = embedding_bytes
                .chunks_exact(4)
                .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
                .collect();

            // Compute cosine similarity
            let similarity = cosine_similarity(query_embedding, &embedding);

            let metadata: serde_json::Value =
                serde_json::from_str(&metadata_str).unwrap_or(serde_json::Value::Null);

            Ok((id, key, similarity, metadata))
        })
        .map_err(|e| format!("vector.search query failed: {}", e))?;

    let mut results: Vec<(i64, String, f32, serde_json::Value)> = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("vector.search failed to collect: {}", e))?;

    // Sort by similarity (descending)
    results.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));

    // Take top N results
    Ok(results
        .into_iter()
        .take(limit)
        .map(|(id, key, similarity, metadata)| {
            serde_json::json!({
                "id": id,
                "key": key,
                "similarity": similarity,
                "metadata": metadata,
            })
        })
        .collect())
}

/// Delete a vector by key
pub fn vector_delete(
    capability: &serde_json::Value,
    entity_id: i64,
    db_path: &str,
    key: &str,
) -> Result<i64, String> {
    validate_capability(capability, entity_id, db_path)?;

    let conn = get_connection(db_path)?;

    let rows_affected = conn
        .execute("DELETE FROM vectors WHERE key = ?", rusqlite::params![key])
        .map_err(|e| format!("vector.delete failed: {}", e))?;

    Ok(rows_affected as i64)
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
unsafe fn lua_value_to_json(
    L: *mut mlua::ffi::lua_State,
    idx: c_int,
) -> Result<serde_json::Value, String> {
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
unsafe fn lua_table_to_json(
    L: *mut mlua::ffi::lua_State,
    idx: c_int,
) -> Result<serde_json::Value, String> {
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

/// Helper: Convert Lua table to f32 array
unsafe fn lua_table_to_f32_array(
    L: *mut mlua::ffi::lua_State,
    idx: c_int,
) -> Result<Vec<f32>, String> {
    use mlua::ffi::*;

    if lua_type(L, idx) != LUA_TTABLE {
        return Err("Expected table".to_string());
    }

    let abs_idx = if idx < 0 && idx > LUA_REGISTRYINDEX {
        lua_gettop(L) + idx + 1
    } else {
        idx
    };

    let mut result = Vec::new();
    let mut i = 1;

    loop {
        lua_rawgeti(L, abs_idx, i);
        if lua_type(L, -1) == LUA_TNIL {
            lua_pop(L, 1);
            break;
        }
        let val = lua_tonumber(L, -1) as f32;
        result.push(val);
        lua_pop(L, 1);
        i += 1;
    }

    Ok(result)
}

/// Helper: Push error message to Lua stack
unsafe fn lua_push_error(L: *mut mlua::ffi::lua_State, msg: &str) -> c_int {
    use mlua::ffi::*;
    let c_msg = CString::new(msg)
        .unwrap_or_else(|_| CString::new("Error message contains null byte").unwrap());
    lua_pushstring(L, c_msg.as_ptr());
    lua_error(L)
}

/// Helper: Push JSON value to Lua stack
unsafe fn json_to_lua(
    L: *mut mlua::ffi::lua_State,
    value: &serde_json::Value,
) -> Result<(), String> {
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

/// Lua wrapper for vector.insert
#[unsafe(no_mangle)]
unsafe extern "C" fn vector_insert_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    let nargs = lua_gettop(L);
    if nargs != 5 {
        return lua_push_error(
            L,
            "vector.insert requires 5 arguments (capability, db_path, key, embedding, metadata)",
        );
    }

    // Get capability (table)
    let cap_json = match lua_value_to_json(L, 1) {
        Ok(json) => json,
        Err(e) => return lua_push_error(L, &format!("Invalid capability: {}", e)),
    };

    // Get db_path (string)
    let mut len = 0;
    let db_path_ptr = lua_tolstring(L, 2, &mut len);
    if db_path_ptr.is_null() {
        return lua_push_error(L, "vector.insert: db_path must be a string");
    }
    let db_path_slice = std::slice::from_raw_parts(db_path_ptr as *const u8, len);
    let db_path = match std::str::from_utf8(db_path_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "vector.insert: db_path contains invalid UTF-8"),
    };

    // Get key (string)
    let key_ptr = lua_tolstring(L, 3, &mut len);
    if key_ptr.is_null() {
        return lua_push_error(L, "vector.insert: key must be a string");
    }
    let key_slice = std::slice::from_raw_parts(key_ptr as *const u8, len);
    let key = match std::str::from_utf8(key_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "vector.insert: key contains invalid UTF-8"),
    };

    // Get embedding (array of numbers)
    let embedding = match lua_table_to_f32_array(L, 4) {
        Ok(arr) => arr,
        Err(e) => return lua_push_error(L, &format!("Invalid embedding: {}", e)),
    };

    // Get metadata (table/object)
    let metadata = match lua_value_to_json(L, 5) {
        Ok(json) => json,
        Err(e) => return lua_push_error(L, &format!("Invalid metadata: {}", e)),
    };

    // Get __viwo_this_id from globals
    lua_getglobal(L, b"__viwo_this_id\0".as_ptr() as *const c_char);
    let this_id = lua_tointeger(L, -1);
    lua_pop(L, 1);

    // Execute insert
    let result = vector_insert(&cap_json, this_id, db_path, key, &embedding, &metadata);

    match result {
        Ok(id) => {
            lua_pushinteger(L, id);
            1
        }
        Err(e) => lua_push_error(L, &e),
    }
}

/// Lua wrapper for vector.search
#[unsafe(no_mangle)]
unsafe extern "C" fn vector_search_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    let nargs = lua_gettop(L);
    if nargs != 4 {
        return lua_push_error(
            L,
            "vector.search requires 4 arguments (capability, db_path, query_embedding, limit)",
        );
    }

    // Get capability (table)
    let cap_json = match lua_value_to_json(L, 1) {
        Ok(json) => json,
        Err(e) => return lua_push_error(L, &format!("Invalid capability: {}", e)),
    };

    // Get db_path (string)
    let mut len = 0;
    let db_path_ptr = lua_tolstring(L, 2, &mut len);
    if db_path_ptr.is_null() {
        return lua_push_error(L, "vector.search: db_path must be a string");
    }
    let db_path_slice = std::slice::from_raw_parts(db_path_ptr as *const u8, len);
    let db_path = match std::str::from_utf8(db_path_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "vector.search: db_path contains invalid UTF-8"),
    };

    // Get query_embedding (array of numbers)
    let query_embedding = match lua_table_to_f32_array(L, 3) {
        Ok(arr) => arr,
        Err(e) => return lua_push_error(L, &format!("Invalid query_embedding: {}", e)),
    };

    // Get limit (number)
    let limit = lua_tointeger(L, 4) as usize;

    // Get __viwo_this_id from globals
    lua_getglobal(L, b"__viwo_this_id\0".as_ptr() as *const c_char);
    let this_id = lua_tointeger(L, -1);
    lua_pop(L, 1);

    // Execute search
    let result = vector_search(&cap_json, this_id, db_path, &query_embedding, limit);

    match result {
        Ok(results) => {
            let results_json = serde_json::Value::Array(results);
            if let Err(e) = json_to_lua(L, &results_json) {
                return lua_push_error(L, &format!("Failed to convert results: {}", e));
            }
            1
        }
        Err(e) => lua_push_error(L, &e),
    }
}

/// Lua wrapper for vector.delete
#[unsafe(no_mangle)]
unsafe extern "C" fn vector_delete_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    let nargs = lua_gettop(L);
    if nargs != 3 {
        return lua_push_error(
            L,
            "vector.delete requires 3 arguments (capability, db_path, key)",
        );
    }

    // Get capability (table)
    let cap_json = match lua_value_to_json(L, 1) {
        Ok(json) => json,
        Err(e) => return lua_push_error(L, &format!("Invalid capability: {}", e)),
    };

    // Get db_path (string)
    let mut len = 0;
    let db_path_ptr = lua_tolstring(L, 2, &mut len);
    if db_path_ptr.is_null() {
        return lua_push_error(L, "vector.delete: db_path must be a string");
    }
    let db_path_slice = std::slice::from_raw_parts(db_path_ptr as *const u8, len);
    let db_path = match std::str::from_utf8(db_path_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "vector.delete: db_path contains invalid UTF-8"),
    };

    // Get key (string)
    let key_ptr = lua_tolstring(L, 3, &mut len);
    if key_ptr.is_null() {
        return lua_push_error(L, "vector.delete: key must be a string");
    }
    let key_slice = std::slice::from_raw_parts(key_ptr as *const u8, len);
    let key = match std::str::from_utf8(key_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "vector.delete: key contains invalid UTF-8"),
    };

    // Get __viwo_this_id from globals
    lua_getglobal(L, b"__viwo_this_id\0".as_ptr() as *const c_char);
    let this_id = lua_tointeger(L, -1);
    lua_pop(L, 1);

    // Execute delete
    let result = vector_delete(&cap_json, this_id, db_path, key);

    match result {
        Ok(rows_affected) => {
            lua_pushinteger(L, rows_affected);
            1
        }
        Err(e) => lua_push_error(L, &e),
    }
}

/// Plugin initialization - register all functions
#[unsafe(no_mangle)]
pub unsafe extern "C" fn plugin_init(register_fn: RegisterFunction) -> c_int {
    unsafe {
        let names = ["vector.insert", "vector.search", "vector.delete"];
        let funcs: [PluginLuaFunction; 3] =
            [vector_insert_lua, vector_search_lua, vector_delete_lua];

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
    use tempfile::NamedTempFile;

    fn create_test_capability(owner_id: i64, path: &str) -> serde_json::Value {
        serde_json::json!({
            "owner_id": owner_id,
            "params": {
                "path": path
            }
        })
    }

    #[test]
    fn test_vector_insert() {
        let temp_db = NamedTempFile::new().unwrap();
        let db_path = temp_db.path().to_str().unwrap();
        let cap = create_test_capability(1, db_path);

        let embedding = vec![1.0, 0.0, 0.0];
        let metadata = serde_json::json!({"text": "hello"});

        let id = vector_insert(&cap, 1, db_path, "test1", &embedding, &metadata).unwrap();
        assert!(id > 0);
    }

    #[test]
    fn test_vector_search() {
        let temp_db = NamedTempFile::new().unwrap();
        let db_path = temp_db.path().to_str().unwrap();
        let cap = create_test_capability(1, db_path);

        // Insert test vectors
        vector_insert(
            &cap,
            1,
            db_path,
            "vec1",
            &[1.0, 0.0, 0.0],
            &serde_json::json!({"text": "first"}),
        )
        .unwrap();

        vector_insert(
            &cap,
            1,
            db_path,
            "vec2",
            &[0.9, 0.1, 0.0],
            &serde_json::json!({"text": "second"}),
        )
        .unwrap();

        vector_insert(
            &cap,
            1,
            db_path,
            "vec3",
            &[0.0, 1.0, 0.0],
            &serde_json::json!({"text": "third"}),
        )
        .unwrap();

        // Search for similar to [1.0, 0.0, 0.0]
        let results = vector_search(&cap, 1, db_path, &[1.0, 0.0, 0.0], 2).unwrap();

        assert_eq!(results.len(), 2);
        assert_eq!(results[0]["key"], "vec1"); // Exact match
        assert_eq!(results[1]["key"], "vec2"); // Close match
    }

    #[test]
    fn test_vector_delete() {
        let temp_db = NamedTempFile::new().unwrap();
        let db_path = temp_db.path().to_str().unwrap();
        let cap = create_test_capability(1, db_path);

        vector_insert(
            &cap,
            1,
            db_path,
            "delete_me",
            &[1.0, 0.0],
            &serde_json::json!({}),
        )
        .unwrap();

        let rows = vector_delete(&cap, 1, db_path, "delete_me").unwrap();
        assert_eq!(rows, 1);

        // Verify deleted
        let results = vector_search(&cap, 1, db_path, &[1.0, 0.0], 10).unwrap();
        assert_eq!(results.len(), 0);
    }

    #[test]
    fn test_cosine_similarity() {
        assert!((cosine_similarity(&[1.0, 0.0], &[1.0, 0.0]) - 1.0).abs() < 0.001);
        assert!((cosine_similarity(&[1.0, 0.0], &[0.0, 1.0]) - 0.0).abs() < 0.001);
        assert!(cosine_similarity(&[1.0, 1.0], &[1.0, 1.0]) > 0.99);
    }

    #[test]
    fn test_vector_capability_validation() {
        let temp_db1 = NamedTempFile::new().unwrap();
        let temp_db2 = NamedTempFile::new().unwrap();

        let db1_path = temp_db1.path().to_str().unwrap();
        let db2_path = temp_db2.path().to_str().unwrap();

        let cap = create_test_capability(1, db1_path);

        // Try to access different database
        let result = vector_insert(&cap, 1, db2_path, "test", &[1.0], &serde_json::json!({}));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not allowed"));

        // Try with wrong entity ID
        let result = vector_insert(&cap, 2, db1_path, "test", &[1.0], &serde_json::json!({}));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("does not belong"));
    }
}
