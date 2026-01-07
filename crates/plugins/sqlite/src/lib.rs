//! SQLite plugin for Viwo with capability-based security.

use rusqlite::{Connection, ToSql};
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
        .ok_or("sqlite: capability missing owner_id")?;
    if owner_id != current_entity_id {
        return Err("sqlite: capability does not belong to current entity".to_string());
    }

    // Check path matches allowed path
    let allowed_path = capability["params"]["path"]
        .as_str()
        .ok_or("sqlite: capability missing path parameter")?;

    // Canonicalize paths for comparison
    let resolved_target = PathBuf::from(requested_path)
        .canonicalize()
        .map_err(|_| format!("sqlite: database path does not exist: {}", requested_path))?;
    let resolved_allowed = PathBuf::from(allowed_path)
        .canonicalize()
        .map_err(|_| format!("sqlite: invalid allowed path: {}", allowed_path))?;

    if resolved_target != resolved_allowed {
        return Err(format!(
            "sqlite: path '{}' not allowed by capability",
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
            .map_err(|e| format!("sqlite: failed to open database: {}", e))?;
        conns.insert(db_path.to_string(), conn);
    }

    // SAFETY: We hold the mutex lock, so we have exclusive access
    // The connection is stored in a static HashMap and won't be dropped
    let conn_ptr = conns.get_mut(db_path).unwrap() as *mut Connection;
    unsafe { Ok(&mut *conn_ptr) }
}

/// Execute a SQL query and return results as JSON
pub fn sqlite_query(
    capability: &serde_json::Value,
    entity_id: i64,
    db_path: &str,
    query: &str,
    params: &[serde_json::Value],
) -> Result<Vec<serde_json::Value>, String> {
    validate_capability(capability, entity_id, db_path)?;

    let conn = get_connection(db_path)?;

    // Convert JSON params to rusqlite params
    let sql_params: Vec<Box<dyn ToSql>> = params
        .iter()
        .map(|p| -> Box<dyn ToSql> {
            match p {
                serde_json::Value::Null => Box::new(rusqlite::types::Null),
                serde_json::Value::Bool(b) => Box::new(*b),
                serde_json::Value::Number(n) => {
                    if let Some(i) = n.as_i64() {
                        Box::new(i)
                    } else if let Some(f) = n.as_f64() {
                        Box::new(f)
                    } else {
                        Box::new(rusqlite::types::Null)
                    }
                }
                serde_json::Value::String(s) => Box::new(s.clone()),
                _ => Box::new(rusqlite::types::Null),
            }
        })
        .collect();

    let param_refs: Vec<&dyn ToSql> = sql_params.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn
        .prepare(query)
        .map_err(|e| format!("sqlite: failed to prepare query: {}", e))?;

    let column_count = stmt.column_count();
    let column_names: Vec<String> = (0..column_count)
        .map(|i| stmt.column_name(i).unwrap_or("").to_string())
        .collect();

    let rows = stmt
        .query_map(param_refs.as_slice(), |row| {
            let mut obj = serde_json::Map::new();
            for (i, name) in column_names.iter().enumerate() {
                let value: serde_json::Value = match row.get_ref(i).unwrap() {
                    rusqlite::types::ValueRef::Null => serde_json::Value::Null,
                    rusqlite::types::ValueRef::Integer(n) => serde_json::json!(n),
                    rusqlite::types::ValueRef::Real(f) => serde_json::json!(f),
                    rusqlite::types::ValueRef::Text(s) => {
                        serde_json::json!(String::from_utf8_lossy(s))
                    }
                    rusqlite::types::ValueRef::Blob(b) => {
                        // Return blob as base64 string
                        serde_json::json!(base64_encode(b))
                    }
                };
                obj.insert(name.clone(), value);
            }
            Ok(serde_json::Value::Object(obj))
        })
        .map_err(|e| format!("sqlite: query failed: {}", e))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("sqlite: failed to collect rows: {}", e))
}

/// Execute a SQL statement (INSERT, UPDATE, DELETE) and return rows affected
pub fn sqlite_execute(
    capability: &serde_json::Value,
    entity_id: i64,
    db_path: &str,
    query: &str,
    params: &[serde_json::Value],
) -> Result<i64, String> {
    validate_capability(capability, entity_id, db_path)?;

    let conn = get_connection(db_path)?;

    // Convert JSON params to rusqlite params
    let sql_params: Vec<Box<dyn ToSql>> = params
        .iter()
        .map(|p| -> Box<dyn ToSql> {
            match p {
                serde_json::Value::Null => Box::new(rusqlite::types::Null),
                serde_json::Value::Bool(b) => Box::new(*b),
                serde_json::Value::Number(n) => {
                    if let Some(i) = n.as_i64() {
                        Box::new(i)
                    } else if let Some(f) = n.as_f64() {
                        Box::new(f)
                    } else {
                        Box::new(rusqlite::types::Null)
                    }
                }
                serde_json::Value::String(s) => Box::new(s.clone()),
                _ => Box::new(rusqlite::types::Null),
            }
        })
        .collect();

    let param_refs: Vec<&dyn ToSql> = sql_params.iter().map(|p| p.as_ref()).collect();

    let rows_affected = conn
        .execute(query, param_refs.as_slice())
        .map_err(|e| format!("sqlite: execute failed: {}", e))?;

    Ok(rows_affected as i64)
}

fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();

    for chunk in data.chunks(3) {
        let mut buf = [0u8; 3];
        for (i, &byte) in chunk.iter().enumerate() {
            buf[i] = byte;
        }

        result.push(CHARS[(buf[0] >> 2) as usize] as char);
        result.push(CHARS[(((buf[0] & 0x03) << 4) | (buf[1] >> 4)) as usize] as char);
        result.push(if chunk.len() > 1 {
            CHARS[(((buf[1] & 0x0f) << 2) | (buf[2] >> 6)) as usize] as char
        } else {
            '='
        });
        result.push(if chunk.len() > 2 {
            CHARS[(buf[2] & 0x3f) as usize] as char
        } else {
            '='
        });
    }

    result
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

    // Normalize index to absolute
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
        // Key at -2, value at -1
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

        // Also collect as map
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

        lua_pop(L, 1); // Pop value, keep key for next iteration
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

/// Lua wrapper for sqlite_query
#[unsafe(no_mangle)]
unsafe extern "C" fn sqlite_query_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    let nargs = lua_gettop(L);
    if nargs != 4 {
        return lua_push_error(
            L,
            "sqlite.query requires 4 arguments (capability, db_path, query, params)",
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
        return lua_push_error(L, "sqlite.query: db_path must be a string");
    }
    let db_path_slice = std::slice::from_raw_parts(db_path_ptr as *const u8, len);
    let db_path = match std::str::from_utf8(db_path_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "sqlite.query: db_path contains invalid UTF-8"),
    };

    // Get query (string)
    let query_ptr = lua_tolstring(L, 3, &mut len);
    if query_ptr.is_null() {
        return lua_push_error(L, "sqlite.query: query must be a string");
    }
    let query_slice = std::slice::from_raw_parts(query_ptr as *const u8, len);
    let query = match std::str::from_utf8(query_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "sqlite.query: query contains invalid UTF-8"),
    };

    // Get params (array)
    let params_json = match lua_value_to_json(L, 4) {
        Ok(json) => json,
        Err(e) => return lua_push_error(L, &format!("Invalid params: {}", e)),
    };

    let params: Vec<serde_json::Value> = match params_json.as_array() {
        Some(arr) => arr.clone(),
        None => Vec::new(),
    };

    // Get __viwo_this_id from globals
    lua_getglobal(L, b"__viwo_this_id\0".as_ptr() as *const c_char);
    let this_id = lua_tointeger(L, -1);
    lua_pop(L, 1);

    // Execute query
    let result = sqlite_query(&cap_json, this_id, db_path, query, &params);

    match result {
        Ok(rows) => {
            // Convert Vec<serde_json::Value> to Lua array
            let rows_json = serde_json::Value::Array(rows);
            if let Err(e) = json_to_lua(L, &rows_json) {
                return lua_push_error(L, &format!("Failed to convert result: {}", e));
            }
            1
        }
        Err(e) => lua_push_error(L, &e),
    }
}

/// Lua wrapper for sqlite_execute
#[unsafe(no_mangle)]
unsafe extern "C" fn sqlite_execute_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    let nargs = lua_gettop(L);
    if nargs != 4 {
        return lua_push_error(
            L,
            "sqlite.execute requires 4 arguments (capability, db_path, query, params)",
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
        return lua_push_error(L, "sqlite.execute: db_path must be a string");
    }
    let db_path_slice = std::slice::from_raw_parts(db_path_ptr as *const u8, len);
    let db_path = match std::str::from_utf8(db_path_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "sqlite.execute: db_path contains invalid UTF-8"),
    };

    // Get query (string)
    let query_ptr = lua_tolstring(L, 3, &mut len);
    if query_ptr.is_null() {
        return lua_push_error(L, "sqlite.execute: query must be a string");
    }
    let query_slice = std::slice::from_raw_parts(query_ptr as *const u8, len);
    let query = match std::str::from_utf8(query_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "sqlite.execute: query contains invalid UTF-8"),
    };

    // Get params (array)
    let params_json = match lua_value_to_json(L, 4) {
        Ok(json) => json,
        Err(e) => return lua_push_error(L, &format!("Invalid params: {}", e)),
    };

    let params: Vec<serde_json::Value> = match params_json.as_array() {
        Some(arr) => arr.clone(),
        None => Vec::new(),
    };

    // Get __viwo_this_id from globals
    lua_getglobal(L, b"__viwo_this_id\0".as_ptr() as *const c_char);
    let this_id = lua_tointeger(L, -1);
    lua_pop(L, 1);

    // Execute statement
    let result = sqlite_execute(&cap_json, this_id, db_path, query, &params);

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
        let names = ["sqlite.query", "sqlite.execute"];
        let funcs: [PluginLuaFunction; 2] = [sqlite_query_lua, sqlite_execute_lua];

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
    // Close all connections
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
    fn test_sqlite_query() {
        let temp_db = NamedTempFile::new().unwrap();
        let db_path = temp_db.path().to_str().unwrap();
        let cap = create_test_capability(1, db_path);

        // Create table
        sqlite_execute(
            &cap,
            1,
            db_path,
            "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
            &[],
        )
        .unwrap();

        // Insert data
        sqlite_execute(
            &cap,
            1,
            db_path,
            "INSERT INTO users (name) VALUES (?)",
            &[serde_json::json!("Alice")],
        )
        .unwrap();

        // Query data
        let results = sqlite_query(&cap, 1, db_path, "SELECT * FROM users", &[]).unwrap();

        assert_eq!(results.len(), 1);
        assert_eq!(results[0]["name"], "Alice");
        assert_eq!(results[0]["id"], 1);
    }

    #[test]
    fn test_sqlite_execute() {
        let temp_db = NamedTempFile::new().unwrap();
        let db_path = temp_db.path().to_str().unwrap();
        let cap = create_test_capability(1, db_path);

        sqlite_execute(&cap, 1, db_path, "CREATE TABLE test (id INTEGER)", &[]).unwrap();

        let rows = sqlite_execute(
            &cap,
            1,
            db_path,
            "INSERT INTO test VALUES (1), (2), (3)",
            &[],
        )
        .unwrap();

        assert_eq!(rows, 3);
    }

    #[test]
    fn test_sqlite_capability_validation() {
        let temp_db1 = NamedTempFile::new().unwrap();
        let temp_db2 = NamedTempFile::new().unwrap();

        let db1_path = temp_db1.path().to_str().unwrap();
        let db2_path = temp_db2.path().to_str().unwrap();

        let cap = create_test_capability(1, db1_path);

        // Try to access different database
        let result = sqlite_query(&cap, 1, db2_path, "SELECT 1", &[]);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not allowed"));

        // Try with wrong entity ID
        let result = sqlite_query(&cap, 2, db1_path, "SELECT 1", &[]);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("does not belong"));
    }

    #[test]
    fn test_sqlite_params() {
        let temp_db = NamedTempFile::new().unwrap();
        let db_path = temp_db.path().to_str().unwrap();
        let cap = create_test_capability(1, db_path);

        sqlite_execute(
            &cap,
            1,
            db_path,
            "CREATE TABLE test (id INTEGER, name TEXT, value REAL)",
            &[],
        )
        .unwrap();

        sqlite_execute(
            &cap,
            1,
            db_path,
            "INSERT INTO test VALUES (?, ?, ?)",
            &[
                serde_json::json!(42),
                serde_json::json!("test"),
                serde_json::json!(3.14),
            ],
        )
        .unwrap();

        let results = sqlite_query(
            &cap,
            1,
            db_path,
            "SELECT * FROM test WHERE id = ?",
            &[serde_json::json!(42)],
        )
        .unwrap();

        assert_eq!(results.len(), 1);
        assert_eq!(results[0]["id"], 42);
        assert_eq!(results[0]["name"], "test");
    }
}
