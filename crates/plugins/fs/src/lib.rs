//! Filesystem plugin for Viwo with capability-based security.
//!
//! This plugin provides file system access through Lua functions that validate capabilities.

use std::ffi::{CStr, CString};
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
                return -1,
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

// Lua function implementations - these are called directly from Lua with the Lua state

#[unsafe(no_mangle)]
unsafe extern "C" fn fs_read_lua(lua_state: *mut mlua::ffi::lua_State) -> std::os::raw::c_int {
    lua_wrapper(lua_state, |lua| {
        // Get arguments from Lua stack
        let (capability, path): (mlua::Value, String) = lua.from_stack_multi(-2)?;
        let this_id = lua.globals().get::<i64>("__viwo_this_id")?;

        // Convert capability to JSON for validation
        let cap_json: serde_json::Value = lua.from_value(capability)?;

        // Perform file read with capability validation
        let content = fs_read(&cap_json, this_id, &path)
            .map_err(mlua::Error::external)?;

        // Push result back to Lua
        lua.push(content)?;
        Ok(1) // Number of return values
    })
}

#[unsafe(no_mangle)]
unsafe extern "C" fn fs_write_lua(lua_state: *mut mlua::ffi::lua_State) -> std::os::raw::c_int {
    lua_wrapper(lua_state, |lua| {
        let (capability, path, content): (mlua::Value, String, String) = lua.from_stack_multi(-3)?;
        let this_id = lua.globals().get::<i64>("__viwo_this_id")?;

        let cap_json: serde_json::Value = lua.from_value(capability)?;

        fs_write(&cap_json, this_id, &path, &content)
            .map_err(mlua::Error::external)?;

        Ok(0) // No return values
    })
}

#[unsafe(no_mangle)]
unsafe extern "C" fn fs_list_lua(lua_state: *mut mlua::ffi::lua_State) -> std::os::raw::c_int {
    lua_wrapper(lua_state, |lua| {
        let (capability, path): (mlua::Value, String) = lua.from_stack_multi(-2)?;
        let this_id = lua.globals().get::<i64>("__viwo_this_id")?;

        let cap_json: serde_json::Value = lua.from_value(capability)?;

        let files = fs_list(&cap_json, this_id, &path)
            .map_err(mlua::Error::external)?;

        lua.to_value(&files)?;
        Ok(1)
    })
}

#[unsafe(no_mangle)]
unsafe extern "C" fn fs_stat_lua(lua_state: *mut mlua::ffi::lua_State) -> std::os::raw::c_int {
    lua_wrapper(lua_state, |lua| {
        let (capability, path): (mlua::Value, String) = lua.from_stack_multi(-2)?;
        let this_id = lua.globals().get::<i64>("__viwo_this_id")?;

        let cap_json: serde_json::Value = lua.from_value(capability)?;

        let stats = fs_stat(&cap_json, this_id, &path)
            .map_err(mlua::Error::external)?;

        lua.to_value(&stats)?;
        Ok(1)
    })
}

#[unsafe(no_mangle)]
unsafe extern "C" fn fs_exists_lua(lua_state: *mut mlua::ffi::lua_State) -> std::os::raw::c_int {
    lua_wrapper(lua_state, |lua| {
        let (capability, path): (mlua::Value, String) = lua.from_stack_multi(-2)?;
        let this_id = lua.globals().get::<i64>("__viwo_this_id")?;

        let cap_json: serde_json::Value = lua.from_value(capability)?;

        let exists = fs_exists(&cap_json, this_id, &path)
            .map_err(mlua::Error::external)?;

        lua.push(exists)?;
        Ok(1)
    })
}

#[unsafe(no_mangle)]
unsafe extern "C" fn fs_mkdir_lua(lua_state: *mut mlua::ffi::lua_State) -> std::os::raw::c_int {
    lua_wrapper(lua_state, |lua| {
        let (capability, path): (mlua::Value, String) = lua.from_stack_multi(-2)?;
        let this_id = lua.globals().get::<i64>("__viwo_this_id")?;

        let cap_json: serde_json::Value = lua.from_value(capability)?;

        fs_mkdir(&cap_json, this_id, &path)
            .map_err(mlua::Error::external)?;

        Ok(0)
    })
}

#[unsafe(no_mangle)]
unsafe extern "C" fn fs_remove_lua(lua_state: *mut mlua::ffi::lua_State) -> std::os::raw::c_int {
    lua_wrapper(lua_state, |lua| {
        let (capability, path): (mlua::Value, String) = lua.from_stack_multi(-2)?;
        let this_id = lua.globals().get::<i64>("__viwo_this_id")?;

        let cap_json: serde_json::Value = lua.from_value(capability)?;

        fs_remove(&cap_json, this_id, &path)
            .map_err(mlua::Error::external)?;

        Ok(0)
    })
}

/// Helper to wrap Lua function calls and handle errors
unsafe fn lua_wrapper<F>(lua_state: *mut mlua::ffi::lua_State, func: F) -> std::os::raw::c_int
where
    F: FnOnce(&mlua::Lua) -> mlua::Result<std::os::raw::c_int>,
{
    // Convert raw pointer to mlua::Lua
    let lua = unsafe {
        mlua::Lua::init_from_ptr(lua_state)
    };

    match func(&lua) {
        Ok(n) => n,
        Err(e) => {
            // Push error message to Lua
            if let Err(_) = lua.push(format!("Plugin error: {}", e)) {
                -1
            } else {
                lua.error::<()>("").ok();
                -1
            }
        }
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
