//! Kernel opcodes for capability management.
//!
//! These functions are injected into the Lua runtime to provide
//! access to the capability system from scripts.

use std::sync::{Arc, Mutex};
use viwo_core::{Capability, EntityId, WorldStorage};

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
    pub fn get_capability(
        &self,
        owner_id: EntityId,
        cap_type: &str,
        filter: Option<serde_json::Value>,
    ) -> Result<Option<Capability>, viwo_core::StorageError> {
        let storage = self.storage.lock().unwrap();
        let caps = storage.get_capabilities(owner_id)?;

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
    pub fn has_capability(
        &self,
        owner_id: EntityId,
        cap_type: &str,
        filter: Option<serde_json::Value>,
    ) -> Result<bool, viwo_core::StorageError> {
        Ok(self.get_capability(owner_id, cap_type, filter)?.is_some())
    }

    /// Transfer capability ownership.
    pub fn give_capability(
        &self,
        cap_id: &str,
        new_owner_id: EntityId,
    ) -> Result<(), viwo_core::StorageError> {
        let storage = self.storage.lock().unwrap();
        storage.update_capability_owner(cap_id, new_owner_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use viwo_core::WorldStorage;

    #[test]
    fn test_get_capability() {
        let storage = Arc::new(Mutex::new(WorldStorage::in_memory().unwrap()));
        let kernel = KernelOps::new(storage.clone());

        // Create entity and capability
        let entity_id = {
            let storage = storage.lock().unwrap();
            let id = storage
                .create_entity(json!({"name": "Test"}), None)
                .unwrap();
            storage
                .create_capability(id, "test.cap", json!({"level": 5}))
                .unwrap();
            id
        };

        // Get capability
        let cap = kernel.get_capability(entity_id, "test.cap", None).unwrap();
        assert!(cap.is_some());

        // Get with matching filter
        let cap = kernel
            .get_capability(entity_id, "test.cap", Some(json!({"level": 5})))
            .unwrap();
        assert!(cap.is_some());

        // Get with non-matching filter
        let cap = kernel
            .get_capability(entity_id, "test.cap", Some(json!({"level": 10})))
            .unwrap();
        assert!(cap.is_none());
    }

    #[test]
    fn test_wildcard_capability() {
        let storage = Arc::new(Mutex::new(WorldStorage::in_memory().unwrap()));
        let kernel = KernelOps::new(storage.clone());

        let entity_id = {
            let storage = storage.lock().unwrap();
            let id = storage
                .create_entity(json!({"name": "Test"}), None)
                .unwrap();
            storage
                .create_capability(id, "admin", json!({"*": true}))
                .unwrap();
            id
        };

        // Wildcard should match any filter
        let cap = kernel
            .get_capability(entity_id, "admin", Some(json!({"anything": "goes"})))
            .unwrap();
        assert!(cap.is_some());
    }

    #[test]
    fn test_give_capability() {
        let storage = Arc::new(Mutex::new(WorldStorage::in_memory().unwrap()));
        let kernel = KernelOps::new(storage.clone());

        let (entity1_id, entity2_id, cap_id) = {
            let storage = storage.lock().unwrap();
            let id1 = storage.create_entity(json!({"name": "E1"}), None).unwrap();
            let id2 = storage.create_entity(json!({"name": "E2"}), None).unwrap();
            let cap_id = storage
                .create_capability(id1, "test.cap", json!({}))
                .unwrap();
            (id1, id2, cap_id)
        };

        // Transfer capability
        kernel.give_capability(&cap_id, entity2_id).unwrap();

        // Verify it moved
        assert!(
            kernel
                .get_capability(entity1_id, "test.cap", None)
                .unwrap()
                .is_none()
        );
        assert!(
            kernel
                .get_capability(entity2_id, "test.cap", None)
                .unwrap()
                .is_some()
        );
    }
}
