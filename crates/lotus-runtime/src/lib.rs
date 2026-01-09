//! Integrated runtime for Lotus combining storage and script execution.

use rhizome_lotus_core::{EntityId, WorldStorage};
use std::sync::{Arc, Mutex};
use tokio::sync::Mutex as TokioMutex;

pub mod capability_validation;
pub mod context;
pub mod kernel;
pub mod opcodes;
pub mod plugin_loader;
pub mod plugin_registry;

pub use context::ExecutionContext;
pub use kernel::KernelOps;
pub use plugin_registry::{get_registered_opcodes, init_registry};

/// The main Lotus runtime.
pub struct LotusRuntime {
    storage: Arc<Mutex<WorldStorage>>,
    scheduler_storage: Arc<TokioMutex<WorldStorage>>,
    scheduler: Arc<rhizome_lotus_core::Scheduler>,
    plugins: Arc<Mutex<plugin_loader::PluginRegistry>>,
}

impl LotusRuntime {
    /// Create a new runtime from a database path.
    pub fn open(db_path: &str) -> Result<Self, rhizome_lotus_core::StorageError> {
        Self::open_with_interval(db_path, 100)
    }

    /// Create a new runtime with a custom scheduler interval.
    pub fn open_with_interval(
        db_path: &str,
        interval_ms: u64,
    ) -> Result<Self, rhizome_lotus_core::StorageError> {
        // Initialize plugin registry
        plugin_registry::init_registry();

        // Open two connections: one for sync operations, one for async scheduler
        let storage = WorldStorage::open(db_path)?;
        let scheduler_storage = WorldStorage::open(db_path)?;

        let storage = Arc::new(Mutex::new(storage));
        let scheduler_storage = Arc::new(TokioMutex::new(scheduler_storage));
        let scheduler = Arc::new(rhizome_lotus_core::Scheduler::new(
            scheduler_storage.clone(),
            interval_ms,
        ));
        let plugins = Arc::new(Mutex::new(plugin_loader::PluginRegistry::new()));

        Ok(Self {
            storage,
            scheduler_storage,
            scheduler,
            plugins,
        })
    }

    /// Create a new runtime with the given storage (legacy API).
    #[deprecated(note = "Use LotusRuntime::open() instead")]
    pub fn new(storage: WorldStorage) -> Self {
        // Initialize plugin registry
        plugin_registry::init_registry();

        // This is a workaround - we can't open a second connection without the path
        // So we just use in-memory for the scheduler storage
        let scheduler_storage =
            WorldStorage::in_memory().expect("Failed to create in-memory storage");

        let storage = Arc::new(Mutex::new(storage));
        let scheduler_storage = Arc::new(TokioMutex::new(scheduler_storage));
        let scheduler = Arc::new(rhizome_lotus_core::Scheduler::new(
            scheduler_storage.clone(),
            100,
        ));
        let plugins = Arc::new(Mutex::new(plugin_loader::PluginRegistry::new()));

        Self {
            storage,
            scheduler_storage,
            scheduler,
            plugins,
        }
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
    pub fn scheduler(&self) -> &Arc<rhizome_lotus_core::Scheduler> {
        &self.scheduler
    }

    /// Execute a verb on an entity.
    ///
    /// All mutations within the verb execution are wrapped in a transaction.
    /// If execution fails, all changes are rolled back atomically.
    pub fn execute_verb(
        &self,
        entity_id: EntityId,
        verb_name: &str,
        args: Vec<serde_json::Value>,
        caller_id: Option<EntityId>,
    ) -> Result<serde_json::Value, ExecutionError> {
        // Start transaction before any operations
        {
            let mut storage = self.storage.lock().unwrap();
            storage.begin_transaction()?;
        }

        // Execute verb with automatic commit/rollback
        let result = self.execute_verb_inner(entity_id, verb_name, args, caller_id);

        // Commit or rollback based on result
        {
            let mut storage = self.storage.lock().unwrap();
            if result.is_ok() {
                storage.commit()?;
            } else {
                // Ignore rollback errors - the original error is more important
                let _ = storage.rollback();
            }
        }

        result
    }

    /// Internal verb execution (without transaction handling).
    fn execute_verb_inner(
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
    Storage(#[from] rhizome_lotus_core::StorageError),

    #[error("lua error: {0}")]
    Lua(#[from] mlua::Error),

    #[error("runtime error: {0}")]
    Runtime(#[from] rhizome_lotus_runtime_luajit::ExecutionError),

    #[error("compile error: {0}")]
    Compile(#[from] rhizome_lotus_runtime_luajit::CompileError),

    #[error("entity not found: {0}")]
    EntityNotFound(EntityId),

    #[error("verb '{1}' not found on entity {0}")]
    VerbNotFound(EntityId, String),
}
