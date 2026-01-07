//! Network plugin for Viwo with capability-based security.

use std::collections::HashMap;
use std::ffi::CString;
use std::os::raw::{c_char, c_int};

/// Type for plugin functions - standard Lua C function signature
type PluginLuaFunction =
    unsafe extern "C" fn(lua_state: *mut mlua::ffi::lua_State) -> std::os::raw::c_int;

/// Type for the registration callback passed from the runtime
type RegisterFunction =
    unsafe extern "C" fn(name: *const c_char, func: PluginLuaFunction) -> std::os::raw::c_int;

/// Plugin initialization - register all net functions
#[unsafe(no_mangle)]
pub unsafe extern "C" fn plugin_init(register_fn: RegisterFunction) -> c_int {
    unsafe {
        let names = ["net.get", "net.post"];
        let funcs: [PluginLuaFunction; 2] = [net_get_lua, net_post_lua];

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

// Lua C API helper functions

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
            let s = std::str::from_utf8(slice).map_err(|_| "Invalid UTF-8 in string")?;
            Ok(serde_json::Value::String(s.to_string()))
        }
        LUA_TTABLE => lua_table_to_json(L, index),
        _ => Err(format!(
            "Unsupported Lua type {} for JSON conversion",
            lua_type
        )),
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

    let abs_index = if index < 0 && index > LUA_REGISTRYINDEX {
        lua_gettop(L) + index + 1
    } else {
        index
    };

    let mut map = serde_json::Map::new();
    lua_pushnil(L);

    while lua_next(L, abs_index) != 0 {
        let mut len = 0;
        let key_ptr = lua_tolstring(L, -2, &mut len);
        if !key_ptr.is_null() {
            let key_slice = std::slice::from_raw_parts(key_ptr as *const u8, len);
            if let Ok(key_str) = std::str::from_utf8(key_slice) {
                if let Ok(value) = lua_value_to_json(L, -1) {
                    map.insert(key_str.to_string(), value);
                }
            }
        }
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

/// Push a JSON value to the Lua stack
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

// Lua function implementations

#[unsafe(no_mangle)]
unsafe extern "C" fn net_get_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    let nargs = lua_gettop(L);
    if nargs != 3 {
        return lua_push_error(L, "net.get requires 3 arguments (capability, url, headers)");
    }

    // Get capability (table)
    let cap_json = match lua_value_to_json(L, 1) {
        Ok(json) => json,
        Err(e) => return lua_push_error(L, &format!("Invalid capability: {}", e)),
    };

    // Get URL (string)
    let mut len = 0;
    let url_ptr = lua_tolstring(L, 2, &mut len);
    if url_ptr.is_null() {
        return lua_push_error(L, "net.get: url must be a string");
    }
    let url_slice = std::slice::from_raw_parts(url_ptr as *const u8, len);
    let url = match std::str::from_utf8(url_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "net.get: url contains invalid UTF-8"),
    };

    // Get headers (table)
    let headers_json = match lua_value_to_json(L, 3) {
        Ok(json) => json,
        Err(e) => return lua_push_error(L, &format!("Invalid headers: {}", e)),
    };

    let headers: HashMap<String, String> = match headers_json.as_object() {
        Some(obj) => obj
            .iter()
            .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
            .collect(),
        None => HashMap::new(),
    };

    // Get __viwo_this_id from globals
    lua_getglobal(L, b"__viwo_this_id\0".as_ptr() as *const c_char);
    let this_id = lua_tointeger(L, -1);
    lua_pop(L, 1);

    // Execute async HTTP request
    let result = tokio::runtime::Runtime::new()
        .map_err(|e| format!("Failed to create tokio runtime: {}", e))
        .and_then(|rt| rt.block_on(net_get(&cap_json, this_id, url, headers)));

    match result {
        Ok(response) => {
            if let Err(e) = json_to_lua(L, &response) {
                return lua_push_error(L, &format!("Failed to convert response: {}", e));
            }
            1
        }
        Err(e) => lua_push_error(L, &e),
    }
}

#[unsafe(no_mangle)]
unsafe extern "C" fn net_post_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    let nargs = lua_gettop(L);
    if nargs != 4 {
        return lua_push_error(
            L,
            "net.post requires 4 arguments (capability, url, headers, body)",
        );
    }

    // Get capability (table)
    let cap_json = match lua_value_to_json(L, 1) {
        Ok(json) => json,
        Err(e) => return lua_push_error(L, &format!("Invalid capability: {}", e)),
    };

    // Get URL (string)
    let mut len = 0;
    let url_ptr = lua_tolstring(L, 2, &mut len);
    if url_ptr.is_null() {
        return lua_push_error(L, "net.post: url must be a string");
    }
    let url_slice = std::slice::from_raw_parts(url_ptr as *const u8, len);
    let url = match std::str::from_utf8(url_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "net.post: url contains invalid UTF-8"),
    };

    // Get headers (table)
    let headers_json = match lua_value_to_json(L, 3) {
        Ok(json) => json,
        Err(e) => return lua_push_error(L, &format!("Invalid headers: {}", e)),
    };

    let headers: HashMap<String, String> = match headers_json.as_object() {
        Some(obj) => obj
            .iter()
            .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
            .collect(),
        None => HashMap::new(),
    };

    // Get body (string)
    let body_ptr = lua_tolstring(L, 4, &mut len);
    if body_ptr.is_null() {
        return lua_push_error(L, "net.post: body must be a string");
    }
    let body_slice = std::slice::from_raw_parts(body_ptr as *const u8, len);
    let body = match std::str::from_utf8(body_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "net.post: body contains invalid UTF-8"),
    };

    // Get __viwo_this_id from globals
    lua_getglobal(L, b"__viwo_this_id\0".as_ptr() as *const c_char);
    let this_id = lua_tointeger(L, -1);
    lua_pop(L, 1);

    // Execute async HTTP request
    let result = tokio::runtime::Runtime::new()
        .map_err(|e| format!("Failed to create tokio runtime: {}", e))
        .and_then(|rt| rt.block_on(net_post(&cap_json, this_id, url, headers, body)));

    match result {
        Ok(response) => {
            if let Err(e) = json_to_lua(L, &response) {
                return lua_push_error(L, &format!("Failed to convert response: {}", e));
            }
            1
        }
        Err(e) => lua_push_error(L, &e),
    }
}

// Core network functions

/// Validate that a capability grants access to a URL
fn validate_capability(
    capability: &serde_json::Value,
    current_entity_id: i64,
    requested_url: &str,
) -> Result<(), String> {
    // Check ownership
    let owner_id = capability["owner_id"]
        .as_i64()
        .ok_or("net: capability missing owner_id")?;
    if owner_id != current_entity_id {
        return Err("net: capability does not belong to current entity".to_string());
    }

    // Check domain/URL pattern
    let allowed_pattern = capability["params"]["url"]
        .as_str()
        .ok_or("net: capability missing url parameter")?;

    // Wildcard support: "*" allows all URLs
    if allowed_pattern == "*" {
        return Ok(());
    }

    // Check if URL starts with allowed pattern
    if !requested_url.starts_with(allowed_pattern) {
        return Err(format!(
            "net: URL '{}' not allowed by capability (pattern: '{}')",
            requested_url, allowed_pattern
        ));
    }

    Ok(())
}

/// HTTP GET request
pub async fn net_get(
    capability: &serde_json::Value,
    entity_id: i64,
    url: &str,
    headers: HashMap<String, String>,
) -> Result<serde_json::Value, String> {
    validate_capability(capability, entity_id, url)?;

    let client = reqwest::Client::new();
    let mut request = client.get(url);

    for (key, value) in headers {
        request = request.header(key, value);
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("net.get request failed: {}", e))?;

    let status = response.status().as_u16();
    let headers_map: HashMap<String, String> = response
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();

    let body = response
        .text()
        .await
        .map_err(|e| format!("net.get failed to read response body: {}", e))?;

    Ok(serde_json::json!({
        "status": status,
        "headers": headers_map,
        "body": body,
    }))
}

/// HTTP POST request
pub async fn net_post(
    capability: &serde_json::Value,
    entity_id: i64,
    url: &str,
    headers: HashMap<String, String>,
    body: &str,
) -> Result<serde_json::Value, String> {
    validate_capability(capability, entity_id, url)?;

    let client = reqwest::Client::new();
    let mut request = client.post(url).body(body.to_string());

    for (key, value) in headers {
        request = request.header(key, value);
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("net.post request failed: {}", e))?;

    let status = response.status().as_u16();
    let headers_map: HashMap<String, String> = response
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();

    let response_body = response
        .text()
        .await
        .map_err(|e| format!("net.post failed to read response body: {}", e))?;

    Ok(serde_json::json!({
        "status": status,
        "headers": headers_map,
        "body": response_body,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_capability(owner_id: i64, url_pattern: &str) -> serde_json::Value {
        serde_json::json!({
            "owner_id": owner_id,
            "params": {
                "url": url_pattern
            }
        })
    }

    #[tokio::test]
    async fn test_net_get_httpbin() {
        let cap = create_test_capability(1, "https://httpbin.org");

        let result = net_get(&cap, 1, "https://httpbin.org/get", HashMap::new()).await;

        assert!(result.is_ok());
        let response = result.unwrap();
        assert_eq!(response["status"], 200);
        assert!(response["body"].as_str().unwrap().contains("httpbin"));
    }

    #[tokio::test]
    async fn test_net_post_httpbin() {
        let cap = create_test_capability(1, "https://httpbin.org");

        let result = net_post(
            &cap,
            1,
            "https://httpbin.org/post",
            HashMap::new(),
            "test data",
        )
        .await;

        assert!(result.is_ok());
        let response = result.unwrap();
        assert_eq!(response["status"], 200);
    }

    #[tokio::test]
    async fn test_net_capability_validation() {
        let cap = create_test_capability(1, "https://allowed.com");

        // Try different domain
        let result = net_get(&cap, 1, "https://forbidden.com/path", HashMap::new()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not allowed"));

        // Try wrong entity ID
        let result = net_get(&cap, 2, "https://allowed.com/path", HashMap::new()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("does not belong"));
    }

    #[tokio::test]
    async fn test_net_wildcard_capability() {
        let cap = create_test_capability(1, "*");

        // Should allow any URL
        let result = net_get(&cap, 1, "https://httpbin.org/get", HashMap::new()).await;
        assert!(result.is_ok());
    }
}
