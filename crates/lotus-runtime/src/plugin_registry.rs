//! Plugin function registry for dynamic opcode dispatch.
//!
//! Plugins register Lua functions that can be called from scripts.

use std::collections::HashMap;
use std::ffi::CStr;
use std::os::raw::c_char;
use std::sync::Mutex;

/// Type for plugin functions that work with Lua values directly.
///
/// This matches the standard Lua C function signature (lua_CFunction).
/// The function receives the Lua state and returns the number of return values.
///
/// Returns number of return values pushed to stack (>=0), or negative on error.
pub type PluginLuaFunction =
    unsafe extern "C" fn(lua_state: *mut mlua::ffi::lua_State) -> std::os::raw::c_int;

/// Global registry of plugin Lua functions.
static PLUGIN_REGISTRY: Mutex<Option<HashMap<String, PluginLuaFunction>>> = Mutex::new(None);

/// Initialize the plugin registry.
pub fn init_registry() {
    let mut registry = PLUGIN_REGISTRY.lock().unwrap();
    *registry = Some(HashMap::new());
}

/// Register a plugin Lua function.
///
/// # Safety
/// The function pointer must remain valid for the lifetime of the program.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn register_plugin_function(
    name: *const c_char,
    func: PluginLuaFunction,
) -> i32 {
    let name_str = match unsafe { CStr::from_ptr(name).to_str() } {
        Ok(s) => s,
        Err(_) => return -1,
    };

    let mut registry = PLUGIN_REGISTRY.lock().unwrap();
    if let Some(ref mut map) = *registry {
        map.insert(name_str.to_string(), func);
        0
    } else {
        -1
    }
}

/// Get a registered plugin function by name.
pub fn get_plugin_function(name: &str) -> Option<PluginLuaFunction> {
    let registry = PLUGIN_REGISTRY.lock().unwrap();
    registry.as_ref()?.get(name).copied()
}

/// Get all registered plugin opcode names.
pub fn get_registered_opcodes() -> Vec<String> {
    let registry = PLUGIN_REGISTRY.lock().unwrap();
    registry
        .as_ref()
        .map(|map| map.keys().cloned().collect())
        .unwrap_or_default()
}

/// Register all plugin functions as Lua globals.
///
/// Each function registered as "foo.bar" becomes the Lua global "__lotus_foo_bar".
///
/// # Safety
/// The lua_state must be a valid Lua state pointer.
pub unsafe fn register_all_to_lua(lua_state: *mut mlua::ffi::lua_State) {
    use std::ffi::CString;

    let registry = PLUGIN_REGISTRY.lock().unwrap();
    if let Some(ref map) = *registry {
        for (name, func) in map {
            // Convert "fs.read" -> "__lotus_fs_read"
            let global_name = format!("__lotus_{}", name.replace('.', "_"));

            if let Ok(name_cstr) = CString::new(global_name) {
                // Transmute from extern "C" to extern "C-unwind" for Lua
                let lua_cfunc: unsafe extern "C-unwind" fn(
                    *mut mlua::ffi::lua_State,
                ) -> std::os::raw::c_int = unsafe { std::mem::transmute(*func) };
                mlua::ffi::lua_pushcclosure(lua_state, lua_cfunc, 0);
                mlua::ffi::lua_setglobal(lua_state, name_cstr.as_ptr());
            }
        }
    }
}
