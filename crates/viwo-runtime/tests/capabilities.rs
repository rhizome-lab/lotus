//! Capability system integration tests.

use serde_json::json;
use viwo_core::WorldStorage;
use viwo_runtime::{KernelOps, ViwoRuntime};

#[test]
fn test_get_capability_from_entity() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = ViwoRuntime::new(storage);

    // Create entity with capabilities
    let entity_id = {
        let storage = runtime.storage().lock().unwrap();
        let id = storage
            .create_entity(json!({"name": "Test"}), None)
            .unwrap();

        // Add some capabilities
        storage
            .create_capability(id, "entity.control", json!({"target_id": 42}))
            .unwrap();
        storage
            .create_capability(id, "fs.read", json!({"path": "/home"}))
            .unwrap();

        id
    };

    // Use KernelOps to get capabilities
    let kernel = KernelOps::new(runtime.storage().clone());

    // Get entity.control capability
    let cap = kernel
        .get_capability(entity_id, "entity.control", None)
        .unwrap();
    assert!(cap.is_some());
    assert_eq!(cap.unwrap().cap_type, "entity.control");

    // Get with filter
    let cap = kernel
        .get_capability(entity_id, "entity.control", Some(json!({"target_id": 42})))
        .unwrap();
    assert!(cap.is_some());

    // Get with wrong filter
    let cap = kernel
        .get_capability(entity_id, "entity.control", Some(json!({"target_id": 99})))
        .unwrap();
    assert!(cap.is_none());
}

#[test]
fn test_capability_transfer() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = ViwoRuntime::new(storage);

    let (e1_id, e2_id, cap_id) = {
        let storage = runtime.storage().lock().unwrap();
        let id1 = storage.create_entity(json!({"name": "E1"}), None).unwrap();
        let id2 = storage.create_entity(json!({"name": "E2"}), None).unwrap();
        let cap_id = storage
            .create_capability(id1, "test.cap", json!({}))
            .unwrap();
        (id1, id2, cap_id)
    };

    let kernel = KernelOps::new(runtime.storage().clone());

    // Verify e1 has it
    assert!(kernel.has_capability(e1_id, "test.cap", None).unwrap());
    assert!(!kernel.has_capability(e2_id, "test.cap", None).unwrap());

    // Transfer
    kernel.give_capability(&cap_id, e2_id).unwrap();

    // Verify transfer
    assert!(!kernel.has_capability(e1_id, "test.cap", None).unwrap());
    assert!(kernel.has_capability(e2_id, "test.cap", None).unwrap());
}
