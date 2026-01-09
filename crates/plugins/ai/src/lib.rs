//! AI plugin for Lotus using rig for LLM operations.

use rig::completion::Prompt;
use rig::providers::{anthropic, cohere, openai, perplexity};
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int};

type RegisterFunction = unsafe extern "C" fn(*const c_char, PluginLuaFunction) -> c_int;
type PluginLuaFunction = unsafe extern "C" fn(*mut mlua::ffi::lua_State) -> c_int;

/// Validate that a capability grants access to AI operations
fn validate_capability(
    capability: &serde_json::Value,
    current_entity_id: i64,
) -> Result<(), String> {
    // Check ownership
    let owner_id = capability["owner_id"]
        .as_i64()
        .ok_or("ai: capability missing owner_id")?;
    if owner_id != current_entity_id {
        return Err("ai: capability does not belong to current entity".to_string());
    }

    Ok(())
}

/// Generate text using an LLM
pub async fn ai_generate_text(
    capability: &serde_json::Value,
    entity_id: i64,
    provider: &str,
    model: &str,
    prompt: &str,
    options: &serde_json::Value,
) -> Result<String, String> {
    validate_capability(capability, entity_id)?;

    // Get API key from capability params
    let api_key = capability["params"]["api_key"]
        .as_str()
        .ok_or("ai: capability missing api_key parameter")?;

    let temperature = options["temperature"].as_f64().unwrap_or(0.7);
    let max_tokens = options["max_tokens"].as_u64().unwrap_or(1000);

    match provider {
        "openai" => {
            let client = openai::Client::new(api_key);
            let agent = client
                .agent(model)
                .temperature(temperature)
                .max_tokens(max_tokens)
                .build();
            let response = agent
                .prompt(prompt)
                .await
                .map_err(|e| format!("ai.generate_text failed: {}", e))?;
            Ok(response)
        }
        "anthropic" => {
            // Anthropic requires base_url, betas, and version
            let client =
                anthropic::Client::new(api_key, "https://api.anthropic.com", None, "2023-06-01");
            let agent = client
                .agent(model)
                .temperature(temperature)
                .max_tokens(max_tokens)
                .build();
            let response = agent
                .prompt(prompt)
                .await
                .map_err(|e| format!("ai.generate_text failed: {}", e))?;
            Ok(response)
        }
        "cohere" => {
            let client = cohere::Client::new(api_key);
            let agent = client
                .agent(model)
                .temperature(temperature)
                .max_tokens(max_tokens)
                .build();
            let response = agent
                .prompt(prompt)
                .await
                .map_err(|e| format!("ai.generate_text failed: {}", e))?;
            Ok(response)
        }
        "perplexity" => {
            let client = perplexity::Client::new(api_key);
            let agent = client
                .agent(model)
                .temperature(temperature)
                .max_tokens(max_tokens)
                .build();
            let response = agent
                .prompt(prompt)
                .await
                .map_err(|e| format!("ai.generate_text failed: {}", e))?;
            Ok(response)
        }
        _ => Err(format!(
            "ai: unsupported provider '{}'. Supported: openai, anthropic, cohere, perplexity",
            provider
        )),
    }
}

/// Generate embeddings for text
pub async fn ai_embed(
    capability: &serde_json::Value,
    entity_id: i64,
    provider: &str,
    model: &str,
    text: &str,
) -> Result<Vec<f64>, String> {
    validate_capability(capability, entity_id)?;

    // Get API key from capability params
    let api_key = capability["params"]["api_key"]
        .as_str()
        .ok_or("ai: capability missing api_key parameter")?;

    match provider {
        "openai" => {
            // TODO: Fix rig embeddings API - placeholder for now
            // The rig library's Embedding type needs proper conversion
            // This will be fixed when testing with real API keys
            Err("ai.embed: not yet fully implemented - embeddings API needs refinement".to_string())
        }
        _ => Err(format!("ai: unsupported provider '{}'", provider)),
    }
}

/// Chat completion with message history
pub async fn ai_chat(
    capability: &serde_json::Value,
    entity_id: i64,
    provider: &str,
    model: &str,
    messages: &[serde_json::Value],
    options: &serde_json::Value,
) -> Result<String, String> {
    validate_capability(capability, entity_id)?;

    // Get API key from capability params
    let api_key = capability["params"]["api_key"]
        .as_str()
        .ok_or("ai: capability missing api_key parameter")?;

    // Convert messages to prompt format
    // For now, simple concatenation - can be improved
    let mut prompt = String::new();
    for msg in messages {
        let role = msg["role"].as_str().unwrap_or("user");
        let content = msg["content"].as_str().unwrap_or("");
        prompt.push_str(&format!("{}: {}\n", role, content));
    }

    let temperature = options["temperature"].as_f64().unwrap_or(0.7);
    let max_tokens = options["max_tokens"].as_u64().unwrap_or(1000);

    match provider {
        "openai" => {
            let client = openai::Client::new(api_key);
            let agent = client
                .agent(model)
                .temperature(temperature)
                .max_tokens(max_tokens)
                .build();
            let response = agent
                .prompt(&prompt)
                .await
                .map_err(|e| format!("ai.chat failed: {}", e))?;
            Ok(response)
        }
        "anthropic" => {
            let client =
                anthropic::Client::new(api_key, "https://api.anthropic.com", None, "2023-06-01");
            let agent = client
                .agent(model)
                .temperature(temperature)
                .max_tokens(max_tokens)
                .build();
            let response = agent
                .prompt(&prompt)
                .await
                .map_err(|e| format!("ai.chat failed: {}", e))?;
            Ok(response)
        }
        "cohere" => {
            let client = cohere::Client::new(api_key);
            let agent = client
                .agent(model)
                .temperature(temperature)
                .max_tokens(max_tokens)
                .build();
            let response = agent
                .prompt(&prompt)
                .await
                .map_err(|e| format!("ai.chat failed: {}", e))?;
            Ok(response)
        }
        "perplexity" => {
            let client = perplexity::Client::new(api_key);
            let agent = client
                .agent(model)
                .temperature(temperature)
                .max_tokens(max_tokens)
                .build();
            let response = agent
                .prompt(&prompt)
                .await
                .map_err(|e| format!("ai.chat failed: {}", e))?;
            Ok(response)
        }
        _ => Err(format!(
            "ai: unsupported provider '{}'. Supported: openai, anthropic, cohere, perplexity",
            provider
        )),
    }
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

/// Helper: Push error message to Lua stack
unsafe fn lua_push_error(L: *mut mlua::ffi::lua_State, msg: &str) -> c_int {
    use mlua::ffi::*;
    let c_msg = CString::new(msg)
        .unwrap_or_else(|_| CString::new("Error message contains null byte").unwrap());
    lua_pushstring(L, c_msg.as_ptr());
    lua_error(L)
}

/// Lua wrapper for ai.generateText
#[unsafe(no_mangle)]
unsafe extern "C" fn ai_generate_text_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    let nargs = lua_gettop(L);
    if nargs != 5 {
        return lua_push_error(
            L,
            "ai.generateText requires 5 arguments (capability, provider, model, prompt, options)",
        );
    }

    // Get capability (table)
    let cap_json = match lua_value_to_json(L, 1) {
        Ok(json) => json,
        Err(e) => return lua_push_error(L, &format!("Invalid capability: {}", e)),
    };

    // Get provider (string)
    let mut len = 0;
    let provider_ptr = lua_tolstring(L, 2, &mut len);
    if provider_ptr.is_null() {
        return lua_push_error(L, "ai.generateText: provider must be a string");
    }
    let provider_slice = std::slice::from_raw_parts(provider_ptr as *const u8, len);
    let provider = match std::str::from_utf8(provider_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "ai.generateText: provider contains invalid UTF-8"),
    };

    // Get model (string)
    let model_ptr = lua_tolstring(L, 3, &mut len);
    if model_ptr.is_null() {
        return lua_push_error(L, "ai.generateText: model must be a string");
    }
    let model_slice = std::slice::from_raw_parts(model_ptr as *const u8, len);
    let model = match std::str::from_utf8(model_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "ai.generateText: model contains invalid UTF-8"),
    };

    // Get prompt (string)
    let prompt_ptr = lua_tolstring(L, 4, &mut len);
    if prompt_ptr.is_null() {
        return lua_push_error(L, "ai.generateText: prompt must be a string");
    }
    let prompt_slice = std::slice::from_raw_parts(prompt_ptr as *const u8, len);
    let prompt = match std::str::from_utf8(prompt_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "ai.generateText: prompt contains invalid UTF-8"),
    };

    // Get options (table)
    let options = match lua_value_to_json(L, 5) {
        Ok(json) => json,
        Err(e) => return lua_push_error(L, &format!("Invalid options: {}", e)),
    };

    // Get __lotus_this_id from globals
    lua_getglobal(L, b"__lotus_this_id\0".as_ptr() as *const c_char);
    let this_id = lua_tointeger(L, -1);
    lua_pop(L, 1);

    // Execute async operation
    let result = tokio::runtime::Runtime::new()
        .map_err(|e| format!("Failed to create tokio runtime: {}", e))
        .and_then(|rt| {
            rt.block_on(ai_generate_text(
                &cap_json, this_id, provider, model, prompt, &options,
            ))
        });

    match result {
        Ok(text) => {
            let c_str = match CString::new(text) {
                Ok(s) => s,
                Err(_) => return lua_push_error(L, "Response contains null byte"),
            };
            lua_pushstring(L, c_str.as_ptr());
            1
        }
        Err(e) => lua_push_error(L, &e),
    }
}

/// Lua wrapper for ai.embed
#[unsafe(no_mangle)]
unsafe extern "C" fn ai_embed_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    let nargs = lua_gettop(L);
    if nargs != 4 {
        return lua_push_error(
            L,
            "ai.embed requires 4 arguments (capability, provider, model, text)",
        );
    }

    // Get capability (table)
    let cap_json = match lua_value_to_json(L, 1) {
        Ok(json) => json,
        Err(e) => return lua_push_error(L, &format!("Invalid capability: {}", e)),
    };

    // Get provider (string)
    let mut len = 0;
    let provider_ptr = lua_tolstring(L, 2, &mut len);
    if provider_ptr.is_null() {
        return lua_push_error(L, "ai.embed: provider must be a string");
    }
    let provider_slice = std::slice::from_raw_parts(provider_ptr as *const u8, len);
    let provider = match std::str::from_utf8(provider_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "ai.embed: provider contains invalid UTF-8"),
    };

    // Get model (string)
    let model_ptr = lua_tolstring(L, 3, &mut len);
    if model_ptr.is_null() {
        return lua_push_error(L, "ai.embed: model must be a string");
    }
    let model_slice = std::slice::from_raw_parts(model_ptr as *const u8, len);
    let model = match std::str::from_utf8(model_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "ai.embed: model contains invalid UTF-8"),
    };

    // Get text (string)
    let text_ptr = lua_tolstring(L, 4, &mut len);
    if text_ptr.is_null() {
        return lua_push_error(L, "ai.embed: text must be a string");
    }
    let text_slice = std::slice::from_raw_parts(text_ptr as *const u8, len);
    let text = match std::str::from_utf8(text_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "ai.embed: text contains invalid UTF-8"),
    };

    // Get __lotus_this_id from globals
    lua_getglobal(L, b"__lotus_this_id\0".as_ptr() as *const c_char);
    let this_id = lua_tointeger(L, -1);
    lua_pop(L, 1);

    // Execute async operation
    let result = tokio::runtime::Runtime::new()
        .map_err(|e| format!("Failed to create tokio runtime: {}", e))
        .and_then(|rt| rt.block_on(ai_embed(&cap_json, this_id, provider, model, text)));

    match result {
        Ok(embedding) => {
            // Return embedding as Lua array
            lua_createtable(L, embedding.len() as c_int, 0);
            for (i, val) in embedding.iter().enumerate() {
                lua_pushnumber(L, *val);
                lua_rawseti(L, -2, (i + 1) as i64);
            }
            1
        }
        Err(e) => lua_push_error(L, &e),
    }
}

/// Lua wrapper for ai.chat
#[unsafe(no_mangle)]
unsafe extern "C" fn ai_chat_lua(L: *mut mlua::ffi::lua_State) -> c_int {
    use mlua::ffi::*;

    let nargs = lua_gettop(L);
    if nargs != 5 {
        return lua_push_error(
            L,
            "ai.chat requires 5 arguments (capability, provider, model, messages, options)",
        );
    }

    // Get capability (table)
    let cap_json = match lua_value_to_json(L, 1) {
        Ok(json) => json,
        Err(e) => return lua_push_error(L, &format!("Invalid capability: {}", e)),
    };

    // Get provider (string)
    let mut len = 0;
    let provider_ptr = lua_tolstring(L, 2, &mut len);
    if provider_ptr.is_null() {
        return lua_push_error(L, "ai.chat: provider must be a string");
    }
    let provider_slice = std::slice::from_raw_parts(provider_ptr as *const u8, len);
    let provider = match std::str::from_utf8(provider_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "ai.chat: provider contains invalid UTF-8"),
    };

    // Get model (string)
    let model_ptr = lua_tolstring(L, 3, &mut len);
    if model_ptr.is_null() {
        return lua_push_error(L, "ai.chat: model must be a string");
    }
    let model_slice = std::slice::from_raw_parts(model_ptr as *const u8, len);
    let model = match std::str::from_utf8(model_slice) {
        Ok(s) => s,
        Err(_) => return lua_push_error(L, "ai.chat: model contains invalid UTF-8"),
    };

    // Get messages (array of objects)
    let messages_json = match lua_value_to_json(L, 4) {
        Ok(json) => json,
        Err(e) => return lua_push_error(L, &format!("Invalid messages: {}", e)),
    };

    let messages = match messages_json.as_array() {
        Some(arr) => arr,
        None => return lua_push_error(L, "ai.chat: messages must be an array"),
    };

    // Get options (table)
    let options = match lua_value_to_json(L, 5) {
        Ok(json) => json,
        Err(e) => return lua_push_error(L, &format!("Invalid options: {}", e)),
    };

    // Get __lotus_this_id from globals
    lua_getglobal(L, b"__lotus_this_id\0".as_ptr() as *const c_char);
    let this_id = lua_tointeger(L, -1);
    lua_pop(L, 1);

    // Execute async operation
    let result = tokio::runtime::Runtime::new()
        .map_err(|e| format!("Failed to create tokio runtime: {}", e))
        .and_then(|rt| {
            rt.block_on(ai_chat(
                &cap_json, this_id, provider, model, messages, &options,
            ))
        });

    match result {
        Ok(text) => {
            let c_str = match CString::new(text) {
                Ok(s) => s,
                Err(_) => return lua_push_error(L, "Response contains null byte"),
            };
            lua_pushstring(L, c_str.as_ptr());
            1
        }
        Err(e) => lua_push_error(L, &e),
    }
}

/// Plugin initialization - register all functions
#[unsafe(no_mangle)]
pub unsafe extern "C" fn lotus_ai_plugin_init(register_fn: RegisterFunction) -> c_int {
    unsafe {
        let names = ["ai.generateText", "ai.embed", "ai.chat"];
        let funcs: [PluginLuaFunction; 3] = [ai_generate_text_lua, ai_embed_lua, ai_chat_lua];

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
pub unsafe extern "C" fn lotus_ai_plugin_cleanup() -> c_int {
    // No state to clean up
    0 // Success
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_capability(owner_id: i64, api_key: &str) -> serde_json::Value {
        serde_json::json!({
            "owner_id": owner_id,
            "params": {
                "api_key": api_key
            }
        })
    }

    #[test]
    fn test_capability_validation() {
        let cap = create_test_capability(1, "test-key");

        // Valid capability
        assert!(validate_capability(&cap, 1).is_ok());

        // Wrong entity ID
        assert!(validate_capability(&cap, 2).is_err());

        // Missing owner_id
        let bad_cap = serde_json::json!({
            "params": {
                "api_key": "test"
            }
        });
        assert!(validate_capability(&bad_cap, 1).is_err());
    }

    // Note: Integration tests with real APIs would require API keys
    // and should be run separately or mocked
}
