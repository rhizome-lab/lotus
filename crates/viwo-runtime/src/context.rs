//! Execution context for running scripts with access to storage.

use std::sync::{Arc, Mutex};
use mlua::LuaSerdeExt;
use viwo_core::{Entity, EntityId, WorldStorage, Scheduler};
use viwo_ir::SExpr;
use viwo_runtime_luajit::Runtime as LuaRuntime;

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
}

impl ExecutionContext {
    /// Execute an S-expression in this context.
    pub fn execute(&self, expr: &SExpr) -> Result<serde_json::Value, crate::ExecutionError> {
        // Create a Lua runtime
        let runtime = LuaRuntime::new()?;

        // Inject game opcodes as Lua globals
        self.inject_opcodes(&runtime)?;

        // Compile to Lua code first
        let lua_code = viwo_runtime_luajit::compile(expr)?;

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
            serde_json::to_string(&flattened_this).unwrap().replace('\\', "\\\\").replace('\'', "\\'"),
            serde_json::to_string(&self.caller_id).unwrap().replace('\\', "\\\\").replace('\'', "\\'"),
            serde_json::to_string(&self.args).unwrap().replace('\\', "\\\\").replace('\'', "\\'"),
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
                        &self.storage
                    ).map_err(|e| crate::ExecutionError::Runtime(
                        viwo_runtime_luajit::ExecutionError::Lua(mlua::Error::external(e))
                    ))?;
                }
            }
        }

        Ok(result)
    }

    /// Inject game opcodes as Lua globals.
    fn inject_opcodes(&self, runtime: &LuaRuntime) -> Result<(), crate::ExecutionError> {
        let lua = runtime.lua();
        let storage = self.storage.clone();

        // entity opcode - get entity by ID
        let storage_clone = storage.clone();
        let entity_fn = lua.create_function(move |lua_ctx, entity_id: i64| {
            let entity = crate::opcodes::opcode_entity(entity_id as EntityId, &storage_clone)
                .map_err(mlua::Error::external)?;
            lua_ctx.to_value(&entity)
        })?;
        lua.globals().set("__viwo_entity", entity_fn)?;

        // update opcode - persist entity changes
        let storage_clone = storage.clone();
        let update_fn = lua.create_function(move |_lua_ctx, (entity_id, updates): (i64, mlua::Value)| {
            // Convert Lua value to serde_json::Value
            let updates_json: serde_json::Value = _lua_ctx.from_value(updates)?;
            crate::opcodes::opcode_update(entity_id as EntityId, updates_json, &storage_clone)
                .map_err(mlua::Error::external)?;
            Ok(())
        })?;
        lua.globals().set("__viwo_update", update_fn)?;

        // create opcode - create new entity
        let storage_clone = storage.clone();
        let create_fn = lua.create_function(move |_lua_ctx, (props, prototype_id): (mlua::Value, Option<i64>)| {
            let props_json: serde_json::Value = _lua_ctx.from_value(props)?;
            let new_id = crate::opcodes::opcode_create(
                props_json,
                prototype_id.map(|id| id as EntityId),
                &storage_clone
            ).map_err(mlua::Error::external)?;
            Ok(new_id)
        })?;
        lua.globals().set("__viwo_create", create_fn)?;

        // call opcode - call a verb on an entity
        let storage_clone = storage.clone();
        let scheduler_clone = self.scheduler.clone();
        let caller_id = self.this.id;
        let call_fn = lua.create_function(move |lua_ctx, (target_entity, verb_name, args): (mlua::Value, String, mlua::Value)| {
            // Convert entity to get ID
            let target: serde_json::Value = lua_ctx.from_value(target_entity)?;
            let target_id = target["id"].as_i64()
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
                let entity = storage.get_entity(target_id)
                    .map_err(mlua::Error::external)?
                    .ok_or_else(|| mlua::Error::external(format!("call: entity {} not found", target_id)))?;
                let verb = storage.get_verb(target_id, &verb_name)
                    .map_err(mlua::Error::external)?
                    .ok_or_else(|| mlua::Error::external(format!("call: verb '{}' not found on entity {}", verb_name, target_id)))?;
                (entity, verb)
            };

            // Create new execution context for the verb
            let ctx = ExecutionContext {
                this: target_entity_full,
                caller_id: Some(caller_id),
                args: args_vec,
                storage: storage_clone.clone(),
                scheduler: scheduler_clone.clone(),
            };

            // Execute the verb
            let result = ctx.execute(&verb.code)
                .map_err(mlua::Error::external)?;

            // Convert result back to Lua
            lua_ctx.to_value(&result)
        })?;
        lua.globals().set("__viwo_call", call_fn)?;

        // schedule opcode - schedule a verb call for future execution
        let this_id = self.this.id;
        let scheduler_clone = self.scheduler.clone();
        let schedule_fn = lua.create_function(move |lua_ctx, (verb_name, args, delay_ms): (String, mlua::Value, i64)| {
            // Convert args to JSON
            let args_json: serde_json::Value = lua_ctx.from_value(args)?;

            // Schedule the task
            scheduler_clone.schedule(this_id, &verb_name, args_json, delay_ms)
                .map_err(mlua::Error::external)?;

            Ok(lua_ctx.null())
        })?;
        lua.globals().set("__viwo_schedule", schedule_fn)?;

        // mint opcode - create new capability with authority
        let storage_clone = storage.clone();
        let this_id = self.this.id;
        let mint_fn = lua.create_function(move |lua_ctx, (authority, cap_type, params): (mlua::Value, String, mlua::Value)| {
            // Convert authority to capability ID
            let auth_json: serde_json::Value = lua_ctx.from_value(authority)?;
            let auth_id = auth_json["id"].as_str()
                .ok_or_else(|| mlua::Error::external("mint: authority missing id"))?;

            // Validate authority
            let storage = storage_clone.lock().unwrap();
            let auth_cap = storage.get_capability(auth_id)
                .map_err(mlua::Error::external)?
                .ok_or_else(|| mlua::Error::external("mint: authority capability not found"))?;

            if auth_cap.owner_id != this_id {
                return Err(mlua::Error::external("mint: authority does not belong to this entity"));
            }

            if auth_cap.cap_type != "sys.mint" {
                return Err(mlua::Error::external("mint: authority must be sys.mint"));
            }

            // Check namespace
            let allowed_ns = auth_cap.params.get("namespace")
                .and_then(|v| v.as_str())
                .ok_or_else(|| mlua::Error::external("mint: authority namespace must be string"))?;

            if allowed_ns != "*" && !cap_type.starts_with(allowed_ns) {
                return Err(mlua::Error::external(format!(
                    "mint: authority namespace '{}' does not cover '{}'",
                    allowed_ns, cap_type
                )));
            }

            // Create new capability
            let params_json: serde_json::Value = lua_ctx.from_value(params)?;
            let new_id = storage.create_capability(this_id, &cap_type, params_json)
                .map_err(mlua::Error::external)?;

            // Return capability object
            let cap = storage.get_capability(&new_id)
                .map_err(mlua::Error::external)?
                .ok_or_else(|| mlua::Error::external("mint: failed to retrieve new capability"))?;

            lua_ctx.to_value(&serde_json::json!({
                "id": cap.id,
                "type": cap.cap_type,
                "params": cap.params,
            }))
        })?;
        lua.globals().set("__viwo_mint", mint_fn)?;

        Ok(())
    }

    /// Flatten an entity's props to match TypeScript behavior.
    /// Returns: { id, prototype_id, ...props }
    fn flatten_entity(&self, entity: &Entity) -> serde_json::Value {
        let mut result = serde_json::Map::new();
        result.insert("id".to_string(), serde_json::json!(entity.id));
        result.insert("prototype_id".to_string(), serde_json::to_value(entity.prototype_id).unwrap());

        // Merge props
        if let serde_json::Value::Object(props) = &entity.props {
            for (key, value) in props {
                result.insert(key.clone(), value.clone());
            }
        }

        serde_json::Value::Object(result)
    }
}
