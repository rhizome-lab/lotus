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

        // TODO: Inject kernel functions into Lua globals
        // - send(type, payload)
        // - entity(id)
        // - get_capability(type, filter)
        // - etc.

        // Execute the S-expression
        let result = runtime.execute(expr)?;
        Ok(result)
    }
}
