//! SQLite storage layer.

use libsql::{Connection, Database, params};
use thiserror::Error;

use crate::entity::{Entity, EntityId, Verb};

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("database error: {0}")]
    Database(#[from] libsql::Error),

    #[error("entity not found: {0}")]
    EntityNotFound(EntityId),

    #[error("invalid JSON: {0}")]
    InvalidJson(#[from] serde_json::Error),

    #[error("transaction error: {0}")]
    Transaction(String),
}

/// World storage backed by libSQL.
pub struct WorldStorage {
    conn: Connection,
    #[allow(dead_code)]
    db: Database,
    /// Transaction depth for nested savepoints.
    transaction_depth: usize,
}

impl WorldStorage {
    /// Open or create a world database.
    pub async fn open(path: &str) -> Result<Self, StorageError> {
        let db = libsql::Builder::new_local(path).build().await?;
        let conn = db.connect()?;
        let storage = Self {
            conn,
            db,
            transaction_depth: 0,
        };
        storage.init_schema().await?;
        Ok(storage)
    }

    /// Open an in-memory database.
    pub async fn in_memory() -> Result<Self, StorageError> {
        let db = libsql::Builder::new_local(":memory:").build().await?;
        let conn = db.connect()?;
        let storage = Self {
            conn,
            db,
            transaction_depth: 0,
        };
        storage.init_schema().await?;
        Ok(storage)
    }

    // =========================================================================
    // Transaction Management
    // =========================================================================

    /// Begin a transaction. Uses SAVEPOINT for nested transactions.
    ///
    /// Returns the transaction depth (0 for outer transaction).
    pub async fn begin_transaction(&mut self) -> Result<usize, StorageError> {
        let depth = self.transaction_depth;
        if depth == 0 {
            self.conn.execute("BEGIN IMMEDIATE", ()).await?;
        } else {
            self.conn
                .execute(&format!("SAVEPOINT sp_{}", depth), ())
                .await?;
        }
        self.transaction_depth += 1;
        Ok(depth)
    }

    /// Commit the current transaction.
    ///
    /// For nested transactions, releases the savepoint.
    pub async fn commit(&mut self) -> Result<(), StorageError> {
        if self.transaction_depth == 0 {
            return Err(StorageError::Transaction(
                "no active transaction".to_string(),
            ));
        }
        self.transaction_depth -= 1;
        if self.transaction_depth == 0 {
            self.conn.execute("COMMIT", ()).await?;
        } else {
            self.conn
                .execute(
                    &format!("RELEASE SAVEPOINT sp_{}", self.transaction_depth),
                    (),
                )
                .await?;
        }
        Ok(())
    }

    /// Rollback the current transaction.
    ///
    /// For nested transactions, rolls back to the savepoint.
    pub async fn rollback(&mut self) -> Result<(), StorageError> {
        if self.transaction_depth == 0 {
            return Err(StorageError::Transaction(
                "no active transaction".to_string(),
            ));
        }
        self.transaction_depth -= 1;
        if self.transaction_depth == 0 {
            self.conn.execute("ROLLBACK", ()).await?;
        } else {
            self.conn
                .execute(
                    &format!("ROLLBACK TO SAVEPOINT sp_{}", self.transaction_depth),
                    (),
                )
                .await?;
        }
        Ok(())
    }

    /// Check if currently in a transaction.
    pub fn in_transaction(&self) -> bool {
        self.transaction_depth > 0
    }

    /// Initialize the database schema.
    async fn init_schema(&self) -> Result<(), StorageError> {
        self.conn
            .execute(
                "CREATE TABLE IF NOT EXISTS entities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                prototype_id INTEGER,
                props TEXT DEFAULT '{}',
                FOREIGN KEY(prototype_id) REFERENCES entities(id)
            )",
                (),
            )
            .await?;

        self.conn
            .execute(
                "CREATE TABLE IF NOT EXISTS verbs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entity_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                code TEXT NOT NULL,
                required_capability TEXT,
                FOREIGN KEY(entity_id) REFERENCES entities(id) ON DELETE CASCADE,
                UNIQUE(entity_id, name)
            )",
                (),
            )
            .await?;

        self.conn
            .execute(
                "CREATE TABLE IF NOT EXISTS scheduled_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entity_id INTEGER NOT NULL,
                verb TEXT NOT NULL,
                args TEXT DEFAULT '[]',
                execute_at INTEGER NOT NULL,
                FOREIGN KEY(entity_id) REFERENCES entities(id) ON DELETE CASCADE
            )",
                (),
            )
            .await?;

        self.conn
            .execute(
                "CREATE TABLE IF NOT EXISTS capabilities (
                id TEXT PRIMARY KEY,
                owner_id INTEGER NOT NULL,
                type TEXT NOT NULL,
                params TEXT NOT NULL,
                FOREIGN KEY(owner_id) REFERENCES entities(id) ON DELETE CASCADE
            )",
                (),
            )
            .await?;

        self.conn
            .execute(
                "CREATE INDEX IF NOT EXISTS idx_capabilities_owner ON capabilities(owner_id)",
                (),
            )
            .await?;

        Ok(())
    }

    /// Create a new entity.
    pub async fn create_entity(
        &self,
        props: serde_json::Value,
        prototype_id: Option<EntityId>,
    ) -> Result<EntityId, StorageError> {
        let props_str = serde_json::to_string(&props)?;
        self.conn
            .execute(
                "INSERT INTO entities (prototype_id, props) VALUES (?1, ?2)",
                params![prototype_id, props_str],
            )
            .await?;
        Ok(self.conn.last_insert_rowid())
    }

    /// Get an entity by ID (raw, without prototype resolution).
    pub async fn get_entity_raw(&self, id: EntityId) -> Result<Option<Entity>, StorageError> {
        let mut rows = self
            .conn
            .query(
                "SELECT id, prototype_id, props FROM entities WHERE id = ?1",
                params![id],
            )
            .await?;

        if let Some(row) = rows.next().await? {
            let id: EntityId = row.get(0)?;
            let prototype_id: Option<EntityId> = row.get(1)?;
            let props_str: String = row.get(2)?;
            let props: serde_json::Value = serde_json::from_str(&props_str)?;
            Ok(Some(Entity {
                id,
                prototype_id,
                props,
            }))
        } else {
            Ok(None)
        }
    }

    /// Get an entity with resolved prototype chain properties.
    pub async fn get_entity(&self, id: EntityId) -> Result<Option<Entity>, StorageError> {
        // Use CTE to get the entire prototype chain
        let mut rows = self
            .conn
            .query(
                r#"
            WITH RECURSIVE lineage AS (
                SELECT id, prototype_id, props, 0 as depth FROM entities WHERE id = ?1
                UNION ALL
                SELECT e.id, e.prototype_id, e.props, l.depth + 1
                FROM entities e
                JOIN lineage l ON e.id = l.prototype_id
            )
            SELECT id, prototype_id, props FROM lineage ORDER BY depth DESC
            "#,
                params![id],
            )
            .await?;

        let mut chain: Vec<(EntityId, Option<EntityId>, String)> = Vec::new();
        while let Some(row) = rows.next().await? {
            chain.push((row.get(0)?, row.get(1)?, row.get(2)?));
        }

        if chain.is_empty() {
            return Ok(None);
        }

        // Merge properties from root (oldest prototype) to leaf (instance)
        let mut merged_props = serde_json::Map::new();
        for (_, _, props_str) in &chain {
            let props: serde_json::Value = serde_json::from_str(props_str)?;
            if let serde_json::Value::Object(obj) = props {
                for (key, value) in obj {
                    merged_props.insert(key, value);
                }
            }
        }

        let (instance_id, prototype_id, _) = chain.last().unwrap();
        Ok(Some(Entity {
            id: *instance_id,
            prototype_id: *prototype_id,
            props: serde_json::Value::Object(merged_props),
        }))
    }

    /// Update an entity's properties.
    pub async fn update_entity(
        &self,
        id: EntityId,
        props: serde_json::Value,
    ) -> Result<(), StorageError> {
        // Get current props and merge
        let current = self.get_entity_raw(id).await?;
        let current = current.ok_or(StorageError::EntityNotFound(id))?;

        let mut merged = match current.props {
            serde_json::Value::Object(map) => map,
            _ => serde_json::Map::new(),
        };

        if let serde_json::Value::Object(updates) = props {
            for (key, value) in updates {
                merged.insert(key, value);
            }
        }

        let props_str = serde_json::to_string(&serde_json::Value::Object(merged))?;
        self.conn
            .execute(
                "UPDATE entities SET props = ?1 WHERE id = ?2",
                params![props_str, id],
            )
            .await?;
        Ok(())
    }

    /// Set an entity's prototype.
    pub async fn set_prototype(
        &self,
        id: EntityId,
        prototype_id: Option<EntityId>,
    ) -> Result<(), StorageError> {
        self.conn
            .execute(
                "UPDATE entities SET prototype_id = ?1 WHERE id = ?2",
                params![prototype_id, id],
            )
            .await?;
        Ok(())
    }

    /// Delete an entity.
    pub async fn delete_entity(&self, id: EntityId) -> Result<(), StorageError> {
        self.conn
            .execute("DELETE FROM verbs WHERE entity_id = ?1", params![id])
            .await?;
        self.conn
            .execute("DELETE FROM capabilities WHERE owner_id = ?1", params![id])
            .await?;
        self.conn
            .execute("DELETE FROM entities WHERE id = ?1", params![id])
            .await?;
        Ok(())
    }

    /// Add a verb to an entity.
    pub async fn add_verb(
        &self,
        entity_id: EntityId,
        name: &str,
        code: &rhizome_lotus_ir::SExpr,
    ) -> Result<i64, StorageError> {
        self.add_verb_with_cap(entity_id, name, code, None).await
    }

    /// Add a verb to an entity with optional capability requirement.
    pub async fn add_verb_with_cap(
        &self,
        entity_id: EntityId,
        name: &str,
        code: &rhizome_lotus_ir::SExpr,
        required_capability: Option<&str>,
    ) -> Result<i64, StorageError> {
        let code_str = serde_json::to_string(code)?;
        self.conn.execute(
            "INSERT INTO verbs (entity_id, name, code, required_capability) VALUES (?1, ?2, ?3, ?4)",
            params![entity_id, name, code_str, required_capability],
        ).await?;
        Ok(self.conn.last_insert_rowid())
    }

    /// Get a verb by entity and name (resolves through prototype chain).
    pub async fn get_verb(
        &self,
        entity_id: EntityId,
        name: &str,
    ) -> Result<Option<Verb>, StorageError> {
        let mut rows = self
            .conn
            .query(
                r#"
            WITH RECURSIVE lineage AS (
                SELECT id, prototype_id, 0 as depth FROM entities WHERE id = ?1
                UNION ALL
                SELECT e.id, e.prototype_id, l.depth + 1
                FROM entities e
                JOIN lineage l ON e.id = l.prototype_id
            )
            SELECT v.id, v.entity_id, v.name, v.code, v.required_capability, l.depth
            FROM verbs v
            JOIN lineage l ON v.entity_id = l.id
            WHERE v.name = ?2
            ORDER BY l.depth ASC
            LIMIT 1
            "#,
                params![entity_id, name],
            )
            .await?;

        if let Some(row) = rows.next().await? {
            let id: i64 = row.get(0)?;
            let entity_id: EntityId = row.get(1)?;
            let name: String = row.get(2)?;
            let code_str: String = row.get(3)?;
            let required_capability: Option<String> = row.get(4)?;
            let code: rhizome_lotus_ir::SExpr = serde_json::from_str(&code_str)?;
            Ok(Some(Verb {
                id,
                entity_id,
                name,
                code,
                required_capability,
            }))
        } else {
            Ok(None)
        }
    }

    /// Get all verbs for an entity (including inherited).
    pub async fn get_verbs(&self, entity_id: EntityId) -> Result<Vec<Verb>, StorageError> {
        let mut rows = self
            .conn
            .query(
                r#"
            WITH RECURSIVE lineage AS (
                SELECT id, prototype_id, 0 as depth FROM entities WHERE id = ?1
                UNION ALL
                SELECT e.id, e.prototype_id, l.depth + 1
                FROM entities e
                JOIN lineage l ON e.id = l.prototype_id
            )
            SELECT v.id, v.entity_id, v.name, v.code, v.required_capability, l.depth
            FROM verbs v
            JOIN lineage l ON v.entity_id = l.id
            ORDER BY l.depth DESC
            "#,
                params![entity_id],
            )
            .await?;

        // Use a map to ensure child verbs override parent verbs
        let mut verb_map = std::collections::HashMap::new();
        while let Some(row) = rows.next().await? {
            let id: i64 = row.get(0)?;
            let entity_id: EntityId = row.get(1)?;
            let name: String = row.get(2)?;
            let code_str: String = row.get(3)?;
            let required_capability: Option<String> = row.get(4)?;
            let code: rhizome_lotus_ir::SExpr = serde_json::from_str(&code_str)?;
            verb_map.insert(
                name.clone(),
                Verb {
                    id,
                    entity_id,
                    name,
                    code,
                    required_capability,
                },
            );
        }

        Ok(verb_map.into_values().collect())
    }

    /// Update a verb's code.
    pub async fn update_verb(
        &self,
        id: i64,
        code: &rhizome_lotus_ir::SExpr,
    ) -> Result<(), StorageError> {
        let code_str = serde_json::to_string(code)?;
        self.conn
            .execute(
                "UPDATE verbs SET code = ?1 WHERE id = ?2",
                params![code_str, id],
            )
            .await?;
        Ok(())
    }

    /// Delete a verb.
    pub async fn delete_verb(&self, id: i64) -> Result<(), StorageError> {
        self.conn
            .execute("DELETE FROM verbs WHERE id = ?1", params![id])
            .await?;
        Ok(())
    }

    // =========================================================================
    // Capabilities
    // =========================================================================

    /// Create a new capability.
    pub async fn create_capability(
        &self,
        owner_id: EntityId,
        cap_type: &str,
        params: serde_json::Value,
    ) -> Result<String, StorageError> {
        let id = uuid::Uuid::new_v4().to_string();
        let params_str = serde_json::to_string(&params)?;
        self.conn
            .execute(
                "INSERT INTO capabilities (id, owner_id, type, params) VALUES (?1, ?2, ?3, ?4)",
                libsql::params![id.clone(), owner_id, cap_type, params_str],
            )
            .await?;
        Ok(id)
    }

    /// Get a capability by ID.
    pub async fn get_capability(
        &self,
        id: &str,
    ) -> Result<Option<crate::Capability>, StorageError> {
        let mut rows = self
            .conn
            .query(
                "SELECT id, owner_id, type, params FROM capabilities WHERE id = ?1",
                params![id],
            )
            .await?;

        if let Some(row) = rows.next().await? {
            let id: String = row.get(0)?;
            let owner_id: EntityId = row.get(1)?;
            let cap_type: String = row.get(2)?;
            let params_str: String = row.get(3)?;
            let params: serde_json::Value = serde_json::from_str(&params_str)?;
            Ok(Some(crate::Capability {
                id,
                owner_id,
                cap_type,
                params,
            }))
        } else {
            Ok(None)
        }
    }

    /// Get all capabilities owned by an entity.
    pub async fn get_capabilities(
        &self,
        owner_id: EntityId,
    ) -> Result<Vec<crate::Capability>, StorageError> {
        let mut rows = self
            .conn
            .query(
                "SELECT id, owner_id, type, params FROM capabilities WHERE owner_id = ?1",
                params![owner_id],
            )
            .await?;

        let mut caps = Vec::new();
        while let Some(row) = rows.next().await? {
            let id: String = row.get(0)?;
            let owner_id: EntityId = row.get(1)?;
            let cap_type: String = row.get(2)?;
            let params_str: String = row.get(3)?;
            let params: serde_json::Value = serde_json::from_str(&params_str)?;
            caps.push(crate::Capability {
                id,
                owner_id,
                cap_type,
                params,
            });
        }

        Ok(caps)
    }

    /// Update the owner of a capability.
    pub async fn update_capability_owner(
        &self,
        id: &str,
        new_owner_id: EntityId,
    ) -> Result<(), StorageError> {
        self.conn
            .execute(
                "UPDATE capabilities SET owner_id = ?1 WHERE id = ?2",
                params![new_owner_id, id],
            )
            .await?;
        Ok(())
    }

    /// Delete a capability.
    pub async fn delete_capability(&self, id: &str) -> Result<(), StorageError> {
        self.conn
            .execute("DELETE FROM capabilities WHERE id = ?1", params![id])
            .await?;
        Ok(())
    }

    // =========================================================================
    // Scheduled Tasks
    // =========================================================================

    /// Schedule a task for future execution.
    pub async fn schedule_task(
        &self,
        entity_id: EntityId,
        verb: &str,
        args: serde_json::Value,
        execute_at: i64,
    ) -> Result<i64, StorageError> {
        let args_str = serde_json::to_string(&args)?;
        self.conn.execute(
            "INSERT INTO scheduled_tasks (entity_id, verb, args, execute_at) VALUES (?1, ?2, ?3, ?4)",
            params![entity_id, verb, args_str, execute_at],
        ).await?;
        Ok(self.conn.last_insert_rowid())
    }

    /// Get all tasks that are due (execute_at <= now).
    pub async fn get_due_tasks(&self, now: i64) -> Result<Vec<ScheduledTask>, StorageError> {
        let mut rows = self.conn.query(
            "SELECT id, entity_id, verb, args, execute_at FROM scheduled_tasks WHERE execute_at <= ?1 ORDER BY execute_at ASC",
            params![now],
        ).await?;

        let mut tasks = Vec::new();
        while let Some(row) = rows.next().await? {
            let id: i64 = row.get(0)?;
            let entity_id: EntityId = row.get(1)?;
            let verb: String = row.get(2)?;
            let args_str: String = row.get(3)?;
            let execute_at: i64 = row.get(4)?;
            let args: serde_json::Value = serde_json::from_str(&args_str)?;
            tasks.push(ScheduledTask {
                id,
                entity_id,
                verb,
                args,
                execute_at,
            });
        }

        Ok(tasks)
    }

    /// Delete a scheduled task.
    pub async fn delete_task(&self, id: i64) -> Result<(), StorageError> {
        self.conn
            .execute("DELETE FROM scheduled_tasks WHERE id = ?1", params![id])
            .await?;
        Ok(())
    }
}

/// A scheduled task.
#[derive(Debug, Clone)]
pub struct ScheduledTask {
    pub id: i64,
    pub entity_id: EntityId,
    pub verb: String,
    pub args: serde_json::Value,
    pub execute_at: i64,
}

#[cfg(test)]
mod tests;
