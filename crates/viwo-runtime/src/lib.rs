//! Integrated runtime for Viwo combining storage and script execution.

use std::sync::{Arc, Mutex};
use viwo_core::{EntityId, WorldStorage};

pub mod capability_validation;
pub mod context;
pub mod kernel;
pub mod opcodes;
pub mod plugin_loader;

pub use context::ExecutionContext;
pub use kernel::KernelOps;

/// The main Viwo runtime.
pub struct ViwoRuntime {
    storage: Arc<Mutex<WorldStorage>>,
    scheduler: Arc<viwo_core::Scheduler>,
    plugins: Arc<Mutex<plugin_loader::PluginRegistry>>,
}

impl ViwoRuntime {
    /// Create a new runtime with the given storage.
    pub fn new(storage: WorldStorage) -> Self {
        let storage = Arc::new(Mutex::new(storage));
        let scheduler = Arc::new(viwo_core::Scheduler::new(storage.clone()));
        let plugins = Arc::new(Mutex::new(plugin_loader::PluginRegistry::new()));

        Self { storage, scheduler, plugins }
    }

    /// Load a plugin from a dynamic library
    pub fn load_plugin(&self, path: impl AsRef<std::path::Path>, name: &str) -> Result<(), String> {
        let mut plugins = self.plugins.lock().unwrap();
        plugins.load_plugin(path, name)
    }

    /// Get reference to plugin registry
    pub fn plugins(&self) -> &Arc<Mutex<plugin_loader::PluginRegistry>> {
        &self.plugins
    }

    /// Get a reference to the storage.
    pub fn storage(&self) -> &Arc<Mutex<WorldStorage>> {
        &self.storage
    }

    /// Get a reference to the scheduler.
    pub fn scheduler(&self) -> &Arc<viwo_core::Scheduler> {
        &self.scheduler
    }

    /// Execute a verb on an entity.
    pub fn execute_verb(
        &self,
        entity_id: EntityId,
        verb_name: &str,
        args: Vec<serde_json::Value>,
        caller_id: Option<EntityId>,
    ) -> Result<serde_json::Value, ExecutionError> {
        // Get entity and verb from storage
        let (entity, verb) = {
            let storage = self.storage.lock().unwrap();
            let entity = storage
                .get_entity(entity_id)?
                .ok_or(ExecutionError::EntityNotFound(entity_id))?;
            let verb = storage
                .get_verb(entity_id, verb_name)?
                .ok_or_else(|| ExecutionError::VerbNotFound(entity_id, verb_name.to_string()))?;
            (entity, verb)
        };

        // Create execution context
        let ctx = ExecutionContext {
            this: entity,
            caller_id: caller_id.or(Some(entity_id)),
            args,
            storage: self.storage.clone(),
            scheduler: self.scheduler.clone(),
            plugins: self.plugins.clone(),
        };

        // Execute in Lua
        ctx.execute(&verb.code)
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ExecutionError {
    #[error("storage error: {0}")]
    Storage(#[from] viwo_core::StorageError),

    #[error("lua error: {0}")]
    Lua(#[from] mlua::Error),

    #[error("runtime error: {0}")]
    Runtime(#[from] viwo_runtime_luajit::ExecutionError),

    #[error("compile error: {0}")]
    Compile(#[from] viwo_runtime_luajit::CompileError),

    #[error("entity not found: {0}")]
    EntityNotFound(EntityId),

    #[error("verb '{1}' not found on entity {0}")]
    VerbNotFound(EntityId, String),
}
