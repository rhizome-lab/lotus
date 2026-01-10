//! Kernel opcodes for capability management.
//!
//! These functions are injected into the Lua runtime to provide
//! access to the capability system from scripts.

use rhizome_lotus_core::{Capability, EntityId, WorldStorage};
use std::sync::{Arc, Mutex};

/// Kernel functions available to scripts.
pub struct KernelOps {
    storage: Arc<Mutex<WorldStorage>>,
}

impl KernelOps {
    pub fn new(storage: Arc<Mutex<WorldStorage>>) -> Self {
        Self { storage }
    }

    /// Get a capability by type and optional filter.
    /// Returns the first matching capability or null.
    pub async fn get_capability(
        &self,
        owner_id: EntityId,
        cap_type: &str,
        filter: Option<serde_json::Value>,
    ) -> Result<Option<Capability>, rhizome_lotus_core::StorageError> {
        let storage = self.storage.lock().unwrap();
        let caps = storage.get_capabilities(owner_id).await?;

        // Find matching capability
        for cap in caps {
            if cap.cap_type != cap_type {
                continue;
            }

            // Check filter if provided
            if let Some(ref filter_obj) = filter {
                if let serde_json::Value::Object(filter_map) = filter_obj {
                    let mut matches = true;
                    for (key, value) in filter_map {
                        // Wildcard capability matches everything
                        if let Some(wildcard) = cap.params.get("*") {
                            if wildcard.as_bool() == Some(true) {
                                break;
                            }
                        }

                        // Check if param matches
                        if cap.params.get(key) != Some(value) {
                            matches = false;
                            break;
                        }
                    }
                    if !matches {
                        continue;
                    }
                }
            }

            return Ok(Some(cap));
        }

        Ok(None)
    }

    /// Check if an entity has a capability.
    pub async fn has_capability(
        &self,
        owner_id: EntityId,
        cap_type: &str,
        filter: Option<serde_json::Value>,
    ) -> Result<bool, rhizome_lotus_core::StorageError> {
        Ok(self
            .get_capability(owner_id, cap_type, filter)
            .await?
            .is_some())
    }

    /// Transfer capability ownership.
    pub async fn give_capability(
        &self,
        cap_id: &str,
        new_owner_id: EntityId,
    ) -> Result<(), rhizome_lotus_core::StorageError> {
        let storage = self.storage.lock().unwrap();
        storage.update_capability_owner(cap_id, new_owner_id).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rhizome_lotus_core::WorldStorage;
    use serde_json::json;

    #[tokio::test]
    async fn test_get_capability() {
        let storage = Arc::new(Mutex::new(WorldStorage::in_memory().await.unwrap()));
        let kernel = KernelOps::new(storage.clone());

        // Create entity and capability
        let entity_id = {
            let storage = storage.lock().unwrap();
            let id = storage
                .create_entity(json!({"name": "Test"}), None)
                .await
                .unwrap();
            storage
                .create_capability(id, "test.cap", json!({"level": 5}))
                .await
                .unwrap();
            id
        };

        // Get capability
        let cap = kernel
            .get_capability(entity_id, "test.cap", None)
            .await
            .unwrap();
        assert!(cap.is_some());

        // Get with matching filter
        let cap = kernel
            .get_capability(entity_id, "test.cap", Some(json!({"level": 5})))
            .await
            .unwrap();
        assert!(cap.is_some());

        // Get with non-matching filter
        let cap = kernel
            .get_capability(entity_id, "test.cap", Some(json!({"level": 10})))
            .await
            .unwrap();
        assert!(cap.is_none());
    }

    #[tokio::test]
    async fn test_wildcard_capability() {
        let storage = Arc::new(Mutex::new(WorldStorage::in_memory().await.unwrap()));
        let kernel = KernelOps::new(storage.clone());

        let entity_id = {
            let storage = storage.lock().unwrap();
            let id = storage
                .create_entity(json!({"name": "Test"}), None)
                .await
                .unwrap();
            storage
                .create_capability(id, "admin", json!({"*": true}))
                .await
                .unwrap();
            id
        };

        // Wildcard should match any filter
        let cap = kernel
            .get_capability(entity_id, "admin", Some(json!({"anything": "goes"})))
            .await
            .unwrap();
        assert!(cap.is_some());
    }

    #[tokio::test]
    async fn test_give_capability() {
        let storage = Arc::new(Mutex::new(WorldStorage::in_memory().await.unwrap()));
        let kernel = KernelOps::new(storage.clone());

        let (entity1_id, entity2_id, cap_id) = {
            let storage = storage.lock().unwrap();
            let id1 = storage
                .create_entity(json!({"name": "E1"}), None)
                .await
                .unwrap();
            let id2 = storage
                .create_entity(json!({"name": "E2"}), None)
                .await
                .unwrap();
            let cap_id = storage
                .create_capability(id1, "test.cap", json!({}))
                .await
                .unwrap();
            (id1, id2, cap_id)
        };

        // Transfer capability
        kernel.give_capability(&cap_id, entity2_id).await.unwrap();

        // Verify it moved
        assert!(
            kernel
                .get_capability(entity1_id, "test.cap", None)
                .await
                .unwrap()
                .is_none()
        );
        assert!(
            kernel
                .get_capability(entity2_id, "test.cap", None)
                .await
                .unwrap()
                .is_some()
        );
    }
}
