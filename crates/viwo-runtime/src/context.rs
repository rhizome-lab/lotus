//! Execution context for running scripts with access to storage.

use std::sync::Arc;
use tokio::sync::Mutex;
use viwo_core::{Entity, EntityId, WorldStorage};
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
}

impl ExecutionContext {
    /// Execute an S-expression in this context.
    pub async fn execute(&self, expr: &SExpr) -> Result<serde_json::Value, crate::ExecutionError> {
        // Create a Lua runtime
        let runtime = LuaRuntime::new()?;

        // TODO: Inject kernel functions as Lua globals
        // This requires mlua async support or blocking calls
        // For now, kernel functions need to be compiled into the generated Lua

        // Compile to Lua code first
        let lua_code = viwo_runtime_luajit::compile(expr)?;

        // Wrap in function that sets up context variables
        // Use json.decode to parse the JSON strings
        let wrapped_code = format!(
            r#"
local __this = json.decode('{}')
local __caller = json.decode('{}')
local __args = json.decode('{}')
{}
"#,
            serde_json::to_string(&self.this).unwrap().replace('\\', "\\\\").replace('\'', "\\'"),
            serde_json::to_string(&self.caller_id).unwrap().replace('\\', "\\\\").replace('\'', "\\'"),
            serde_json::to_string(&self.args).unwrap().replace('\\', "\\\\").replace('\'', "\\'"),
            lua_code
        );

        // Execute the wrapped code
        let result = runtime.execute_lua(&wrapped_code)?;
        Ok(result)
    }
}
