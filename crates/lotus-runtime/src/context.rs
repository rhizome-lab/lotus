//! Execution context for running scripts with access to storage.

use lotus_core::{Entity, EntityId, Scheduler, WorldStorage};
use lotus_ir::SExpr;
use lotus_runtime_luajit::Runtime as LuaRuntime;
use mlua::LuaSerdeExt;
use std::sync::{Arc, Mutex};

/// Execution context for a script.
pub struct ExecutionContext {
    /// The entity running the script ("this").
    pub this: Entity,
    /// The entity that initiated the call ("caller").
    pub caller_id: Option<EntityId>,
    /// Arguments passed to the verb.
    pub args: Vec<serde_json::Value>,
    /// Storage backend.
    pub storage: Arc<Mutex<WorldStorage>>,
    /// Task scheduler.
    pub scheduler: Arc<Scheduler>,
    /// Plugin registry.
    pub plugins: Arc<Mutex<crate::plugin_loader::PluginRegistry>>,
}

impl ExecutionContext {
    /// Execute an S-expression in this context.
    pub fn execute(&self, expr: &SExpr) -> Result<serde_json::Value, crate::ExecutionError> {
        // Create a Lua runtime
        let runtime = LuaRuntime::new()?;

        // Inject game opcodes as Lua globals
        self.inject_opcodes(&runtime)?;

        // Compile to Lua code first
        let lua_code = lotus_runtime_luajit::compile(expr)?;

        // Flatten entity for Lua (merge props into top level like TypeScript does)
        let flattened_this = self.flatten_entity(&self.this);

        // Wrap in function that sets up context variables
        // Use json.decode to parse the JSON strings
        // Wrap the result to also return __this for mutation detection
        let wrapped_code = format!(
            r#"
local __this = json.decode('{}')
local __caller = json.decode('{}')
local __args = json.decode('{}')
local __result = (function()
{}
end)()
return {{ result = __result, this = __this }}
"#,
            serde_json::to_string(&flattened_this)
                .unwrap()
                .replace('\\', "\\\\")
                .replace('\'', "\\'"),
            serde_json::to_string(&self.caller_id)
                .unwrap()
                .replace('\\', "\\\\")
                .replace('\'', "\\'"),
            serde_json::to_string(&self.args)
                .unwrap()
                .replace('\\', "\\\\")
                .replace('\'', "\\'"),
            lua_code
        );

        // Execute the wrapped code
        let result_and_this = runtime.execute_lua(&wrapped_code)?;

        // Extract result and __this from the returned table
        let result = result_and_this["result"].clone();
        let this_after_json = result_and_this["this"].clone();

        // Compare with original __this to see if it changed
        if this_after_json != flattened_this {
            // Extract only the property changes (not id/prototype_id)
            if let serde_json::Value::Object(after_map) = &this_after_json {
                let mut updates = serde_json::Map::new();
                let flattened_map = flattened_this.as_object().unwrap();

                for (key, value) in after_map {
                    // Skip metadata fields
                    if key == "id" || key == "prototype_id" {
                        continue;
                    }
                    // Only include changed or new properties
                    if flattened_map.get(key) != Some(value) {
                        updates.insert(key.clone(), value.clone());
                    }
                }

                // Persist changes if any
                if !updates.is_empty() {
                    crate::opcodes::opcode_update(
                        self.this.id,
                        serde_json::Value::Object(updates),
                        &self.storage,
                    )
                    .map_err(|e| {
                        crate::ExecutionError::Runtime(lotus_runtime_luajit::ExecutionError::Lua(
                            mlua::Error::external(e),
                        ))
                    })?;
                }
            }
        }

        Ok(result)
    }

    /// Inject game opcodes as Lua globals.
    fn inject_opcodes(&self, runtime: &LuaRuntime) -> Result<(), crate::ExecutionError> {
        let lua = runtime.lua();
        let storage = self.storage.clone();

        // entity opcode - get entity by ID (returns flattened props at top level)
        let storage_clone = storage.clone();
        let entity_fn = lua.create_function(move |lua_ctx, entity_id: i64| {
            let entity = crate::opcodes::opcode_entity(entity_id as EntityId, &storage_clone)
                .map_err(mlua::Error::external)?
                .ok_or_else(|| mlua::Error::external(format!("entity {} not found", entity_id)))?;
            // Flatten entity: { id, prototype_id, ...props } to match TypeScript behavior
            let mut result = serde_json::Map::new();
            result.insert("id".to_string(), serde_json::json!(entity.id));
            result.insert(
                "prototype_id".to_string(),
                serde_json::to_value(entity.prototype_id).unwrap(),
            );
            if let serde_json::Value::Object(props) = &entity.props {
                for (key, value) in props {
                    result.insert(key.clone(), value.clone());
                }
            }
            lua_ctx.to_value(&serde_json::Value::Object(result))
        })?;
        lua.globals().set("__bloom_entity", entity_fn)?;

        // verbs opcode - get all verbs defined on an entity
        let storage_clone = storage.clone();
        let verbs_fn = lua.create_function(move |lua_ctx, entity: mlua::Value| {
            // Convert entity to get ID
            let entity_json: serde_json::Value = lua_ctx.from_value(entity)?;
            let entity_id = entity_json["id"]
                .as_i64()
                .ok_or_else(|| mlua::Error::external("verbs: entity missing id"))?
                as EntityId;

            let storage = storage_clone.lock().unwrap();
            let verbs = storage
                .get_verbs(entity_id)
                .map_err(mlua::Error::external)?;

            // Return verbs as array of objects with name, id
            let verb_list: Vec<serde_json::Value> = verbs
                .iter()
                .map(|v| {
                    serde_json::json!({
                        "id": v.id,
                        "name": v.name,
                        "entity_id": v.entity_id,
                    })
                })
                .collect();

            lua_ctx.to_value(&verb_list)
        })?;
        lua.globals().set("__bloom_verbs", verbs_fn)?;

        // capability opcode - get capability by ID
        let storage_clone = storage.clone();
        let capability_fn = lua.create_function(move |lua_ctx, cap_id: mlua::Value| {
            // Handle nil or missing capability ID
            let cap_id_str = match cap_id {
                mlua::Value::String(s) => s.to_str()?.to_string(),
                mlua::Value::Number(n) => n.to_string(),
                mlua::Value::Integer(i) => i.to_string(),
                mlua::Value::Nil => {
                    return Err(mlua::Error::external(
                        "capability opcode: capability ID is nil (property may not exist on entity)"
                    ));
                }
                _ => {
                    return Err(mlua::Error::external(format!(
                        "capability opcode: expected string or number, got {:?}",
                        cap_id.type_name()
                    )));
                }
            };

            let storage = storage_clone.lock().unwrap();
            let cap = storage
                .get_capability(&cap_id_str)
                .map_err(mlua::Error::external)?
                .ok_or_else(|| {
                    mlua::Error::external(format!("capability not found: {}", cap_id_str))
                })?;

            // Return capability as an object with owner_id, type, params
            lua_ctx.to_value(&serde_json::json!({
                "id": cap.id,
                "owner_id": cap.owner_id,
                "type": cap.cap_type,
                "params": cap.params,
            }))
        })?;
        lua.globals().set("__bloom_capability", capability_fn)?;

        // update opcode - persist entity changes
        let storage_clone = storage.clone();
        let update_fn =
            lua.create_function(move |_lua_ctx, (entity_id, updates): (i64, mlua::Value)| {
                // Convert Lua value to serde_json::Value
                let updates_json: serde_json::Value = _lua_ctx.from_value(updates)?;
                crate::opcodes::opcode_update(entity_id as EntityId, updates_json, &storage_clone)
                    .map_err(mlua::Error::external)?;
                Ok(())
            })?;
        lua.globals().set("__bloom_update", update_fn)?;

        // create opcode - create new entity
        let storage_clone = storage.clone();
        let create_fn = lua.create_function(
            move |_lua_ctx, (props, prototype_id): (mlua::Value, Option<i64>)| {
                let props_json: serde_json::Value = _lua_ctx.from_value(props)?;
                let new_id = crate::opcodes::opcode_create(
                    props_json,
                    prototype_id.map(|id| id as EntityId),
                    &storage_clone,
                )
                .map_err(mlua::Error::external)?;
                Ok(new_id)
            },
        )?;
        lua.globals().set("__bloom_create", create_fn)?;

        // call opcode - call a verb on an entity
        let storage_clone = storage.clone();
        let scheduler_clone = self.scheduler.clone();
        let plugins_clone = self.plugins.clone();
        let caller_id = self.this.id;
        let call_fn = lua.create_function(
            move |lua_ctx, (target_entity, verb_name, args): (mlua::Value, String, mlua::Value)| {
                // Convert entity to get ID
                let target: serde_json::Value = lua_ctx.from_value(target_entity)?;
                let target_id = target["id"]
                    .as_i64()
                    .ok_or_else(|| mlua::Error::external("call: target entity missing id"))?
                    as EntityId;

                // Convert args array to Vec<serde_json::Value>
                let args_json: serde_json::Value = lua_ctx.from_value(args)?;
                let args_vec = match &args_json {
                    serde_json::Value::Array(arr) => arr.clone(),
                    // Empty table {} might be deserialized as object, treat as empty array
                    serde_json::Value::Object(obj) if obj.is_empty() => Vec::new(),
                    _ => return Err(mlua::Error::external("call: args must be an array")),
                };

                // Get entity and verb from storage
                let (target_entity_full, verb) = {
                    let storage = storage_clone.lock().unwrap();
                    let entity = storage
                        .get_entity(target_id)
                        .map_err(mlua::Error::external)?
                        .ok_or_else(|| {
                            mlua::Error::external(format!("call: entity {} not found", target_id))
                        })?;
                    let verb = storage
                        .get_verb(target_id, &verb_name)
                        .map_err(mlua::Error::external)?
                        .ok_or_else(|| {
                            mlua::Error::external(format!(
                                "call: verb '{}' not found on entity {}",
                                verb_name, target_id
                            ))
                        })?;

                    // Check capability requirement if verb has one
                    if let Some(ref required_cap) = verb.required_capability {
                        let caller_caps = storage
                            .get_capabilities(caller_id)
                            .map_err(mlua::Error::external)?;

                        let has_required = caller_caps.iter().any(|cap| {
                            // Check if capability type matches (exact or prefix for wildcards)
                            cap.cap_type == *required_cap
                                || (cap.cap_type.ends_with(".*")
                                    && required_cap
                                        .starts_with(&cap.cap_type[..cap.cap_type.len() - 2]))
                        });

                        if !has_required {
                            return Err(mlua::Error::external(format!(
                                "call: caller {} lacks required capability '{}' to call verb '{}' on entity {}",
                                caller_id, required_cap, verb_name, target_id
                            )));
                        }
                    }

                    (entity, verb)
                };

                // Create new execution context for the verb
                let ctx = ExecutionContext {
                    this: target_entity_full,
                    caller_id: Some(caller_id),
                    args: args_vec,
                    storage: storage_clone.clone(),
                    scheduler: scheduler_clone.clone(),
                    plugins: plugins_clone.clone(),
                };

                // Execute the verb
                let result = ctx.execute(&verb.code).map_err(mlua::Error::external)?;

                // Convert result back to Lua
                lua_ctx.to_value(&result)
            },
        )?;
        lua.globals().set("__bloom_call", call_fn)?;

        // schedule opcode - schedule a verb call for future execution
        let this_id = self.this.id;
        let scheduler_clone = self.scheduler.clone();
        let schedule_fn = lua.create_function(
            move |lua_ctx, (verb_name, args, delay_ms): (String, mlua::Value, i64)| {
                // Convert args to JSON
                let args_json: serde_json::Value = lua_ctx.from_value(args)?;

                // Schedule the task (block on async call since we're in sync context)
                let handle = tokio::runtime::Handle::current();
                handle
                    .block_on(async {
                        scheduler_clone
                            .schedule(this_id, &verb_name, args_json, delay_ms as u64)
                            .await
                    })
                    .map_err(mlua::Error::external)?;

                Ok(lua_ctx.null())
            },
        )?;
        lua.globals().set("__bloom_schedule", schedule_fn)?;

        // mint opcode - create new capability with authority
        let storage_clone = storage.clone();
        let this_id = self.this.id;
        let mint_fn = lua.create_function(
            move |lua_ctx, (authority, cap_type, params): (mlua::Value, String, mlua::Value)| {
                // Convert authority to capability ID
                let auth_json: serde_json::Value = lua_ctx.from_value(authority)?;
                let auth_id = auth_json["id"]
                    .as_str()
                    .ok_or_else(|| mlua::Error::external("mint: authority missing id"))?;

                // Validate authority
                let storage = storage_clone.lock().unwrap();
                let auth_cap = storage
                    .get_capability(auth_id)
                    .map_err(mlua::Error::external)?
                    .ok_or_else(|| mlua::Error::external("mint: authority capability not found"))?;

                if auth_cap.owner_id != this_id {
                    return Err(mlua::Error::external(
                        "mint: authority does not belong to this entity",
                    ));
                }

                if auth_cap.cap_type != "sys.mint" {
                    return Err(mlua::Error::external("mint: authority must be sys.mint"));
                }

                // Check namespace
                let allowed_ns = auth_cap
                    .params
                    .get("namespace")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        mlua::Error::external("mint: authority namespace must be string")
                    })?;

                if allowed_ns != "*" && !cap_type.starts_with(allowed_ns) {
                    return Err(mlua::Error::external(format!(
                        "mint: authority namespace '{}' does not cover '{}'",
                        allowed_ns, cap_type
                    )));
                }

                // Create new capability
                let params_json: serde_json::Value = lua_ctx.from_value(params)?;
                let new_id = storage
                    .create_capability(this_id, &cap_type, params_json)
                    .map_err(mlua::Error::external)?;

                // Return capability object
                let cap = storage
                    .get_capability(&new_id)
                    .map_err(mlua::Error::external)?
                    .ok_or_else(|| {
                        mlua::Error::external("mint: failed to retrieve new capability")
                    })?;

                lua_ctx.to_value(&serde_json::json!({
                    "id": cap.id,
                    "type": cap.cap_type,
                    "params": cap.params,
                }))
            },
        )?;
        lua.globals().set("__bloom_mint", mint_fn)?;

        // delegate opcode - create restricted version of a capability
        let storage_clone = storage.clone();
        let this_id = self.this.id;
        let delegate_fn = lua.create_function(move |lua_ctx, (parent_cap, restrictions): (mlua::Value, mlua::Value)| {
            // Convert parent capability
            let parent_json: serde_json::Value = lua_ctx.from_value(parent_cap)?;
            let parent_id = parent_json["id"].as_str()
                .ok_or_else(|| mlua::Error::external("delegate: parent capability missing id"))?;

            // Get parent capability from storage
            let storage = storage_clone.lock().unwrap();
            let parent = storage.get_capability(parent_id)
                .map_err(mlua::Error::external)?
                .ok_or_else(|| mlua::Error::external("delegate: parent capability not found"))?;

            // Verify ownership
            if parent.owner_id != this_id {
                return Err(mlua::Error::external("delegate: parent capability does not belong to this entity"));
            }

            // Convert restrictions
            let restrictions_json: serde_json::Value = lua_ctx.from_value(restrictions)?;
            let restrictions_obj = restrictions_json.as_object()
                .ok_or_else(|| mlua::Error::external("delegate: restrictions must be an object"))?;

            // Validate each restriction parameter
            for (key, child_value) in restrictions_obj {
                if let Some(parent_value) = parent.params.get(key) {
                    if !crate::capability_validation::is_valid_restriction(parent_value, child_value, key) {
                        return Err(mlua::Error::external(format!(
                            "delegate: invalid restriction for '{}': child value {:?} is not more restrictive than parent {:?}",
                            key, child_value, parent_value
                        )));
                    }
                } else {
                    // Child adds a new restriction not in parent - this is always valid (more restrictive)
                }
            }

            // Merge parameters: start with parent params, override with restrictions
            let mut merged_params = if let serde_json::Value::Object(map) = &parent.params {
                map.clone()
            } else {
                serde_json::Map::new()
            };

            for (key, value) in restrictions_obj {
                merged_params.insert(key.clone(), value.clone());
            }

            // Create new capability with same type but restricted params
            let new_id = storage.create_capability(this_id, &parent.cap_type, serde_json::Value::Object(merged_params.clone()))
                .map_err(mlua::Error::external)?;

            // Return capability object
            let cap = storage.get_capability(&new_id)
                .map_err(mlua::Error::external)?
                .ok_or_else(|| mlua::Error::external("delegate: failed to retrieve new capability"))?;

            lua_ctx.to_value(&serde_json::json!({
                "id": cap.id,
                "type": cap.cap_type,
                "params": cap.params,
            }))
        })?;
        lua.globals().set("__bloom_delegate", delegate_fn)?;

        // Store this_id in globals for plugins to access
        lua.globals().set("__bloom_this_id", self.this.id)?;

        // Register all cdylib plugin functions (fs, memory, etc.) as Lua globals
        // Each "foo.bar" function becomes "__bloom_foo_bar" global
        unsafe {
            runtime.with_state(|lua_state| {
                crate::plugin_registry::register_all_to_lua(lua_state);
            });
        }

        // sqlite.query opcode - execute SQL query with capability
        let this_id = self.this.id;
        let sqlite_query_fn = lua.create_function(
            move |lua_ctx,
                  (capability, db_path, query, params): (
                mlua::Value,
                String,
                String,
                mlua::Value,
            )| {
                let cap_json: serde_json::Value = lua_ctx.from_value(capability)?;
                let params_json: serde_json::Value = lua_ctx.from_value(params)?;
                let params_array = params_json
                    .as_array()
                    .ok_or_else(|| mlua::Error::external("sqlite.query params must be an array"))?;

                let results = lotus_plugin_sqlite::sqlite_query(
                    &cap_json,
                    this_id,
                    &db_path,
                    &query,
                    params_array,
                )
                .map_err(mlua::Error::external)?;
                lua_ctx.to_value(&results)
            },
        )?;
        lua.globals().set("__bloom_sqlite_query", sqlite_query_fn)?;

        // sqlite.execute opcode - execute SQL statement with capability
        let this_id = self.this.id;
        let sqlite_execute_fn = lua.create_function(
            move |lua_ctx,
                  (capability, db_path, query, params): (
                mlua::Value,
                String,
                String,
                mlua::Value,
            )| {
                let cap_json: serde_json::Value = lua_ctx.from_value(capability)?;
                let params_json: serde_json::Value = lua_ctx.from_value(params)?;
                let params_array = params_json.as_array().ok_or_else(|| {
                    mlua::Error::external("sqlite.execute params must be an array")
                })?;

                let rows_affected = lotus_plugin_sqlite::sqlite_execute(
                    &cap_json,
                    this_id,
                    &db_path,
                    &query,
                    params_array,
                )
                .map_err(mlua::Error::external)?;
                Ok(rows_affected)
            },
        )?;
        lua.globals()
            .set("__bloom_sqlite_execute", sqlite_execute_fn)?;

        // net.get opcode - HTTP GET request with capability
        let this_id = self.this.id;
        let net_get_fn = lua.create_function(
            move |lua_ctx, (capability, url, headers): (mlua::Value, String, mlua::Value)| {
                let cap_json: serde_json::Value = lua_ctx.from_value(capability)?;
                let headers_json: serde_json::Value = lua_ctx.from_value(headers)?;
                let headers_map: std::collections::HashMap<String, String> =
                    serde_json::from_value(headers_json).map_err(|e| {
                        mlua::Error::external(format!("net.get: invalid headers: {}", e))
                    })?;

                // Block on async operation
                let result = tokio::runtime::Handle::try_current()
                    .map_err(|_| mlua::Error::external("net.get: no tokio runtime found"))?
                    .block_on(lotus_plugin_net::net_get(
                        &cap_json,
                        this_id,
                        &url,
                        headers_map,
                    ))
                    .map_err(mlua::Error::external)?;

                lua_ctx.to_value(&result)
            },
        )?;
        lua.globals().set("__bloom_net_get", net_get_fn)?;

        // net.post opcode - HTTP POST request with capability
        let this_id = self.this.id;
        let net_post_fn =
            lua.create_function(
                move |lua_ctx,
                      (capability, url, headers, body): (
                    mlua::Value,
                    String,
                    mlua::Value,
                    String,
                )| {
                    let cap_json: serde_json::Value = lua_ctx.from_value(capability)?;
                    let headers_json: serde_json::Value = lua_ctx.from_value(headers)?;
                    let headers_map: std::collections::HashMap<String, String> =
                        serde_json::from_value(headers_json).map_err(|e| {
                            mlua::Error::external(format!("net.post: invalid headers: {}", e))
                        })?;

                    // Block on async operation
                    let result = tokio::runtime::Handle::try_current()
                        .map_err(|_| mlua::Error::external("net.post: no tokio runtime found"))?
                        .block_on(lotus_plugin_net::net_post(
                            &cap_json,
                            this_id,
                            &url,
                            headers_map,
                            &body,
                        ))
                        .map_err(mlua::Error::external)?;

                    lua_ctx.to_value(&result)
                },
            )?;
        lua.globals().set("__bloom_net_post", net_post_fn)?;

        // vector.insert opcode - insert vector embedding with capability
        let this_id = self.this.id;
        let vector_insert_fn = lua.create_function(
            move |lua_ctx,
                  (capability, db_path, key, embedding, metadata): (
                mlua::Value,
                String,
                String,
                mlua::Value,
                mlua::Value,
            )| {
                let cap_json: serde_json::Value = lua_ctx.from_value(capability)?;
                let embedding_json: serde_json::Value = lua_ctx.from_value(embedding)?;
                let metadata_json: serde_json::Value = lua_ctx.from_value(metadata)?;

                let embedding_array = embedding_json.as_array().ok_or_else(|| {
                    mlua::Error::external("vector.insert: embedding must be an array")
                })?;
                let embedding_f32: Vec<f32> = embedding_array
                    .iter()
                    .map(|v| v.as_f64().unwrap_or(0.0) as f32)
                    .collect();

                let id = lotus_plugin_vector::vector_insert(
                    &cap_json,
                    this_id,
                    &db_path,
                    &key,
                    &embedding_f32,
                    &metadata_json,
                )
                .map_err(mlua::Error::external)?;
                Ok(id)
            },
        )?;
        lua.globals()
            .set("__bloom_vector_insert", vector_insert_fn)?;

        // vector.search opcode - search for similar vectors with capability
        let this_id = self.this.id;
        let vector_search_fn = lua.create_function(
            move |lua_ctx,
                  (capability, db_path, query_embedding, limit): (
                mlua::Value,
                String,
                mlua::Value,
                i64,
            )| {
                let cap_json: serde_json::Value = lua_ctx.from_value(capability)?;
                let embedding_json: serde_json::Value = lua_ctx.from_value(query_embedding)?;

                let embedding_array = embedding_json.as_array().ok_or_else(|| {
                    mlua::Error::external("vector.search: embedding must be an array")
                })?;
                let embedding_f32: Vec<f32> = embedding_array
                    .iter()
                    .map(|v| v.as_f64().unwrap_or(0.0) as f32)
                    .collect();

                let results = lotus_plugin_vector::vector_search(
                    &cap_json,
                    this_id,
                    &db_path,
                    &embedding_f32,
                    limit as usize,
                )
                .map_err(mlua::Error::external)?;
                lua_ctx.to_value(&results)
            },
        )?;
        lua.globals()
            .set("__bloom_vector_search", vector_search_fn)?;

        // vector.delete opcode - delete vector by key with capability
        let this_id = self.this.id;
        let vector_delete_fn = lua.create_function(
            move |lua_ctx, (capability, db_path, key): (mlua::Value, String, String)| {
                let cap_json: serde_json::Value = lua_ctx.from_value(capability)?;

                let rows_affected =
                    lotus_plugin_vector::vector_delete(&cap_json, this_id, &db_path, &key)
                        .map_err(mlua::Error::external)?;
                Ok(rows_affected)
            },
        )?;
        lua.globals()
            .set("__bloom_vector_delete", vector_delete_fn)?;

        // ai.generate_text opcode - LLM text generation with capability
        let this_id = self.this.id;
        let ai_generate_text_fn = lua.create_function(
            move |lua_ctx,
                  (capability, provider, model, prompt, options): (
                mlua::Value,
                String,
                String,
                String,
                mlua::Value,
            )| {
                let cap_json: serde_json::Value = lua_ctx.from_value(capability)?;
                let options_json: serde_json::Value = lua_ctx.from_value(options)?;

                // Block on async operation
                let result = tokio::runtime::Handle::try_current()
                    .map_err(|_| mlua::Error::external("ai.generate_text: no tokio runtime found"))?
                    .block_on(lotus_plugin_ai::ai_generate_text(
                        &cap_json,
                        this_id,
                        &provider,
                        &model,
                        &prompt,
                        &options_json,
                    ))
                    .map_err(mlua::Error::external)?;

                Ok(result)
            },
        )?;
        lua.globals()
            .set("__bloom_ai_generate_text", ai_generate_text_fn)?;

        // ai.embed opcode - generate embeddings with capability
        let this_id = self.this.id;
        let ai_embed_fn =
            lua.create_function(
                move |lua_ctx,
                      (capability, provider, model, text): (
                    mlua::Value,
                    String,
                    String,
                    String,
                )| {
                    let cap_json: serde_json::Value = lua_ctx.from_value(capability)?;

                    // Block on async operation
                    let result = tokio::runtime::Handle::try_current()
                        .map_err(|_| mlua::Error::external("ai.embed: no tokio runtime found"))?
                        .block_on(lotus_plugin_ai::ai_embed(
                            &cap_json, this_id, &provider, &model, &text,
                        ))
                        .map_err(mlua::Error::external)?;

                    lua_ctx.to_value(&result)
                },
            )?;
        lua.globals().set("__bloom_ai_embed", ai_embed_fn)?;

        // ai.chat opcode - chat completion with message history
        let this_id = self.this.id;
        let ai_chat_fn = lua.create_function(
            move |lua_ctx,
                  (capability, provider, model, messages, options): (
                mlua::Value,
                String,
                String,
                mlua::Value,
                mlua::Value,
            )| {
                let cap_json: serde_json::Value = lua_ctx.from_value(capability)?;
                let messages_json: serde_json::Value = lua_ctx.from_value(messages)?;
                let options_json: serde_json::Value = lua_ctx.from_value(options)?;

                let messages_array = messages_json
                    .as_array()
                    .ok_or_else(|| mlua::Error::external("ai.chat: messages must be an array"))?;

                // Block on async operation
                let result = tokio::runtime::Handle::try_current()
                    .map_err(|_| mlua::Error::external("ai.chat: no tokio runtime found"))?
                    .block_on(lotus_plugin_ai::ai_chat(
                        &cap_json,
                        this_id,
                        &provider,
                        &model,
                        messages_array,
                        &options_json,
                    ))
                    .map_err(mlua::Error::external)?;

                Ok(result)
            },
        )?;
        lua.globals().set("__bloom_ai_chat", ai_chat_fn)?;

        // Register procgen plugin opcodes (if loaded)
        let plugins = self.plugins.lock().unwrap();
        if plugins.get_plugin("procgen").is_some() {
            unsafe {
                // Get function pointers
                let seed_fn: extern "C" fn(u64) = plugins
                    .get_function_ptr("procgen", b"procgen_seed")
                    .map_err(mlua::Error::external)?;
                let noise_fn: extern "C" fn(f64, f64) -> f64 = plugins
                    .get_function_ptr("procgen", b"procgen_noise")
                    .map_err(mlua::Error::external)?;
                let random_fn: extern "C" fn() -> f64 = plugins
                    .get_function_ptr("procgen", b"procgen_random")
                    .map_err(mlua::Error::external)?;
                let random_range_fn: extern "C" fn(f64, f64) -> f64 = plugins
                    .get_function_ptr("procgen", b"procgen_random_range")
                    .map_err(mlua::Error::external)?;
                let between_fn: extern "C" fn(i64, i64) -> i64 = plugins
                    .get_function_ptr("procgen", b"procgen_between")
                    .map_err(mlua::Error::external)?;

                // Register Lua functions
                lua.globals().set(
                    "__bloom_procgen_seed",
                    lua.create_function(move |_, seed: u64| {
                        seed_fn(seed);
                        Ok(())
                    })?,
                )?;

                lua.globals().set(
                    "__bloom_procgen_noise",
                    lua.create_function(move |_, (x, y): (f64, f64)| Ok(noise_fn(x, y)))?,
                )?;

                lua.globals().set(
                    "__bloom_procgen_random",
                    lua.create_function(move |_, ()| Ok(random_fn()))?,
                )?;

                lua.globals().set(
                    "__bloom_procgen_random_range",
                    lua.create_function(move |_, (min, max): (f64, f64)| {
                        Ok(random_range_fn(min, max))
                    })?,
                )?;

                lua.globals().set(
                    "__bloom_procgen_between",
                    lua.create_function(move |_, (min, max): (i64, i64)| Ok(between_fn(min, max)))?,
                )?;
            }
        }
        drop(plugins); // Release lock

        Ok(())
    }

    /// Flatten an entity's props to match TypeScript behavior.
    /// Returns: { id, prototype_id, ...props }
    fn flatten_entity(&self, entity: &Entity) -> serde_json::Value {
        let mut result = serde_json::Map::new();
        result.insert("id".to_string(), serde_json::json!(entity.id));
        result.insert(
            "prototype_id".to_string(),
            serde_json::to_value(entity.prototype_id).unwrap(),
        );

        // Merge props
        if let serde_json::Value::Object(props) = &entity.props {
            for (key, value) in props {
                result.insert(key.clone(), value.clone());
            }
        }

        serde_json::Value::Object(result)
    }
}
