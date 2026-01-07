//! SQLite storage layer.

use rusqlite::{Connection, OptionalExtension, params};
use thiserror::Error;

use crate::entity::{Entity, EntityId, Verb};

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("entity not found: {0}")]
    EntityNotFound(EntityId),

    #[error("invalid JSON: {0}")]
    InvalidJson(#[from] serde_json::Error),

    #[error("transaction error: {0}")]
    Transaction(String),
}

/// World storage backed by SQLite.
pub struct WorldStorage {
    conn: Connection,
    /// Transaction depth for nested savepoints.
    transaction_depth: usize,
}

impl WorldStorage {
    /// Open or create a world database.
    pub fn open(path: &str) -> Result<Self, StorageError> {
        let conn = Connection::open(path)?;
        let storage = Self {
            conn,
            transaction_depth: 0,
        };
        storage.init_schema()?;
        Ok(storage)
    }

    /// Open an in-memory database.
    pub fn in_memory() -> Result<Self, StorageError> {
        let conn = Connection::open_in_memory()?;
        let storage = Self {
            conn,
            transaction_depth: 0,
        };
        storage.init_schema()?;
        Ok(storage)
    }

    // =========================================================================
    // Transaction Management
    // =========================================================================

    /// Begin a transaction. Uses SAVEPOINT for nested transactions.
    ///
    /// Returns the transaction depth (0 for outer transaction).
    pub fn begin_transaction(&mut self) -> Result<usize, StorageError> {
        let depth = self.transaction_depth;
        if depth == 0 {
            self.conn.execute("BEGIN IMMEDIATE", [])?;
        } else {
            self.conn.execute(&format!("SAVEPOINT sp_{}", depth), [])?;
        }
        self.transaction_depth += 1;
        Ok(depth)
    }

    /// Commit the current transaction.
    ///
    /// For nested transactions, releases the savepoint.
    pub fn commit(&mut self) -> Result<(), StorageError> {
        if self.transaction_depth == 0 {
            return Err(StorageError::Transaction(
                "no active transaction".to_string(),
            ));
        }
        self.transaction_depth -= 1;
        if self.transaction_depth == 0 {
            self.conn.execute("COMMIT", [])?;
        } else {
            self.conn.execute(
                &format!("RELEASE SAVEPOINT sp_{}", self.transaction_depth),
                [],
            )?;
        }
        Ok(())
    }

    /// Rollback the current transaction.
    ///
    /// For nested transactions, rolls back to the savepoint.
    pub fn rollback(&mut self) -> Result<(), StorageError> {
        if self.transaction_depth == 0 {
            return Err(StorageError::Transaction(
                "no active transaction".to_string(),
            ));
        }
        self.transaction_depth -= 1;
        if self.transaction_depth == 0 {
            self.conn.execute("ROLLBACK", [])?;
        } else {
            self.conn.execute(
                &format!("ROLLBACK TO SAVEPOINT sp_{}", self.transaction_depth),
                [],
            )?;
        }
        Ok(())
    }

    /// Execute a function within a transaction.
    ///
    /// Automatically commits on success, rolls back on error.
    /// Supports nested transactions via savepoints.
    pub fn transaction<F, R>(&mut self, f: F) -> Result<R, StorageError>
    where
        F: FnOnce(&mut Self) -> Result<R, StorageError>,
    {
        self.begin_transaction()?;
        match f(self) {
            Ok(result) => {
                self.commit()?;
                Ok(result)
            }
            Err(e) => {
                // Try to rollback, but don't mask the original error
                let _ = self.rollback();
                Err(e)
            }
        }
    }

    /// Check if currently in a transaction.
    pub fn in_transaction(&self) -> bool {
        self.transaction_depth > 0
    }

    /// Initialize the database schema.
    fn init_schema(&self) -> Result<(), StorageError> {
        self.conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS entities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                prototype_id INTEGER,
                props TEXT DEFAULT '{}',
                FOREIGN KEY(prototype_id) REFERENCES entities(id)
            );

            CREATE TABLE IF NOT EXISTS verbs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entity_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                code TEXT NOT NULL,
                FOREIGN KEY(entity_id) REFERENCES entities(id) ON DELETE CASCADE,
                UNIQUE(entity_id, name)
            );

            CREATE TABLE IF NOT EXISTS scheduled_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entity_id INTEGER NOT NULL,
                verb TEXT NOT NULL,
                args TEXT DEFAULT '[]',
                execute_at INTEGER NOT NULL,
                FOREIGN KEY(entity_id) REFERENCES entities(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS capabilities (
                id TEXT PRIMARY KEY,
                owner_id INTEGER NOT NULL,
                type TEXT NOT NULL,
                params TEXT NOT NULL,
                FOREIGN KEY(owner_id) REFERENCES entities(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_capabilities_owner ON capabilities(owner_id);
            "#,
        )?;
        Ok(())
    }

    /// Create a new entity.
    pub fn create_entity(
        &self,
        props: serde_json::Value,
        prototype_id: Option<EntityId>,
    ) -> Result<EntityId, StorageError> {
        let props_str = serde_json::to_string(&props)?;
        self.conn.execute(
            "INSERT INTO entities (prototype_id, props) VALUES (?1, ?2)",
            params![prototype_id, props_str],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    /// Get an entity by ID (raw, without prototype resolution).
    pub fn get_entity_raw(&self, id: EntityId) -> Result<Option<Entity>, StorageError> {
        let result = self
            .conn
            .query_row(
                "SELECT id, prototype_id, props FROM entities WHERE id = ?1",
                params![id],
                |row| {
                    let props_str: String = row.get(2)?;
                    Ok((
                        row.get::<_, EntityId>(0)?,
                        row.get::<_, Option<EntityId>>(1)?,
                        props_str,
                    ))
                },
            )
            .optional()?;

        match result {
            Some((id, prototype_id, props_str)) => {
                let props: serde_json::Value = serde_json::from_str(&props_str)?;
                Ok(Some(Entity {
                    id,
                    prototype_id,
                    props,
                }))
            }
            None => Ok(None),
        }
    }

    /// Get an entity with resolved prototype chain properties.
    pub fn get_entity(&self, id: EntityId) -> Result<Option<Entity>, StorageError> {
        // Use CTE to get the entire prototype chain
        let mut stmt = self.conn.prepare(
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
        )?;

        let rows: Vec<(EntityId, Option<EntityId>, String)> = stmt
            .query_map(params![id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        if rows.is_empty() {
            return Ok(None);
        }

        // Merge properties from root (oldest prototype) to leaf (instance)
        let mut merged_props = serde_json::Map::new();
        for (_, _, props_str) in &rows {
            let props: serde_json::Value = serde_json::from_str(props_str)?;
            if let serde_json::Value::Object(obj) = props {
                for (key, value) in obj {
                    merged_props.insert(key, value);
                }
            }
        }

        let (instance_id, prototype_id, _) = rows.last().unwrap();
        Ok(Some(Entity {
            id: *instance_id,
            prototype_id: *prototype_id,
            props: serde_json::Value::Object(merged_props),
        }))
    }

    /// Update an entity's properties.
    pub fn update_entity(
        &self,
        id: EntityId,
        props: serde_json::Value,
    ) -> Result<(), StorageError> {
        // Get current props and merge
        let current = self.get_entity_raw(id)?;
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
        self.conn.execute(
            "UPDATE entities SET props = ?1 WHERE id = ?2",
            params![props_str, id],
        )?;
        Ok(())
    }

    /// Set an entity's prototype.
    pub fn set_prototype(
        &self,
        id: EntityId,
        prototype_id: Option<EntityId>,
    ) -> Result<(), StorageError> {
        self.conn.execute(
            "UPDATE entities SET prototype_id = ?1 WHERE id = ?2",
            params![prototype_id, id],
        )?;
        Ok(())
    }

    /// Delete an entity.
    pub fn delete_entity(&self, id: EntityId) -> Result<(), StorageError> {
        self.conn
            .execute("DELETE FROM verbs WHERE entity_id = ?1", params![id])?;
        self.conn
            .execute("DELETE FROM capabilities WHERE owner_id = ?1", params![id])?;
        self.conn
            .execute("DELETE FROM entities WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// Add a verb to an entity.
    pub fn add_verb(
        &self,
        entity_id: EntityId,
        name: &str,
        code: &bloom_ir::SExpr,
    ) -> Result<i64, StorageError> {
        let code_str = serde_json::to_string(code)?;
        self.conn.execute(
            "INSERT INTO verbs (entity_id, name, code) VALUES (?1, ?2, ?3)",
            params![entity_id, name, code_str],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    /// Get a verb by entity and name (resolves through prototype chain).
    pub fn get_verb(&self, entity_id: EntityId, name: &str) -> Result<Option<Verb>, StorageError> {
        let mut stmt = self.conn.prepare(
            r#"
            WITH RECURSIVE lineage AS (
                SELECT id, prototype_id, 0 as depth FROM entities WHERE id = ?1
                UNION ALL
                SELECT e.id, e.prototype_id, l.depth + 1
                FROM entities e
                JOIN lineage l ON e.id = l.prototype_id
            )
            SELECT v.id, v.entity_id, v.name, v.code, l.depth
            FROM verbs v
            JOIN lineage l ON v.entity_id = l.id
            WHERE v.name = ?2
            ORDER BY l.depth ASC
            LIMIT 1
            "#,
        )?;

        let result = stmt
            .query_row(params![entity_id, name], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, EntityId>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })
            .optional()?;

        match result {
            Some((id, entity_id, name, code_str)) => {
                let code: bloom_ir::SExpr = serde_json::from_str(&code_str)?;
                Ok(Some(Verb {
                    id,
                    entity_id,
                    name,
                    code,
                }))
            }
            None => Ok(None),
        }
    }

    /// Get all verbs for an entity (including inherited).
    pub fn get_verbs(&self, entity_id: EntityId) -> Result<Vec<Verb>, StorageError> {
        let mut stmt = self.conn.prepare(
            r#"
            WITH RECURSIVE lineage AS (
                SELECT id, prototype_id, 0 as depth FROM entities WHERE id = ?1
                UNION ALL
                SELECT e.id, e.prototype_id, l.depth + 1
                FROM entities e
                JOIN lineage l ON e.id = l.prototype_id
            )
            SELECT v.id, v.entity_id, v.name, v.code, l.depth
            FROM verbs v
            JOIN lineage l ON v.entity_id = l.id
            ORDER BY l.depth DESC
            "#,
        )?;

        let rows: Vec<(i64, EntityId, String, String)> = stmt
            .query_map(params![entity_id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        // Use a map to ensure child verbs override parent verbs
        let mut verb_map = std::collections::HashMap::new();
        for (id, entity_id, name, code_str) in rows {
            let code: bloom_ir::SExpr = serde_json::from_str(&code_str)?;
            verb_map.insert(
                name.clone(),
                Verb {
                    id,
                    entity_id,
                    name,
                    code,
                },
            );
        }

        Ok(verb_map.into_values().collect())
    }

    /// Update a verb's code.
    pub fn update_verb(&self, id: i64, code: &bloom_ir::SExpr) -> Result<(), StorageError> {
        let code_str = serde_json::to_string(code)?;
        self.conn.execute(
            "UPDATE verbs SET code = ?1 WHERE id = ?2",
            params![code_str, id],
        )?;
        Ok(())
    }

    /// Delete a verb.
    pub fn delete_verb(&self, id: i64) -> Result<(), StorageError> {
        self.conn
            .execute("DELETE FROM verbs WHERE id = ?1", params![id])?;
        Ok(())
    }

    // =========================================================================
    // Capabilities
    // =========================================================================

    /// Create a new capability.
    pub fn create_capability(
        &self,
        owner_id: EntityId,
        cap_type: &str,
        params: serde_json::Value,
    ) -> Result<String, StorageError> {
        let id = uuid::Uuid::new_v4().to_string();
        let params_str = serde_json::to_string(&params)?;
        self.conn.execute(
            "INSERT INTO capabilities (id, owner_id, type, params) VALUES (?1, ?2, ?3, ?4)",
            params![&id, owner_id, cap_type, params_str],
        )?;
        Ok(id)
    }

    /// Get a capability by ID.
    pub fn get_capability(&self, id: &str) -> Result<Option<crate::Capability>, StorageError> {
        let result = self
            .conn
            .query_row(
                "SELECT id, owner_id, type, params FROM capabilities WHERE id = ?1",
                params![id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, EntityId>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                    ))
                },
            )
            .optional()?;

        match result {
            Some((id, owner_id, cap_type, params_str)) => {
                let params: serde_json::Value = serde_json::from_str(&params_str)?;
                Ok(Some(crate::Capability {
                    id,
                    owner_id,
                    cap_type,
                    params,
                }))
            }
            None => Ok(None),
        }
    }

    /// Get all capabilities owned by an entity.
    pub fn get_capabilities(
        &self,
        owner_id: EntityId,
    ) -> Result<Vec<crate::Capability>, StorageError> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, owner_id, type, params FROM capabilities WHERE owner_id = ?1")?;

        let rows: Vec<(String, EntityId, String, String)> = stmt
            .query_map(params![owner_id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        let mut caps = Vec::new();
        for (id, owner_id, cap_type, params_str) in rows {
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
    pub fn update_capability_owner(
        &self,
        id: &str,
        new_owner_id: EntityId,
    ) -> Result<(), StorageError> {
        self.conn.execute(
            "UPDATE capabilities SET owner_id = ?1 WHERE id = ?2",
            params![new_owner_id, id],
        )?;
        Ok(())
    }

    /// Delete a capability.
    pub fn delete_capability(&self, id: &str) -> Result<(), StorageError> {
        self.conn
            .execute("DELETE FROM capabilities WHERE id = ?1", params![id])?;
        Ok(())
    }

    // =========================================================================
    // Scheduled Tasks
    // =========================================================================

    /// Schedule a task for future execution.
    pub fn schedule_task(
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
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    /// Get all tasks that are due (execute_at <= now).
    pub fn get_due_tasks(&self, now: i64) -> Result<Vec<ScheduledTask>, StorageError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, entity_id, verb, args, execute_at FROM scheduled_tasks WHERE execute_at <= ?1 ORDER BY execute_at ASC",
        )?;

        let rows: Vec<(i64, EntityId, String, String, i64)> = stmt
            .query_map(params![now], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        let mut tasks = Vec::new();
        for (id, entity_id, verb, args_str, execute_at) in rows {
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
    pub fn delete_task(&self, id: i64) -> Result<(), StorageError> {
        self.conn
            .execute("DELETE FROM scheduled_tasks WHERE id = ?1", params![id])?;
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
