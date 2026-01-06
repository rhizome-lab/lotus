//! Integrated runtime for Viwo combining storage and script execution.

use std::sync::{Arc, Mutex};
use tokio::sync::Mutex as TokioMutex;
use viwo_core::{EntityId, WorldStorage};

pub mod capability_validation;
pub mod context;
pub mod kernel;
pub mod opcodes;
pub mod plugin_loader;
pub mod plugin_registry;

pub use context::ExecutionContext;
pub use kernel::KernelOps;
pub use plugin_registry::init_registry;

/// The main Viwo runtime.
pub struct ViwoRuntime {
    storage: Arc<Mutex<WorldStorage>>,
    scheduler_storage: Arc<TokioMutex<WorldStorage>>,
    scheduler: Arc<viwo_core::Scheduler>,
    plugins: Arc<Mutex<plugin_loader::PluginRegistry>>,
}

impl ViwoRuntime {
    /// Create a new runtime from a database path.
    pub fn open(db_path: &str) -> Result<Self, viwo_core::StorageError> {
        Self::open_with_interval(db_path, 100)
    }

    /// Create a new runtime with a custom scheduler interval.
    pub fn open_with_interval(db_path: &str, interval_ms: u64) -> Result<Self, viwo_core::StorageError> {
        // Initialize plugin registry
        plugin_registry::init_registry();

        // Open two connections: one for sync operations, one for async scheduler
        let storage = WorldStorage::open(db_path)?;
        let scheduler_storage = WorldStorage::open(db_path)?;

        let storage = Arc::new(Mutex::new(storage));
        let scheduler_storage = Arc::new(TokioMutex::new(scheduler_storage));
        let scheduler = Arc::new(viwo_core::Scheduler::new(scheduler_storage.clone(), interval_ms));
        let plugins = Arc::new(Mutex::new(plugin_loader::PluginRegistry::new()));

        Ok(Self { storage, scheduler_storage, scheduler, plugins })
    }

    /// Create a new runtime with the given storage (legacy API).
    #[deprecated(note = "Use ViwoRuntime::open() instead")]
    pub fn new(storage: WorldStorage) -> Self {
        // Initialize plugin registry
        plugin_registry::init_registry();

        // This is a workaround - we can't open a second connection without the path
        // So we just use in-memory for the scheduler storage
        let scheduler_storage = WorldStorage::in_memory().expect("Failed to create in-memory storage");

        let storage = Arc::new(Mutex::new(storage));
        let scheduler_storage = Arc::new(TokioMutex::new(scheduler_storage));
        let scheduler = Arc::new(viwo_core::Scheduler::new(scheduler_storage.clone(), 100));
        let plugins = Arc::new(Mutex::new(plugin_loader::PluginRegistry::new()));

        Self { storage, scheduler_storage, scheduler, plugins }
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
