//! Multi-entity interaction tests.

use serde_json::json;
use viwo_core::WorldStorage;
use viwo_ir::SExpr;
use viwo_runtime::ViwoRuntime;

#[test]
fn test_create_multiple_entities() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = ViwoRuntime::new(storage);

    let ids: Vec<_> = {
        let storage = runtime.storage().lock().unwrap();
        (0..5)
            .map(|i| {
                storage
                    .create_entity(json!({"name": format!("Entity{}", i)}), None)
                    .unwrap()
            })
            .collect()
    };

    // Verify all entities exist
    for (i, id) in ids.iter().enumerate() {
        let entity = {
            let storage = runtime.storage().lock().unwrap();
            storage.get_entity(*id).unwrap().unwrap()
        };
        assert_eq!(entity.id, *id);
        assert_eq!(entity.props["name"], format!("Entity{}", i));
    }
}

#[test]
fn test_prototype_chain_multiple_levels() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = ViwoRuntime::new(storage);

    // Create chain: root -> parent -> child
    let (root_id, parent_id, child_id) = {
        let storage = runtime.storage().lock().unwrap();

        let root = storage
            .create_entity(json!({"type": "root", "a": 1}), None)
            .unwrap();
        storage
            .add_verb(root, "root_verb", &SExpr::string("from_root"))
            .unwrap();

        let parent = storage
            .create_entity(json!({"type": "parent", "b": 2}), Some(root))
            .unwrap();
        storage
            .add_verb(parent, "parent_verb", &SExpr::string("from_parent"))
            .unwrap();

        let child = storage
            .create_entity(json!({"type": "child", "c": 3}), Some(parent))
            .unwrap();
        storage
            .add_verb(child, "child_verb", &SExpr::string("from_child"))
            .unwrap();

        (root, parent, child)
    };

    // Child should have all properties from chain
    let child_entity = {
        let storage = runtime.storage().lock().unwrap();
        storage.get_entity(child_id).unwrap().unwrap()
    };

    assert_eq!(child_entity.props["a"], 1);
    assert_eq!(child_entity.props["b"], 2);
    assert_eq!(child_entity.props["c"], 3);
    assert_eq!(child_entity.props["type"], "child"); // Child overrides

    // Child should inherit all verbs
    let result = runtime
        .execute_verb(child_id, "root_verb", vec![], None)
        .unwrap();
    assert_eq!(result.as_str().unwrap(), "from_root");

    let result = runtime
        .execute_verb(child_id, "parent_verb", vec![], None)
        .unwrap();
    assert_eq!(result.as_str().unwrap(), "from_parent");

    let result = runtime
        .execute_verb(child_id, "child_verb", vec![], None)
        .unwrap();
    assert_eq!(result.as_str().unwrap(), "from_child");
}

#[test]
fn test_entity_updates_isolated() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = ViwoRuntime::new(storage);

    let (e1, e2) = {
        let storage = runtime.storage().lock().unwrap();
        let id1 = storage
            .create_entity(json!({"name": "E1", "value": 10}), None)
            .unwrap();
        let id2 = storage
            .create_entity(json!({"name": "E2", "value": 20}), None)
            .unwrap();
        (id1, id2)
    };

    // Update e1
    {
        let storage = runtime.storage().lock().unwrap();
        storage.update_entity(e1, json!({"value": 100})).unwrap();
    }

    // Verify e1 changed but e2 didn't
    let (val1, val2) = {
        let storage = runtime.storage().lock().unwrap();
        let entity1 = storage.get_entity(e1).unwrap().unwrap();
        let entity2 = storage.get_entity(e2).unwrap().unwrap();
        (
            entity1.props["value"].as_i64().unwrap(),
            entity2.props["value"].as_i64().unwrap(),
        )
    };

    assert_eq!(val1, 100);
    assert_eq!(val2, 20);
}

#[test]
fn test_delete_entity_cascade() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = ViwoRuntime::new(storage);

    let entity_id = {
        let storage = runtime.storage().lock().unwrap();
        let id = storage
            .create_entity(json!({"name": "ToDelete"}), None)
            .unwrap();

        // Add verbs and capabilities
        storage.add_verb(id, "test", &SExpr::null()).unwrap();
        storage
            .create_capability(id, "test.cap", json!({}))
            .unwrap();

        id
    };

    // Delete entity
    {
        let storage = runtime.storage().lock().unwrap();
        storage.delete_entity(entity_id).unwrap();
    }

    // Verify entity is gone
    let entity = {
        let storage = runtime.storage().lock().unwrap();
        storage.get_entity(entity_id).unwrap()
    };
    assert!(entity.is_none());

    // Verify verbs are gone
    let verb = {
        let storage = runtime.storage().lock().unwrap();
        storage.get_verb(entity_id, "test").unwrap()
    };
    assert!(verb.is_none());

    // Verify capabilities are gone
    let caps = {
        let storage = runtime.storage().lock().unwrap();
        storage.get_capabilities(entity_id).unwrap()
    };
    assert_eq!(caps.len(), 0);
}
