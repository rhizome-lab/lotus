//! Filesystem plugin for Viwo with capability-based security.
//!
//! This plugin provides file system access through Lua functions that validate capabilities.

use std::ffi::CString;
use std::fs;
use std::os::raw::{c_char, c_int};
use std::path::PathBuf;

/// Type for plugin functions - standard Lua C function signature
type PluginLuaFunction = unsafe extern "C" fn(
    lua_state: *mut mlua::ffi::lua_State,
) -> std::os::raw::c_int;

/// Type for the registration callback passed from the runtime
type RegisterFunction = unsafe extern "C" fn(
    name: *const c_char,
    func: PluginLuaFunction,
) -> std::os::raw::c_int;

/// Plugin initialization - register all fs functions
#[unsafe(no_mangle)]
pub unsafe extern "C" fn plugin_init(register_fn: RegisterFunction) -> c_int {
    unsafe {
        let names = [
            "fs.read",
            "fs.write",
            "fs.list",
            "fs.stat",
            "fs.exists",
            "fs.mkdir",
            "fs.remove",
        ];
        let funcs: [PluginLuaFunction; 7] = [
            fs_read_lua,
            fs_write_lua,
            fs_list_lua,
            fs_stat_lua,
            fs_exists_lua,
            fs_mkdir_lua,
            fs_remove_lua,
        ];

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

/// Plugin cleanup (optional)
#[unsafe(no_mangle)]
pub unsafe extern "C" fn plugin_cleanup() {
    // No cleanup needed
}

// Lua C API helper functions for type conversion

/// Convert a Lua value at the given stack index to JSON
unsafe fn lua_value_to_json(
    L: *mut mlua::ffi::lua_State,
    index: c_int,
) -> Result<serde_json::Value, String> {
    use mlua::ffi::*;

    let lua_type = lua_type(L, index);
    match lua_type {
        LUA_TNIL => Ok(serde_json::Value::Null),
        LUA_TBOOLEAN => Ok(serde_json::Value::Bool(lua_toboolean(L, index) != 0)),
        LUA_TNUMBER => Ok(serde_json::json!(lua_tonumber(L, index))),
        LUA_TSTRING => {
            let mut len = 0;
            let ptr = lua_tolstring(L, index, &mut len);
            if ptr.is_null() {
                return Err("Failed to get string".to_string());
            }
            let slice = std::slice::from_raw_parts(ptr as *const u8, len);
            let s = std::str::from_utf8(slice)
                .map_err(|_| "Invalid UTF-8 in string")?;
            Ok(serde_json::Value::String(s.to_string()))
        }
        LUA_TTABLE => lua_table_to_json(L, index),
        _ => Err(format!("Unsupported Lua type {} for JSON conversion", lua_type)),
    }
}

/// Convert a Lua table at the given stack index to a JSON object
unsafe fn lua_table_to_json(
    L: *mut mlua::ffi::lua_State,
    index: c_int,
) -> Result<serde_json::Value, String> {
    use mlua::ffi::*;

    if lua_type(L, index) != LUA_TTABLE {
        return Err("Expected table".to_string());
    }

    // Normalize index to absolute (in case it's relative like -1)
    let abs_index = if index < 0 && index > LUA_REGISTRYINDEX {
        lua_gettop(L) + index + 1
    } else {
        index
    };

    let mut map = serde_json::Map::new();

    // Push nil as first key
    lua_pushnil(L);

    // lua_next pops a key and pushes key-value pair
    while lua_next(L, abs_index) != 0 {
        // Stack: ... table ... key value

        // Get key (must be string for JSON object)
        let mut len = 0;
        let key_ptr = lua_tolstring(L, -2, &mut len);
        if !key_ptr.is_null() {
            let key_slice = std::slice::from_raw_parts(key_ptr as *const u8, len);
            if let Ok(key_str) = std::str::from_utf8(key_slice) {
                // Get value and convert to JSON
                if let Ok(value) = lua_value_to_json(L, -1) {
                    map.insert(key_str.to_string(), value);
                }
            }
        }

        // Pop value, keep key for next iteration
        lua_pop(L, 1);
    }

    Ok(serde_json::Value::Object(map))
}

/// Push an error message and return lua_error()
unsafe fn lua_push_error(L: *mut mlua::ffi::lua_State, msg: &str) -> c_int {
    let c_msg = CString::new(msg).unwrap_or_else(|_| CString::new("Error").unwrap());
    mlua::ffi::lua_pushstring(L, c_msg.as_ptr());
    mlua::ffi::lua_error(L)
}

// Lua function implementations - these are called directly from Lua with the Lua state

#[unsafe(no_mangle)]
unsafe extern "C" fn fs_read_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    // Check argument count
    let nargs = lua_gettop(L);
    if nargs != 2 {
        return lua_push_error(L, "fs.read requires 2 arguments (capability, path)");
    }

    // Get capability from argument 1 (table)
    let cap_json = match lua_value_to_json(L, 1) {
        Ok(json) => json,
        Err(e) => return lua_push_error(L, &format!("Invalid capability: {}", e)),
    };

    // Get path from argument 2 (string)
    let mut len = 0;
    let path_ptr = lua_tolstring(L, 2, &mut len);
    if path_ptr.is_null() {
        return lua_push_error(L, "fs.read: path must be a string");
    }
    let path_slice = std::slice::from_raw_parts(path_ptr as *const u8, len);
    let path = match std::str::from_utf8(path_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "fs.read: path contains invalid UTF-8"),
    };

    // Get __viwo_this_id from globals
    lua_getglobal(L, b"__viwo_this_id\0".as_ptr() as *const c_char);
    let this_id = lua_tointeger(L, -1);
    lua_pop(L, 1);

    // Perform file read with capability validation
    match fs_read(&cap_json, this_id, path) {
        Ok(content) => {
            let c_content = match CString::new(content) {
                Ok(s) => s,
                Err(_) => return lua_push_error(L, "File content contains null bytes"),
            };
            lua_pushstring(L, c_content.as_ptr());
            1 // Return 1 value
        }
        Err(e) => lua_push_error(L, &e),
    }
}

#[unsafe(no_mangle)]
unsafe extern "C" fn fs_write_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    // Check argument count
    let nargs = lua_gettop(L);
    if nargs != 3 {
        return lua_push_error(L, "fs.write requires 3 arguments (capability, path, content)");
    }

    // Get capability from argument 1 (table)
    let cap_json = match lua_value_to_json(L, 1) {
        Ok(json) => json,
        Err(e) => return lua_push_error(L, &format!("Invalid capability: {}", e)),
    };

    // Get path from argument 2 (string)
    let mut len = 0;
    let path_ptr = lua_tolstring(L, 2, &mut len);
    if path_ptr.is_null() {
        return lua_push_error(L, "fs.write: path must be a string");
    }
    let path_slice = std::slice::from_raw_parts(path_ptr as *const u8, len);
    let path = match std::str::from_utf8(path_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "fs.write: path contains invalid UTF-8"),
    };

    // Get content from argument 3 (string)
    let content_ptr = lua_tolstring(L, 3, &mut len);
    if content_ptr.is_null() {
        return lua_push_error(L, "fs.write: content must be a string");
    }
    let content_slice = std::slice::from_raw_parts(content_ptr as *const u8, len);
    let content = match std::str::from_utf8(content_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "fs.write: content contains invalid UTF-8"),
    };

    // Get __viwo_this_id from globals
    lua_getglobal(L, b"__viwo_this_id\0".as_ptr() as *const c_char);
    let this_id = lua_tointeger(L, -1);
    lua_pop(L, 1);

    // Perform file write with capability validation
    match fs_write(&cap_json, this_id, path, content) {
        Ok(()) => 0, // No return values
        Err(e) => lua_push_error(L, &e),
    }
}

#[unsafe(no_mangle)]
unsafe extern "C" fn fs_list_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    // Check argument count
    let nargs = lua_gettop(L);
    if nargs != 2 {
        return lua_push_error(L, "fs.list requires 2 arguments (capability, path)");
    }

    // Get capability from argument 1 (table)
    let cap_json = match lua_value_to_json(L, 1) {
        Ok(json) => json,
        Err(e) => return lua_push_error(L, &format!("Invalid capability: {}", e)),
    };

    // Get path from argument 2 (string)
    let mut len = 0;
    let path_ptr = lua_tolstring(L, 2, &mut len);
    if path_ptr.is_null() {
        return lua_push_error(L, "fs.list: path must be a string");
    }
    let path_slice = std::slice::from_raw_parts(path_ptr as *const u8, len);
    let path = match std::str::from_utf8(path_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "fs.list: path contains invalid UTF-8"),
    };

    // Get __viwo_this_id from globals
    lua_getglobal(L, b"__viwo_this_id\0".as_ptr() as *const c_char);
    let this_id = lua_tointeger(L, -1);
    lua_pop(L, 1);

    // Perform directory listing
    let files = match fs_list(&cap_json, this_id, path) {
        Ok(f) => f,
        Err(e) => return lua_push_error(L, &e),
    };

    // Create result table (array of file info tables)
    lua_createtable(L, files.len() as c_int, 0);

    for (i, file_info) in files.iter().enumerate() {
        // Create table for this file
        lua_createtable(L, 0, 4);

        // Set name field
        if let Some(name) = file_info.get("name").and_then(|v| v.as_str()) {
            let c_name = match CString::new(name) {
                Ok(s) => s,
                Err(_) => continue,
            };
            lua_pushstring(L, c_name.as_ptr());
            lua_setfield(L, -2, b"name\0".as_ptr() as *const c_char);
        }

        // Set is_dir field
        if let Some(is_dir) = file_info.get("is_dir").and_then(|v| v.as_bool()) {
            lua_pushboolean(L, is_dir as c_int);
            lua_setfield(L, -2, b"is_dir\0".as_ptr() as *const c_char);
        }

        // Set is_file field
        if let Some(is_file) = file_info.get("is_file").and_then(|v| v.as_bool()) {
            lua_pushboolean(L, is_file as c_int);
            lua_setfield(L, -2, b"is_file\0".as_ptr() as *const c_char);
        }

        // Set size field
        if let Some(size) = file_info.get("size").and_then(|v| v.as_u64()) {
            lua_pushinteger(L, size as i64);
            lua_setfield(L, -2, b"size\0".as_ptr() as *const c_char);
        }

        // Add to array at index i+1 (Lua arrays are 1-indexed)
        lua_rawseti(L, -2, (i + 1) as i64);
    }

    1 // Return 1 value (the table)
}

#[unsafe(no_mangle)]
unsafe extern "C" fn fs_stat_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    // Check argument count
    let nargs = lua_gettop(L);
    if nargs != 2 {
        return lua_push_error(L, "fs.stat requires 2 arguments (capability, path)");
    }

    // Get capability from argument 1 (table)
    let cap_json = match lua_value_to_json(L, 1) {
        Ok(json) => json,
        Err(e) => return lua_push_error(L, &format!("Invalid capability: {}", e)),
    };

    // Get path from argument 2 (string)
    let mut len = 0;
    let path_ptr = lua_tolstring(L, 2, &mut len);
    if path_ptr.is_null() {
        return lua_push_error(L, "fs.stat: path must be a string");
    }
    let path_slice = std::slice::from_raw_parts(path_ptr as *const u8, len);
    let path = match std::str::from_utf8(path_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "fs.stat: path contains invalid UTF-8"),
    };

    // Get __viwo_this_id from globals
    lua_getglobal(L, b"__viwo_this_id\0".as_ptr() as *const c_char);
    let this_id = lua_tointeger(L, -1);
    lua_pop(L, 1);

    // Get file stats
    let stats = match fs_stat(&cap_json, this_id, path) {
        Ok(s) => s,
        Err(e) => return lua_push_error(L, &e),
    };

    // Create result table
    lua_createtable(L, 0, 4);

    // Set is_dir field
    if let Some(is_dir) = stats.get("is_dir").and_then(|v| v.as_bool()) {
        lua_pushboolean(L, is_dir as c_int);
        lua_setfield(L, -2, b"is_dir\0".as_ptr() as *const c_char);
    }

    // Set is_file field
    if let Some(is_file) = stats.get("is_file").and_then(|v| v.as_bool()) {
        lua_pushboolean(L, is_file as c_int);
        lua_setfield(L, -2, b"is_file\0".as_ptr() as *const c_char);
    }

    // Set size field
    if let Some(size) = stats.get("size").and_then(|v| v.as_u64()) {
        lua_pushinteger(L, size as i64);
        lua_setfield(L, -2, b"size\0".as_ptr() as *const c_char);
    }

    // Set readonly field
    if let Some(readonly) = stats.get("readonly").and_then(|v| v.as_bool()) {
        lua_pushboolean(L, readonly as c_int);
        lua_setfield(L, -2, b"readonly\0".as_ptr() as *const c_char);
    }

    1 // Return 1 value (the table)
}

#[unsafe(no_mangle)]
unsafe extern "C" fn fs_exists_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    // Check argument count
    let nargs = lua_gettop(L);
    if nargs != 2 {
        return lua_push_error(L, "fs.exists requires 2 arguments (capability, path)");
    }

    // Get capability from argument 1 (table)
    let cap_json = match lua_value_to_json(L, 1) {
        Ok(json) => json,
        Err(e) => return lua_push_error(L, &format!("Invalid capability: {}", e)),
    };

    // Get path from argument 2 (string)
    let mut len = 0;
    let path_ptr = lua_tolstring(L, 2, &mut len);
    if path_ptr.is_null() {
        return lua_push_error(L, "fs.exists: path must be a string");
    }
    let path_slice = std::slice::from_raw_parts(path_ptr as *const u8, len);
    let path = match std::str::from_utf8(path_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "fs.exists: path contains invalid UTF-8"),
    };

    // Get __viwo_this_id from globals
    lua_getglobal(L, b"__viwo_this_id\0".as_ptr() as *const c_char);
    let this_id = lua_tointeger(L, -1);
    lua_pop(L, 1);

    // Check if file exists
    match fs_exists(&cap_json, this_id, path) {
        Ok(exists) => {
            lua_pushboolean(L, exists as c_int);
            1 // Return 1 value
        }
        Err(e) => lua_push_error(L, &e),
    }
}

#[unsafe(no_mangle)]
unsafe extern "C" fn fs_mkdir_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    // Check argument count
    let nargs = lua_gettop(L);
    if nargs != 2 {
        return lua_push_error(L, "fs.mkdir requires 2 arguments (capability, path)");
    }

    // Get capability from argument 1 (table)
    let cap_json = match lua_value_to_json(L, 1) {
        Ok(json) => json,
        Err(e) => return lua_push_error(L, &format!("Invalid capability: {}", e)),
    };

    // Get path from argument 2 (string)
    let mut len = 0;
    let path_ptr = lua_tolstring(L, 2, &mut len);
    if path_ptr.is_null() {
        return lua_push_error(L, "fs.mkdir: path must be a string");
    }
    let path_slice = std::slice::from_raw_parts(path_ptr as *const u8, len);
    let path = match std::str::from_utf8(path_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "fs.mkdir: path contains invalid UTF-8"),
    };

    // Get __viwo_this_id from globals
    lua_getglobal(L, b"__viwo_this_id\0".as_ptr() as *const c_char);
    let this_id = lua_tointeger(L, -1);
    lua_pop(L, 1);

    // Create directory
    match fs_mkdir(&cap_json, this_id, path) {
        Ok(()) => 0, // No return values
        Err(e) => lua_push_error(L, &e),
    }
}

#[unsafe(no_mangle)]
unsafe extern "C" fn fs_remove_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    // Check argument count
    let nargs = lua_gettop(L);
    if nargs != 2 {
        return lua_push_error(L, "fs.remove requires 2 arguments (capability, path)");
    }

    // Get capability from argument 1 (table)
    let cap_json = match lua_value_to_json(L, 1) {
        Ok(json) => json,
        Err(e) => return lua_push_error(L, &format!("Invalid capability: {}", e)),
    };

    // Get path from argument 2 (string)
    let mut len = 0;
    let path_ptr = lua_tolstring(L, 2, &mut len);
    if path_ptr.is_null() {
        return lua_push_error(L, "fs.remove: path must be a string");
    }
    let path_slice = std::slice::from_raw_parts(path_ptr as *const u8, len);
    let path = match std::str::from_utf8(path_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "fs.remove: path contains invalid UTF-8"),
    };

    // Get __viwo_this_id from globals
    lua_getglobal(L, b"__viwo_this_id\0".as_ptr() as *const c_char);
    let this_id = lua_tointeger(L, -1);
    lua_pop(L, 1);

    // Remove file or directory
    match fs_remove(&cap_json, this_id, path) {
        Ok(()) => 0, // No return values
        Err(e) => lua_push_error(L, &e),
    }
}

// Core filesystem functions with capability validation

fn fs_read(
    capability: &serde_json::Value,
    entity_id: i64,
    path: &str,
) -> Result<String, String> {
    validate_fs_capability(capability, entity_id, path)?;

    let full_path = get_sandboxed_path(capability, path)?;
    fs::read_to_string(&full_path)
        .map_err(|e| format!("Failed to read {}: {}", path, e))
}

fn fs_write(
    capability: &serde_json::Value,
    entity_id: i64,
    path: &str,
    content: &str,
) -> Result<(), String> {
    validate_fs_capability(capability, entity_id, path)?;

    let full_path = get_sandboxed_path(capability, path)?;

    // Create parent directory if it doesn't exist
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    fs::write(&full_path, content)
        .map_err(|e| format!("Failed to write {}: {}", path, e))
}

fn fs_list(
    capability: &serde_json::Value,
    entity_id: i64,
    path: &str,
) -> Result<Vec<serde_json::Value>, String> {
    validate_fs_capability(capability, entity_id, path)?;

    let full_path = get_sandboxed_path(capability, path)?;

    let entries = fs::read_dir(&full_path)
        .map_err(|e| format!("Failed to list directory {}: {}", path, e))?;

    let mut files = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let metadata = entry.metadata()
            .map_err(|e| format!("Failed to read metadata: {}", e))?;

        files.push(serde_json::json!({
            "name": entry.file_name().to_string_lossy().to_string(),
            "is_dir": metadata.is_dir(),
            "is_file": metadata.is_file(),
            "size": metadata.len(),
        }));
    }

    Ok(files)
}

fn fs_stat(
    capability: &serde_json::Value,
    entity_id: i64,
    path: &str,
) -> Result<serde_json::Value, String> {
    validate_fs_capability(capability, entity_id, path)?;

    let full_path = get_sandboxed_path(capability, path)?;
    let metadata = fs::metadata(&full_path)
        .map_err(|e| format!("Failed to stat {}: {}", path, e))?;

    Ok(serde_json::json!({
        "is_dir": metadata.is_dir(),
        "is_file": metadata.is_file(),
        "size": metadata.len(),
        "readonly": metadata.permissions().readonly(),
    }))
}

fn fs_exists(
    capability: &serde_json::Value,
    entity_id: i64,
    path: &str,
) -> Result<bool, String> {
    validate_fs_capability(capability, entity_id, path)?;

    let full_path = get_sandboxed_path(capability, path)?;
    Ok(full_path.exists())
}

fn fs_mkdir(
    capability: &serde_json::Value,
    entity_id: i64,
    path: &str,
) -> Result<(), String> {
    validate_fs_capability(capability, entity_id, path)?;

    let full_path = get_sandboxed_path(capability, path)?;
    fs::create_dir_all(&full_path)
        .map_err(|e| format!("Failed to create directory {}: {}", path, e))
}

fn fs_remove(
    capability: &serde_json::Value,
    entity_id: i64,
    path: &str,
) -> Result<(), String> {
    validate_fs_capability(capability, entity_id, path)?;

    let full_path = get_sandboxed_path(capability, path)?;

    if full_path.is_dir() {
        fs::remove_dir_all(&full_path)
            .map_err(|e| format!("Failed to remove directory {}: {}", path, e))
    } else {
        fs::remove_file(&full_path)
            .map_err(|e| format!("Failed to remove file {}: {}", path, e))
    }
}

// Capability validation helpers

fn validate_fs_capability(
    capability: &serde_json::Value,
    entity_id: i64,
    _path: &str,
) -> Result<(), String> {
    // Check that the capability owner matches the entity
    let owner_id = capability["owner_id"]
        .as_i64()
        .ok_or("Capability missing owner_id")?;

    if owner_id != entity_id {
        return Err(format!(
            "Capability owner mismatch: expected {}, got {}",
            entity_id, owner_id
        ));
    }

    // Additional validation could check:
    // - Capability expiration
    // - Path restrictions
    // - Operation permissions (read/write/execute)

    Ok(())
}

fn get_sandboxed_path(
    capability: &serde_json::Value,
    relative_path: &str,
) -> Result<PathBuf, String> {
    // Get the root path from the capability params
    let root = capability["params"]["path"]
        .as_str()
        .ok_or("Capability missing path parameter")?;

    let root_path = PathBuf::from(root);
    let full_path = root_path.join(relative_path);

    // Ensure the path doesn't escape the sandbox via ../ or symlinks
    let canonical_root = root_path
        .canonicalize()
        .map_err(|e| format!("Invalid root path: {}", e))?;

    // For new files that don't exist yet, we can't canonicalize them
    // So we check if the parent directory is within the sandbox
    if full_path.exists() {
        let canonical_full = full_path
            .canonicalize()
            .map_err(|e| format!("Invalid path: {}", e))?;

        if !canonical_full.starts_with(&canonical_root) {
            return Err("Path escapes sandbox".to_string());
        }

        Ok(canonical_full)
    } else {
        // For non-existent paths, validate the parent
        if let Some(parent) = full_path.parent() {
            if parent.exists() {
                let canonical_parent = parent
                    .canonicalize()
                    .map_err(|e| format!("Invalid parent path: {}", e))?;

                if !canonical_parent.starts_with(&canonical_root) {
                    return Err("Path escapes sandbox".to_string());
                }
            }
        }

        Ok(full_path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn create_test_capability(root: &str) -> serde_json::Value {
        json!({
            "owner_id": 1,
            "params": {
                "path": root
            }
        })
    }

    #[test]
    fn test_fs_read_write() {
        let temp_dir = tempfile::tempdir().unwrap();
        let root = temp_dir.path().to_str().unwrap();
        let cap = create_test_capability(root);

        // Write a file
        fs_write(&cap, 1, "test.txt", "Hello, World!").unwrap();

        // Read it back
        let content = fs_read(&cap, 1, "test.txt").unwrap();
        assert_eq!(content, "Hello, World!");
    }

    #[test]
    fn test_sandbox_escape_prevention() {
        let temp_dir = tempfile::tempdir().unwrap();
        let root = temp_dir.path().to_str().unwrap();
        let cap = create_test_capability(root);

        // Try to escape sandbox with ../
        let result = fs_read(&cap, 1, "../../../etc/passwd");
        assert!(result.is_err());
    }

    #[test]
    fn test_capability_validation() {
        let temp_dir = tempfile::tempdir().unwrap();
        let root = temp_dir.path().to_str().unwrap();
        let cap = create_test_capability(root);

        // Wrong entity ID
        let result = fs_read(&cap, 999, "test.txt");
        assert!(result.is_err());
    }
}
