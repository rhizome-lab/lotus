//! Game opcodes implementation.
//!
//! These opcodes are exposed to scripts to interact with the game world.

use lotus_core::{Entity, EntityId, WorldStorage};
use std::sync::{Arc, Mutex};

/// Update opcode - persist entity changes.
/// Usage: ["update", entity_id, {"prop": value}]
pub fn opcode_update(
    entity_id: EntityId,
    updates: serde_json::Value,
    storage: &Arc<Mutex<WorldStorage>>,
) -> Result<(), String> {
    let storage = storage.lock().unwrap();
    storage
        .update_entity(entity_id, updates)
        .map_err(|e| format!("update failed: {}", e))
}

/// Entity opcode - get entity by ID.
/// Usage: ["entity", entity_id]
pub fn opcode_entity(
    entity_id: EntityId,
    storage: &Arc<Mutex<WorldStorage>>,
) -> Result<Option<Entity>, String> {
    let storage = storage.lock().unwrap();
    storage
        .get_entity(entity_id)
        .map_err(|e| format!("get_entity failed: {}", e))
}

/// Create opcode - create new entity.
/// Usage: ["create", props, prototype_id?]
pub fn opcode_create(
    props: serde_json::Value,
    prototype_id: Option<EntityId>,
    storage: &Arc<Mutex<WorldStorage>>,
) -> Result<EntityId, String> {
    let storage = storage.lock().unwrap();
    storage
        .create_entity(props, prototype_id)
        .map_err(|e| format!("create_entity failed: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_opcode_create() {
        let storage = Arc::new(Mutex::new(WorldStorage::in_memory().unwrap()));

        let entity_id = opcode_create(json!({"name": "Test"}), None, &storage).unwrap();

        assert!(entity_id > 0);

        let entity = opcode_entity(entity_id, &storage).unwrap();
        assert!(entity.is_some());
        assert_eq!(entity.unwrap().props["name"], "Test");
    }

    #[test]
    fn test_opcode_update() {
        let storage = Arc::new(Mutex::new(WorldStorage::in_memory().unwrap()));

        let entity_id = {
            let storage = storage.lock().unwrap();
            storage
                .create_entity(json!({"name": "Original", "value": 1}), None)
                .unwrap()
        };

        opcode_update(entity_id, json!({"value": 42}), &storage).unwrap();

        let entity = opcode_entity(entity_id, &storage).unwrap().unwrap();
        assert_eq!(entity.props["value"], 42);
        assert_eq!(entity.props["name"], "Original"); // Not overwritten
    }
}
