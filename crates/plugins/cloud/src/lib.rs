//! Cloud storage plugin for Lotus using OpenDAL.
//!
//! Provides a unified API for cloud storage backends:
//! S3, GCS, Azure Blob, Dropbox, Google Drive, OneDrive, WebDAV, and local filesystem.

use std::ffi::CString;
use std::os::raw::{c_char, c_int};

use opendal::{BlockingOperator, Operator, services};

/// Type for plugin functions - standard Lua C function signature
type PluginLuaFunction =
    unsafe extern "C" fn(lua_state: *mut mlua::ffi::lua_State) -> std::os::raw::c_int;

/// Type for the registration callback passed from the runtime
type RegisterFunction =
    unsafe extern "C" fn(name: *const c_char, func: PluginLuaFunction) -> std::os::raw::c_int;

/// Plugin initialization - register all cloud functions
#[unsafe(no_mangle)]
pub unsafe extern "C" fn lotus_cloud_plugin_init(register_fn: RegisterFunction) -> c_int {
    unsafe {
        let names = [
            "cloud.read",
            "cloud.write",
            "cloud.list",
            "cloud.delete",
            "cloud.stat",
            "cloud.exists",
        ];
        let funcs: [PluginLuaFunction; 6] = [
            cloud_read_lua,
            cloud_write_lua,
            cloud_list_lua,
            cloud_delete_lua,
            cloud_stat_lua,
            cloud_exists_lua,
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

/// Plugin cleanup
#[unsafe(no_mangle)]
pub unsafe extern "C" fn lotus_cloud_plugin_cleanup() {
    // No cleanup needed
}

// ============================================================================
// Lua C API Helpers
// ============================================================================

/// Convert a Lua value at the given stack index to JSON
unsafe fn lua_value_to_json(
    l: *mut mlua::ffi::lua_State,
    index: c_int,
) -> Result<serde_json::Value, String> {
    use mlua::ffi::*;

    let lua_type = lua_type(l, index);
    match lua_type {
        LUA_TNIL => Ok(serde_json::Value::Null),
        LUA_TBOOLEAN => Ok(serde_json::Value::Bool(lua_toboolean(l, index) != 0)),
        LUA_TNUMBER => Ok(serde_json::json!(lua_tonumber(l, index))),
        LUA_TSTRING => {
            let mut len = 0;
            let ptr = lua_tolstring(l, index, &mut len);
            if ptr.is_null() {
                return Err("Failed to get string".to_string());
            }
            let slice = std::slice::from_raw_parts(ptr as *const u8, len);
            let s = std::str::from_utf8(slice).map_err(|_| "Invalid UTF-8 in string")?;
            Ok(serde_json::Value::String(s.to_string()))
        }
        LUA_TTABLE => lua_table_to_json(l, index),
        _ => Err(format!(
            "Unsupported Lua type {} for JSON conversion",
            lua_type
        )),
    }
}

/// Convert a Lua table at the given stack index to a JSON object
unsafe fn lua_table_to_json(
    l: *mut mlua::ffi::lua_State,
    index: c_int,
) -> Result<serde_json::Value, String> {
    use mlua::ffi::*;

    if lua_type(l, index) != LUA_TTABLE {
        return Err("Expected table".to_string());
    }

    let abs_index = if index < 0 && index > LUA_REGISTRYINDEX {
        lua_gettop(l) + index + 1
    } else {
        index
    };

    let mut map = serde_json::Map::new();
    lua_pushnil(l);

    while lua_next(l, abs_index) != 0 {
        let mut len = 0;
        let key_ptr = lua_tolstring(l, -2, &mut len);
        if !key_ptr.is_null() {
            let key_slice = std::slice::from_raw_parts(key_ptr as *const u8, len);
            if let Ok(key_str) = std::str::from_utf8(key_slice) {
                if let Ok(value) = lua_value_to_json(l, -1) {
                    map.insert(key_str.to_string(), value);
                }
            }
        }
        lua_pop(l, 1);
    }

    Ok(serde_json::Value::Object(map))
}

/// Push an error message and return lua_error()
unsafe fn lua_push_error(l: *mut mlua::ffi::lua_State, msg: &str) -> c_int {
    let c_msg = CString::new(msg).unwrap_or_else(|_| CString::new("Error").unwrap());
    mlua::ffi::lua_pushstring(l, c_msg.as_ptr());
    mlua::ffi::lua_error(l)
}

/// Get a string argument from the Lua stack
unsafe fn lua_get_string(l: *mut mlua::ffi::lua_State, index: c_int) -> Result<String, String> {
    use mlua::ffi::*;

    let mut len = 0;
    let ptr = lua_tolstring(l, index, &mut len);
    if ptr.is_null() {
        return Err("Expected string argument".to_string());
    }
    let slice = std::slice::from_raw_parts(ptr as *const u8, len);
    std::str::from_utf8(slice)
        .map(|s| s.to_string())
        .map_err(|_| "Invalid UTF-8".to_string())
}

// ============================================================================
// OpenDAL Backend Creation
// ============================================================================

/// Create a blocking operator from backend config
fn create_operator(config: &serde_json::Value) -> Result<BlockingOperator, String> {
    let backend_type = config["type"]
        .as_str()
        .ok_or("Backend config missing 'type' field")?;

    let op = match backend_type {
        "s3" => {
            let mut builder = services::S3::default();
            if let Some(bucket) = config["bucket"].as_str() {
                builder = builder.bucket(bucket);
            }
            if let Some(region) = config["region"].as_str() {
                builder = builder.region(region);
            }
            if let Some(endpoint) = config["endpoint"].as_str() {
                builder = builder.endpoint(endpoint);
            }
            if let Some(access_key) = config["access_key_id"].as_str() {
                builder = builder.access_key_id(access_key);
            }
            if let Some(secret_key) = config["secret_access_key"].as_str() {
                builder = builder.secret_access_key(secret_key);
            }
            if let Some(root) = config["root"].as_str() {
                builder = builder.root(root);
            }
            Operator::new(builder)
                .map_err(|e| format!("Failed to create S3 operator: {}", e))?
                .finish()
        }
        "gcs" => {
            let mut builder = services::Gcs::default();
            if let Some(bucket) = config["bucket"].as_str() {
                builder = builder.bucket(bucket);
            }
            if let Some(credential) = config["credential"].as_str() {
                builder = builder.credential(credential);
            }
            if let Some(root) = config["root"].as_str() {
                builder = builder.root(root);
            }
            Operator::new(builder)
                .map_err(|e| format!("Failed to create GCS operator: {}", e))?
                .finish()
        }
        "azblob" => {
            let mut builder = services::Azblob::default();
            if let Some(container) = config["container"].as_str() {
                builder = builder.container(container);
            }
            if let Some(account) = config["account_name"].as_str() {
                builder = builder.account_name(account);
            }
            if let Some(key) = config["account_key"].as_str() {
                builder = builder.account_key(key);
            }
            if let Some(root) = config["root"].as_str() {
                builder = builder.root(root);
            }
            Operator::new(builder)
                .map_err(|e| format!("Failed to create Azure Blob operator: {}", e))?
                .finish()
        }
        "dropbox" => {
            let mut builder = services::Dropbox::default();
            if let Some(token) = config["access_token"].as_str() {
                builder = builder.access_token(token);
            }
            if let Some(root) = config["root"].as_str() {
                builder = builder.root(root);
            }
            Operator::new(builder)
                .map_err(|e| format!("Failed to create Dropbox operator: {}", e))?
                .finish()
        }
        "gdrive" => {
            let mut builder = services::Gdrive::default();
            if let Some(token) = config["access_token"].as_str() {
                builder = builder.access_token(token);
            }
            if let Some(root) = config["root"].as_str() {
                builder = builder.root(root);
            }
            Operator::new(builder)
                .map_err(|e| format!("Failed to create Google Drive operator: {}", e))?
                .finish()
        }
        "onedrive" => {
            let mut builder = services::Onedrive::default();
            if let Some(token) = config["access_token"].as_str() {
                builder = builder.access_token(token);
            }
            if let Some(root) = config["root"].as_str() {
                builder = builder.root(root);
            }
            Operator::new(builder)
                .map_err(|e| format!("Failed to create OneDrive operator: {}", e))?
                .finish()
        }
        "webdav" => {
            let mut builder = services::Webdav::default();
            if let Some(endpoint) = config["endpoint"].as_str() {
                builder = builder.endpoint(endpoint);
            }
            if let Some(username) = config["username"].as_str() {
                builder = builder.username(username);
            }
            if let Some(password) = config["password"].as_str() {
                builder = builder.password(password);
            }
            if let Some(root) = config["root"].as_str() {
                builder = builder.root(root);
            }
            Operator::new(builder)
                .map_err(|e| format!("Failed to create WebDAV operator: {}", e))?
                .finish()
        }
        "fs" => {
            let mut builder = services::Fs::default();
            if let Some(root) = config["root"].as_str() {
                builder = builder.root(root);
            }
            Operator::new(builder)
                .map_err(|e| format!("Failed to create filesystem operator: {}", e))?
                .finish()
        }
        _ => return Err(format!("Unknown backend type: {}", backend_type)),
    };

    Ok(op.blocking())
}

// ============================================================================
// Capability Validation
// ============================================================================

fn validate_cloud_capability(capability: &serde_json::Value, entity_id: i64) -> Result<(), String> {
    let owner_id = capability["owner_id"]
        .as_i64()
        .ok_or("Capability missing owner_id")?;

    if owner_id != entity_id {
        return Err(format!(
            "Capability owner mismatch: expected {}, got {}",
            entity_id, owner_id
        ));
    }

    // Check capability type
    let cap_type = capability["type"].as_str().unwrap_or("");
    if !cap_type.starts_with("cloud.") && cap_type != "cloud" {
        return Err(format!("Invalid capability type for cloud: {}", cap_type));
    }

    Ok(())
}

// ============================================================================
// Core Cloud Functions
// ============================================================================

fn cloud_read(
    capability: &serde_json::Value,
    entity_id: i64,
    config: &serde_json::Value,
    path: &str,
) -> Result<Vec<u8>, String> {
    validate_cloud_capability(capability, entity_id)?;
    let op = create_operator(config)?;
    op.read(path)
        .map(|buf| buf.to_vec())
        .map_err(|e| format!("Failed to read {}: {}", path, e))
}

fn cloud_write(
    capability: &serde_json::Value,
    entity_id: i64,
    config: &serde_json::Value,
    path: &str,
    content: &[u8],
) -> Result<(), String> {
    validate_cloud_capability(capability, entity_id)?;
    let op = create_operator(config)?;
    op.write(path, content.to_vec())
        .map_err(|e| format!("Failed to write {}: {}", path, e))
}

fn cloud_list(
    capability: &serde_json::Value,
    entity_id: i64,
    config: &serde_json::Value,
    path: &str,
) -> Result<Vec<serde_json::Value>, String> {
    validate_cloud_capability(capability, entity_id)?;
    let op = create_operator(config)?;

    let entries = op
        .list(path)
        .map_err(|e| format!("Failed to list {}: {}", path, e))?;

    let mut results = Vec::new();
    for entry in entries {
        let meta = entry.metadata();
        results.push(serde_json::json!({
            "name": entry.name(),
            "path": entry.path(),
            "is_dir": meta.is_dir(),
            "is_file": meta.is_file(),
            "size": meta.content_length(),
        }));
    }

    Ok(results)
}

fn cloud_delete(
    capability: &serde_json::Value,
    entity_id: i64,
    config: &serde_json::Value,
    path: &str,
) -> Result<(), String> {
    validate_cloud_capability(capability, entity_id)?;
    let op = create_operator(config)?;
    op.delete(path)
        .map_err(|e| format!("Failed to delete {}: {}", path, e))
}

fn cloud_stat(
    capability: &serde_json::Value,
    entity_id: i64,
    config: &serde_json::Value,
    path: &str,
) -> Result<serde_json::Value, String> {
    validate_cloud_capability(capability, entity_id)?;
    let op = create_operator(config)?;

    let meta = op
        .stat(path)
        .map_err(|e| format!("Failed to stat {}: {}", path, e))?;

    Ok(serde_json::json!({
        "is_dir": meta.is_dir(),
        "is_file": meta.is_file(),
        "size": meta.content_length(),
        "last_modified": meta.last_modified().map(|t| t.to_string()),
        "etag": meta.etag(),
        "content_type": meta.content_type(),
    }))
}

fn cloud_exists(
    capability: &serde_json::Value,
    entity_id: i64,
    config: &serde_json::Value,
    path: &str,
) -> Result<bool, String> {
    validate_cloud_capability(capability, entity_id)?;
    let op = create_operator(config)?;
    op.is_exist(path)
        .map_err(|e| format!("Failed to check existence of {}: {}", path, e))
}

// ============================================================================
// Lua Function Implementations
// ============================================================================

#[unsafe(no_mangle)]
unsafe extern "C" fn cloud_read_lua(l: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    let nargs = lua_gettop(l);
    if nargs != 3 {
        return lua_push_error(
            l,
            "cloud.read requires 3 arguments (capability, config, path)",
        );
    }

    let cap_json = match lua_value_to_json(l, 1) {
        Ok(json) => json,
        Err(e) => return lua_push_error(l, &format!("Invalid capability: {}", e)),
    };

    let config = match lua_value_to_json(l, 2) {
        Ok(json) => json,
        Err(e) => return lua_push_error(l, &format!("Invalid config: {}", e)),
    };

    let path = match lua_get_string(l, 3) {
        Ok(s) => s,
        Err(e) => return lua_push_error(l, &format!("Invalid path: {}", e)),
    };

    lua_getglobal(l, b"__lotus_this_id\0".as_ptr() as *const c_char);
    let this_id = lua_tointeger(l, -1);
    lua_pop(l, 1);

    match cloud_read(&cap_json, this_id, &config, &path) {
        Ok(content) => {
            // Try to convert to string, otherwise return as binary
            match String::from_utf8(content.clone()) {
                Ok(s) => {
                    let c_content = CString::new(s).unwrap_or_else(|_| CString::new("").unwrap());
                    lua_pushstring(l, c_content.as_ptr());
                }
                Err(_) => {
                    // Push as Lua string with arbitrary bytes
                    lua_pushlstring(l, content.as_ptr() as *const c_char, content.len());
                }
            }
            1
        }
        Err(e) => lua_push_error(l, &e),
    }
}

#[unsafe(no_mangle)]
unsafe extern "C" fn cloud_write_lua(l: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    let nargs = lua_gettop(l);
    if nargs != 4 {
        return lua_push_error(
            l,
            "cloud.write requires 4 arguments (capability, config, path, content)",
        );
    }

    let cap_json = match lua_value_to_json(l, 1) {
        Ok(json) => json,
        Err(e) => return lua_push_error(l, &format!("Invalid capability: {}", e)),
    };

    let config = match lua_value_to_json(l, 2) {
        Ok(json) => json,
        Err(e) => return lua_push_error(l, &format!("Invalid config: {}", e)),
    };

    let path = match lua_get_string(l, 3) {
        Ok(s) => s,
        Err(e) => return lua_push_error(l, &format!("Invalid path: {}", e)),
    };

    // Get content as bytes (supports both string and binary)
    let mut len = 0;
    let content_ptr = lua_tolstring(l, 4, &mut len);
    if content_ptr.is_null() {
        return lua_push_error(l, "cloud.write: content must be a string");
    }
    let content = std::slice::from_raw_parts(content_ptr as *const u8, len);

    lua_getglobal(l, b"__lotus_this_id\0".as_ptr() as *const c_char);
    let this_id = lua_tointeger(l, -1);
    lua_pop(l, 1);

    match cloud_write(&cap_json, this_id, &config, &path, content) {
        Ok(()) => 0,
        Err(e) => lua_push_error(l, &e),
    }
}

#[unsafe(no_mangle)]
unsafe extern "C" fn cloud_list_lua(l: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    let nargs = lua_gettop(l);
    if nargs != 3 {
        return lua_push_error(
            l,
            "cloud.list requires 3 arguments (capability, config, path)",
        );
    }

    let cap_json = match lua_value_to_json(l, 1) {
        Ok(json) => json,
        Err(e) => return lua_push_error(l, &format!("Invalid capability: {}", e)),
    };

    let config = match lua_value_to_json(l, 2) {
        Ok(json) => json,
        Err(e) => return lua_push_error(l, &format!("Invalid config: {}", e)),
    };

    let path = match lua_get_string(l, 3) {
        Ok(s) => s,
        Err(e) => return lua_push_error(l, &format!("Invalid path: {}", e)),
    };

    lua_getglobal(l, b"__lotus_this_id\0".as_ptr() as *const c_char);
    let this_id = lua_tointeger(l, -1);
    lua_pop(l, 1);

    match cloud_list(&cap_json, this_id, &config, &path) {
        Ok(entries) => {
            lua_createtable(l, entries.len() as c_int, 0);

            for (i, entry) in entries.iter().enumerate() {
                lua_createtable(l, 0, 5);

                if let Some(name) = entry.get("name").and_then(|v| v.as_str()) {
                    let c_name = CString::new(name).unwrap_or_default();
                    lua_pushstring(l, c_name.as_ptr());
                    lua_setfield(l, -2, b"name\0".as_ptr() as *const c_char);
                }

                if let Some(path) = entry.get("path").and_then(|v| v.as_str()) {
                    let c_path = CString::new(path).unwrap_or_default();
                    lua_pushstring(l, c_path.as_ptr());
                    lua_setfield(l, -2, b"path\0".as_ptr() as *const c_char);
                }

                if let Some(is_dir) = entry.get("is_dir").and_then(|v| v.as_bool()) {
                    lua_pushboolean(l, is_dir as c_int);
                    lua_setfield(l, -2, b"is_dir\0".as_ptr() as *const c_char);
                }

                if let Some(is_file) = entry.get("is_file").and_then(|v| v.as_bool()) {
                    lua_pushboolean(l, is_file as c_int);
                    lua_setfield(l, -2, b"is_file\0".as_ptr() as *const c_char);
                }

                if let Some(size) = entry.get("size").and_then(|v| v.as_u64()) {
                    lua_pushinteger(l, size as i64);
                    lua_setfield(l, -2, b"size\0".as_ptr() as *const c_char);
                }

                lua_rawseti(l, -2, (i + 1) as i64);
            }

            1
        }
        Err(e) => lua_push_error(l, &e),
    }
}

#[unsafe(no_mangle)]
unsafe extern "C" fn cloud_delete_lua(l: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    let nargs = lua_gettop(l);
    if nargs != 3 {
        return lua_push_error(
            l,
            "cloud.delete requires 3 arguments (capability, config, path)",
        );
    }

    let cap_json = match lua_value_to_json(l, 1) {
        Ok(json) => json,
        Err(e) => return lua_push_error(l, &format!("Invalid capability: {}", e)),
    };

    let config = match lua_value_to_json(l, 2) {
        Ok(json) => json,
        Err(e) => return lua_push_error(l, &format!("Invalid config: {}", e)),
    };

    let path = match lua_get_string(l, 3) {
        Ok(s) => s,
        Err(e) => return lua_push_error(l, &format!("Invalid path: {}", e)),
    };

    lua_getglobal(l, b"__lotus_this_id\0".as_ptr() as *const c_char);
    let this_id = lua_tointeger(l, -1);
    lua_pop(l, 1);

    match cloud_delete(&cap_json, this_id, &config, &path) {
        Ok(()) => 0,
        Err(e) => lua_push_error(l, &e),
    }
}

#[unsafe(no_mangle)]
unsafe extern "C" fn cloud_stat_lua(l: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    let nargs = lua_gettop(l);
    if nargs != 3 {
        return lua_push_error(
            l,
            "cloud.stat requires 3 arguments (capability, config, path)",
        );
    }

    let cap_json = match lua_value_to_json(l, 1) {
        Ok(json) => json,
        Err(e) => return lua_push_error(l, &format!("Invalid capability: {}", e)),
    };

    let config = match lua_value_to_json(l, 2) {
        Ok(json) => json,
        Err(e) => return lua_push_error(l, &format!("Invalid config: {}", e)),
    };

    let path = match lua_get_string(l, 3) {
        Ok(s) => s,
        Err(e) => return lua_push_error(l, &format!("Invalid path: {}", e)),
    };

    lua_getglobal(l, b"__lotus_this_id\0".as_ptr() as *const c_char);
    let this_id = lua_tointeger(l, -1);
    lua_pop(l, 1);

    match cloud_stat(&cap_json, this_id, &config, &path) {
        Ok(stats) => {
            lua_createtable(l, 0, 6);

            if let Some(is_dir) = stats.get("is_dir").and_then(|v| v.as_bool()) {
                lua_pushboolean(l, is_dir as c_int);
                lua_setfield(l, -2, b"is_dir\0".as_ptr() as *const c_char);
            }

            if let Some(is_file) = stats.get("is_file").and_then(|v| v.as_bool()) {
                lua_pushboolean(l, is_file as c_int);
                lua_setfield(l, -2, b"is_file\0".as_ptr() as *const c_char);
            }

            if let Some(size) = stats.get("size").and_then(|v| v.as_u64()) {
                lua_pushinteger(l, size as i64);
                lua_setfield(l, -2, b"size\0".as_ptr() as *const c_char);
            }

            if let Some(modified) = stats.get("last_modified").and_then(|v| v.as_str()) {
                let c_modified = CString::new(modified).unwrap_or_default();
                lua_pushstring(l, c_modified.as_ptr());
                lua_setfield(l, -2, b"last_modified\0".as_ptr() as *const c_char);
            }

            if let Some(etag) = stats.get("etag").and_then(|v| v.as_str()) {
                let c_etag = CString::new(etag).unwrap_or_default();
                lua_pushstring(l, c_etag.as_ptr());
                lua_setfield(l, -2, b"etag\0".as_ptr() as *const c_char);
            }

            if let Some(content_type) = stats.get("content_type").and_then(|v| v.as_str()) {
                let c_ct = CString::new(content_type).unwrap_or_default();
                lua_pushstring(l, c_ct.as_ptr());
                lua_setfield(l, -2, b"content_type\0".as_ptr() as *const c_char);
            }

            1
        }
        Err(e) => lua_push_error(l, &e),
    }
}

#[unsafe(no_mangle)]
unsafe extern "C" fn cloud_exists_lua(l: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    let nargs = lua_gettop(l);
    if nargs != 3 {
        return lua_push_error(
            l,
            "cloud.exists requires 3 arguments (capability, config, path)",
        );
    }

    let cap_json = match lua_value_to_json(l, 1) {
        Ok(json) => json,
        Err(e) => return lua_push_error(l, &format!("Invalid capability: {}", e)),
    };

    let config = match lua_value_to_json(l, 2) {
        Ok(json) => json,
        Err(e) => return lua_push_error(l, &format!("Invalid config: {}", e)),
    };

    let path = match lua_get_string(l, 3) {
        Ok(s) => s,
        Err(e) => return lua_push_error(l, &format!("Invalid path: {}", e)),
    };

    lua_getglobal(l, b"__lotus_this_id\0".as_ptr() as *const c_char);
    let this_id = lua_tointeger(l, -1);
    lua_pop(l, 1);

    match cloud_exists(&cap_json, this_id, &config, &path) {
        Ok(exists) => {
            lua_pushboolean(l, exists as c_int);
            1
        }
        Err(e) => lua_push_error(l, &e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn create_test_capability() -> serde_json::Value {
        json!({
            "owner_id": 1,
            "type": "cloud.read"
        })
    }

    fn create_fs_config(root: &str) -> serde_json::Value {
        json!({
            "type": "fs",
            "root": root
        })
    }

    #[test]
    fn test_cloud_read_write_fs() {
        let temp_dir = tempfile::tempdir().unwrap();
        let root = temp_dir.path().to_str().unwrap();
        let cap = create_test_capability();
        let config = create_fs_config(root);

        // Write a file
        cloud_write(&cap, 1, &config, "test.txt", b"Hello, Cloud!").unwrap();

        // Read it back
        let content = cloud_read(&cap, 1, &config, "test.txt").unwrap();
        assert_eq!(content, b"Hello, Cloud!");
    }

    #[test]
    fn test_cloud_list_fs() {
        let temp_dir = tempfile::tempdir().unwrap();
        let root = temp_dir.path().to_str().unwrap();
        let cap = create_test_capability();
        let config = create_fs_config(root);

        // Create some files
        cloud_write(&cap, 1, &config, "file1.txt", b"content1").unwrap();
        cloud_write(&cap, 1, &config, "file2.txt", b"content2").unwrap();

        // List directory
        let entries = cloud_list(&cap, 1, &config, "/").unwrap();
        // Should contain at least our 2 files
        assert!(entries.len() >= 2);

        // Check that our files are in the list
        let names: Vec<&str> = entries
            .iter()
            .filter_map(|e| e.get("name").and_then(|n| n.as_str()))
            .collect();
        assert!(names.contains(&"file1.txt"));
        assert!(names.contains(&"file2.txt"));
    }

    #[test]
    fn test_cloud_exists_fs() {
        let temp_dir = tempfile::tempdir().unwrap();
        let root = temp_dir.path().to_str().unwrap();
        let cap = create_test_capability();
        let config = create_fs_config(root);

        assert!(!cloud_exists(&cap, 1, &config, "nonexistent.txt").unwrap());

        cloud_write(&cap, 1, &config, "exists.txt", b"content").unwrap();
        assert!(cloud_exists(&cap, 1, &config, "exists.txt").unwrap());
    }

    #[test]
    fn test_cloud_delete_fs() {
        let temp_dir = tempfile::tempdir().unwrap();
        let root = temp_dir.path().to_str().unwrap();
        let cap = create_test_capability();
        let config = create_fs_config(root);

        cloud_write(&cap, 1, &config, "to_delete.txt", b"content").unwrap();
        assert!(cloud_exists(&cap, 1, &config, "to_delete.txt").unwrap());

        cloud_delete(&cap, 1, &config, "to_delete.txt").unwrap();
        assert!(!cloud_exists(&cap, 1, &config, "to_delete.txt").unwrap());
    }

    #[test]
    fn test_capability_validation() {
        let temp_dir = tempfile::tempdir().unwrap();
        let root = temp_dir.path().to_str().unwrap();
        let cap = create_test_capability();
        let config = create_fs_config(root);

        // Wrong entity ID should fail
        let result = cloud_read(&cap, 999, &config, "test.txt");
        assert!(result.is_err());
    }
}
