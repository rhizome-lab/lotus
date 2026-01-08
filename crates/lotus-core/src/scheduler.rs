//! Task scheduler for delayed verb execution.
//!
//! The scheduler manages tasks stored in the database and executes them
//! when their scheduled time arrives. Tasks are persisted to survive restarts.

use crate::{StorageError, WorldStorage};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use thiserror::Error;
use tokio::sync::Mutex;
use tokio::time;

#[derive(Debug, Error)]
pub enum SchedulerError {
    #[error("Storage error: {0}")]
    Storage(#[from] StorageError),

    #[error("Task execution error: {0}")]
    Execution(String),
}

// Re-export ScheduledTask from storage for convenience
pub use crate::storage::ScheduledTask;

/// Task scheduler that executes verbs after a delay.
pub struct Scheduler {
    storage: Arc<Mutex<WorldStorage>>,
    interval_ms: u64,
}

impl Scheduler {
    /// Create a new scheduler.
    ///
    /// # Arguments
    /// * `storage` - Shared world storage
    /// * `interval_ms` - How often to check for due tasks (in milliseconds)
    pub fn new(storage: Arc<Mutex<WorldStorage>>, interval_ms: u64) -> Self {
        Self {
            storage,
            interval_ms,
        }
    }

    /// Schedule a task to execute after a delay.
    ///
    /// # Arguments
    /// * `entity_id` - Entity to execute the verb on
    /// * `verb` - Name of the verb to execute
    /// * `args` - Arguments to pass to the verb (as JSON Value)
    /// * `delay_ms` - Delay in milliseconds before execution
    pub async fn schedule(
        &self,
        entity_id: i64,
        verb: &str,
        args: serde_json::Value,
        delay_ms: u64,
    ) -> Result<i64, SchedulerError> {
        let execute_at = (current_time_ms() + delay_ms) as i64;
        let storage = self.storage.lock().await;
        let task_id = storage.schedule_task(entity_id, verb, args, execute_at)?;
        Ok(task_id)
    }

    /// Get all tasks that are due for execution.
    async fn get_due_tasks(&self) -> Result<Vec<ScheduledTask>, SchedulerError> {
        let now = current_time_ms() as i64;
        let storage = self.storage.lock().await;
        let tasks = storage.get_due_tasks(now)?;
        Ok(tasks)
    }

    /// Delete a task from the database.
    async fn delete_task(&self, task_id: i64) -> Result<(), SchedulerError> {
        let storage = self.storage.lock().await;
        storage.delete_task(task_id)?;
        Ok(())
    }

    /// Process all due tasks.
    ///
    /// This should be called periodically by the server. Tasks are executed
    /// by calling the provided execution callback.
    pub async fn process<F, Fut>(&self, mut execute: F) -> Result<(), SchedulerError>
    where
        F: FnMut(ScheduledTask) -> Fut,
        Fut: std::future::Future<Output = Result<(), String>>,
    {
        let tasks = self.get_due_tasks().await?;
        if tasks.is_empty() {
            return Ok(());
        }

        // Execute and delete tasks one by one
        for task in tasks {
            // Delete task before executing to avoid re-execution on failure
            self.delete_task(task.id).await?;

            if let Err(e) = execute(task.clone()).await {
                eprintln!(
                    "[Scheduler] Error executing task {} (entity {}, verb {}): {}",
                    task.id, task.entity_id, task.verb, e
                );
            }
        }

        Ok(())
    }

    /// Run the scheduler loop.
    ///
    /// This continuously checks for due tasks at the configured interval
    /// and executes them using the provided callback.
    pub async fn run<F, Fut>(self: Arc<Self>, execute: F)
    where
        F: Fn(ScheduledTask) -> Fut + Send + Sync + 'static,
        Fut: std::future::Future<Output = Result<(), String>> + Send,
    {
        let mut interval = time::interval(Duration::from_millis(self.interval_ms));
        let execute = Arc::new(execute);

        loop {
            interval.tick().await;

            let exec_clone = Arc::clone(&execute);
            if let Err(e) = self.process(|task| exec_clone(task)).await {
                eprintln!("[Scheduler] Error processing tasks: {}", e);
            }
        }
    }
}

/// Get current time in milliseconds since Unix epoch.
fn current_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("System time before Unix epoch")
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_schedule_and_retrieve() {
        let storage = Arc::new(Mutex::new(WorldStorage::in_memory().unwrap()));
        let scheduler = Scheduler::new(Arc::clone(&storage), 100);

        // Create an entity
        let entity_id = {
            let storage = storage.lock().await;
            storage
                .create_entity(serde_json::json!({"name": "Test"}), None)
                .unwrap()
        };

        // Schedule a task for immediate execution
        scheduler
            .schedule(entity_id, "test_verb", serde_json::json!(["arg1", 42]), 0)
            .await
            .unwrap();

        // Wait a tiny bit to ensure time passes
        tokio::time::sleep(Duration::from_millis(10)).await;

        // Get due tasks
        let tasks = scheduler.get_due_tasks().await.unwrap();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].entity_id, entity_id);
        assert_eq!(tasks[0].verb, "test_verb");
        assert_eq!(tasks[0].args.as_array().unwrap().len(), 2);
    }

    #[tokio::test]
    async fn test_process_executes_and_deletes() {
        let storage = Arc::new(Mutex::new(WorldStorage::in_memory().unwrap()));
        let scheduler = Scheduler::new(Arc::clone(&storage), 100);

        let entity_id = {
            let storage = storage.lock().await;
            storage
                .create_entity(serde_json::json!({"name": "Test"}), None)
                .unwrap()
        };

        // Schedule a task
        scheduler
            .schedule(entity_id, "greet", serde_json::json!([]), 0)
            .await
            .unwrap();

        tokio::time::sleep(Duration::from_millis(10)).await;

        // Process tasks with a simple callback
        let mut executed = false;
        scheduler
            .process(|task| {
                executed = true;
                assert_eq!(task.verb, "greet");
                async { Ok(()) }
            })
            .await
            .unwrap();

        assert!(executed, "Task should have been executed");

        // Verify task was deleted
        let tasks = scheduler.get_due_tasks().await.unwrap();
        assert_eq!(tasks.len(), 0, "Task should be deleted after execution");
    }

    #[tokio::test]
    async fn test_only_executes_due_tasks() {
        let storage = Arc::new(Mutex::new(WorldStorage::in_memory().unwrap()));
        let scheduler = Scheduler::new(Arc::clone(&storage), 100);

        let entity_id = {
            let storage = storage.lock().await;
            storage
                .create_entity(serde_json::json!({"name": "Test"}), None)
                .unwrap()
        };

        // Schedule task far in the future
        scheduler
            .schedule(entity_id, "future_task", serde_json::json!([]), 10_000)
            .await
            .unwrap();

        // Process - should not execute anything
        let mut executed = false;
        scheduler
            .process(|_task| {
                executed = true;
                async { Ok(()) }
            })
            .await
            .unwrap();

        assert!(!executed, "Future task should not execute yet");

        // Task should still be in database
        let tasks = scheduler.get_due_tasks().await.unwrap();
        assert_eq!(tasks.len(), 0, "Future task not yet due");
    }
}
