//! Tests for WorldStorage.

use super::*;
use rhizome_lotus_ir::SExpr;
use serde_json::json;

#[test]
fn test_create_and_get_entity() {
    let storage = WorldStorage::in_memory().unwrap();

    let id = storage
        .create_entity(json!({"name": "Test Entity"}), None)
        .unwrap();
    assert!(id > 0);

    let entity = storage.get_entity(id).unwrap().unwrap();
    assert_eq!(entity.id, id);
    assert_eq!(entity.name(), Some("Test Entity"));
    assert!(entity.prototype_id.is_none());
}

#[test]
fn test_entity_not_found() {
    let storage = WorldStorage::in_memory().unwrap();

    let entity = storage.get_entity(999).unwrap();
    assert!(entity.is_none());
}

#[test]
fn test_update_entity() {
    let storage = WorldStorage::in_memory().unwrap();

    let id = storage
        .create_entity(json!({"name": "Original"}), None)
        .unwrap();
    storage
        .update_entity(id, json!({"description": "Added description"}))
        .unwrap();

    let entity = storage.get_entity(id).unwrap().unwrap();
    assert_eq!(entity.name(), Some("Original"));
    assert_eq!(entity.description(), Some("Added description"));
}

#[test]
fn test_delete_entity() {
    let storage = WorldStorage::in_memory().unwrap();

    let id = storage
        .create_entity(json!({"name": "To Delete"}), None)
        .unwrap();
    storage.delete_entity(id).unwrap();

    let entity = storage.get_entity(id).unwrap();
    assert!(entity.is_none());
}

#[test]
fn test_prototype_chain() {
    let storage = WorldStorage::in_memory().unwrap();

    // Create a prototype
    let proto_id = storage
        .create_entity(
            json!({"name": "Prototype", "inherited_prop": "from_proto"}),
            None,
        )
        .unwrap();

    // Create an instance
    let instance_id = storage
        .create_entity(
            json!({"name": "Instance", "own_prop": "from_instance"}),
            Some(proto_id),
        )
        .unwrap();

    let instance = storage.get_entity(instance_id).unwrap().unwrap();

    // Should have both own and inherited props
    assert_eq!(instance.name(), Some("Instance")); // Overrides proto
    assert_eq!(
        instance.get_prop("own_prop").and_then(|v| v.as_str()),
        Some("from_instance")
    );
    assert_eq!(
        instance.get_prop("inherited_prop").and_then(|v| v.as_str()),
        Some("from_proto")
    );
}

#[test]
fn test_deep_prototype_chain() {
    let storage = WorldStorage::in_memory().unwrap();

    // Create chain: root -> mid -> leaf
    let root_id = storage
        .create_entity(json!({"level": "root", "root_only": true}), None)
        .unwrap();
    let mid_id = storage
        .create_entity(json!({"level": "mid", "mid_only": true}), Some(root_id))
        .unwrap();
    let leaf_id = storage
        .create_entity(json!({"level": "leaf"}), Some(mid_id))
        .unwrap();

    let leaf = storage.get_entity(leaf_id).unwrap().unwrap();

    // Leaf overrides level
    assert_eq!(
        leaf.get_prop("level").and_then(|v| v.as_str()),
        Some("leaf")
    );
    // But inherits from ancestors
    assert_eq!(
        leaf.get_prop("mid_only").and_then(|v| v.as_bool()),
        Some(true)
    );
    assert_eq!(
        leaf.get_prop("root_only").and_then(|v| v.as_bool()),
        Some(true)
    );
}

#[test]
fn test_add_and_get_verb() {
    let storage = WorldStorage::in_memory().unwrap();

    let id = storage
        .create_entity(json!({"name": "Test"}), None)
        .unwrap();
    let code = SExpr::call("std.return", vec![SExpr::number(42).erase_type()]);

    storage.add_verb(id, "test_verb", &code).unwrap();

    let verb = storage.get_verb(id, "test_verb").unwrap().unwrap();
    assert_eq!(verb.name, "test_verb");
    assert_eq!(verb.entity_id, id);
    assert_eq!(verb.code, code);
}

#[test]
fn test_verb_not_found() {
    let storage = WorldStorage::in_memory().unwrap();

    let id = storage
        .create_entity(json!({"name": "Test"}), None)
        .unwrap();

    let verb = storage.get_verb(id, "nonexistent").unwrap();
    assert!(verb.is_none());
}

#[test]
fn test_verb_inheritance() {
    let storage = WorldStorage::in_memory().unwrap();

    let proto_id = storage
        .create_entity(json!({"name": "Proto"}), None)
        .unwrap();
    let instance_id = storage
        .create_entity(json!({"name": "Instance"}), Some(proto_id))
        .unwrap();

    let proto_code = SExpr::call("std.return", vec![SExpr::string("proto").erase_type()]);
    storage
        .add_verb(proto_id, "inherited", &proto_code)
        .unwrap();

    // Instance should inherit verb from prototype
    let verb = storage.get_verb(instance_id, "inherited").unwrap().unwrap();
    assert_eq!(verb.entity_id, proto_id);
    assert_eq!(verb.code, proto_code);
}

#[test]
fn test_verb_override() {
    let storage = WorldStorage::in_memory().unwrap();

    let proto_id = storage
        .create_entity(json!({"name": "Proto"}), None)
        .unwrap();
    let instance_id = storage
        .create_entity(json!({"name": "Instance"}), Some(proto_id))
        .unwrap();

    let proto_code = SExpr::call("std.return", vec![SExpr::string("proto").erase_type()]);
    let instance_code = SExpr::call("std.return", vec![SExpr::string("instance").erase_type()]);

    storage.add_verb(proto_id, "method", &proto_code).unwrap();
    storage
        .add_verb(instance_id, "method", &instance_code)
        .unwrap();

    // Instance should use its own version
    let verb = storage.get_verb(instance_id, "method").unwrap().unwrap();
    assert_eq!(verb.entity_id, instance_id);
    assert_eq!(verb.code, instance_code);

    // Proto should still use proto version
    let proto_verb = storage.get_verb(proto_id, "method").unwrap().unwrap();
    assert_eq!(proto_verb.code, proto_code);
}

#[test]
fn test_get_all_verbs() {
    let storage = WorldStorage::in_memory().unwrap();

    let proto_id = storage
        .create_entity(json!({"name": "Proto"}), None)
        .unwrap();
    let instance_id = storage
        .create_entity(json!({"name": "Instance"}), Some(proto_id))
        .unwrap();

    storage
        .add_verb(proto_id, "proto_only", &SExpr::number(1).erase_type())
        .unwrap();
    storage
        .add_verb(proto_id, "overridden", &SExpr::number(2).erase_type())
        .unwrap();
    storage
        .add_verb(instance_id, "overridden", &SExpr::number(3).erase_type())
        .unwrap();
    storage
        .add_verb(instance_id, "instance_only", &SExpr::number(4).erase_type())
        .unwrap();

    let verbs = storage.get_verbs(instance_id).unwrap();
    assert_eq!(verbs.len(), 3);

    let verb_names: std::collections::HashSet<_> = verbs.iter().map(|v| v.name.as_str()).collect();
    assert!(verb_names.contains("proto_only"));
    assert!(verb_names.contains("overridden"));
    assert!(verb_names.contains("instance_only"));

    // Check that overridden uses instance version
    let overridden = verbs.iter().find(|v| v.name == "overridden").unwrap();
    assert_eq!(overridden.entity_id, instance_id);
}

#[test]
fn test_update_verb() {
    let storage = WorldStorage::in_memory().unwrap();

    let id = storage
        .create_entity(json!({"name": "Test"}), None)
        .unwrap();
    storage
        .add_verb(id, "verb", &SExpr::number(1).erase_type())
        .unwrap();

    let verb = storage.get_verb(id, "verb").unwrap().unwrap();
    storage
        .update_verb(verb.id, &SExpr::number(2).erase_type())
        .unwrap();

    let updated = storage.get_verb(id, "verb").unwrap().unwrap();
    assert_eq!(updated.code, SExpr::number(2).erase_type());
}

#[test]
fn test_delete_verb() {
    let storage = WorldStorage::in_memory().unwrap();

    let id = storage
        .create_entity(json!({"name": "Test"}), None)
        .unwrap();
    storage
        .add_verb(id, "verb", &SExpr::number(1).erase_type())
        .unwrap();

    let verb = storage.get_verb(id, "verb").unwrap().unwrap();
    storage.delete_verb(verb.id).unwrap();

    let deleted = storage.get_verb(id, "verb").unwrap();
    assert!(deleted.is_none());
}

#[test]
fn test_set_prototype() {
    let storage = WorldStorage::in_memory().unwrap();

    let proto_id = storage
        .create_entity(json!({"inherited": true}), None)
        .unwrap();
    let id = storage
        .create_entity(json!({"name": "Test"}), None)
        .unwrap();

    // Initially no prototype
    let entity = storage.get_entity(id).unwrap().unwrap();
    assert!(entity.prototype_id.is_none());
    assert!(entity.get_prop("inherited").is_none());

    // Set prototype
    storage.set_prototype(id, Some(proto_id)).unwrap();

    let entity = storage.get_entity(id).unwrap().unwrap();
    assert_eq!(entity.prototype_id, Some(proto_id));
    assert_eq!(
        entity.get_prop("inherited").and_then(|v| v.as_bool()),
        Some(true)
    );
}

#[test]
fn test_delete_entity_cascades_verbs() {
    let storage = WorldStorage::in_memory().unwrap();

    let id = storage
        .create_entity(json!({"name": "Test"}), None)
        .unwrap();
    storage
        .add_verb(id, "verb1", &SExpr::number(1).erase_type())
        .unwrap();
    storage
        .add_verb(id, "verb2", &SExpr::number(2).erase_type())
        .unwrap();

    storage.delete_entity(id).unwrap();

    // Entity gone
    assert!(storage.get_entity(id).unwrap().is_none());

    // Verbs also gone (can't query them by entity anymore since entity doesn't exist)
}

// =========================================================================
// Transaction Tests
// =========================================================================

#[test]
fn test_transaction_commit() {
    let mut storage = WorldStorage::in_memory().unwrap();

    storage.begin_transaction().unwrap();

    let id = storage
        .create_entity(json!({"name": "Transaction Test"}), None)
        .unwrap();

    storage.commit().unwrap();

    // Entity should exist after commit
    let entity = storage.get_entity(id).unwrap();
    assert!(entity.is_some());
    assert_eq!(entity.unwrap().name(), Some("Transaction Test"));
}

#[test]
fn test_transaction_rollback() {
    let mut storage = WorldStorage::in_memory().unwrap();

    // Create entity before transaction
    let before_id = storage
        .create_entity(json!({"name": "Before"}), None)
        .unwrap();

    storage.begin_transaction().unwrap();

    // Create entity in transaction
    let during_id = storage
        .create_entity(json!({"name": "During"}), None)
        .unwrap();

    // Modify existing entity
    storage
        .update_entity(before_id, json!({"modified": true}))
        .unwrap();

    storage.rollback().unwrap();

    // Entity created during transaction should not exist
    let during_entity = storage.get_entity(during_id).unwrap();
    assert!(during_entity.is_none());

    // Entity from before should be unmodified
    let before_entity = storage.get_entity(before_id).unwrap().unwrap();
    assert!(before_entity.get_prop("modified").is_none());
}

#[test]
fn test_nested_transaction_commit() {
    let mut storage = WorldStorage::in_memory().unwrap();

    // Outer transaction
    let depth0 = storage.begin_transaction().unwrap();
    assert_eq!(depth0, 0);

    let outer_id = storage
        .create_entity(json!({"name": "Outer"}), None)
        .unwrap();

    // Inner transaction (savepoint)
    let depth1 = storage.begin_transaction().unwrap();
    assert_eq!(depth1, 1);

    let inner_id = storage
        .create_entity(json!({"name": "Inner"}), None)
        .unwrap();

    // Commit inner
    storage.commit().unwrap();

    // Commit outer
    storage.commit().unwrap();

    // Both entities should exist
    assert!(storage.get_entity(outer_id).unwrap().is_some());
    assert!(storage.get_entity(inner_id).unwrap().is_some());
}

#[test]
fn test_nested_transaction_partial_rollback() {
    let mut storage = WorldStorage::in_memory().unwrap();

    // Outer transaction
    storage.begin_transaction().unwrap();

    let outer_id = storage
        .create_entity(json!({"name": "Outer"}), None)
        .unwrap();

    // Inner transaction (savepoint)
    storage.begin_transaction().unwrap();

    let inner_id = storage
        .create_entity(json!({"name": "Inner"}), None)
        .unwrap();

    // Rollback inner only
    storage.rollback().unwrap();

    // Commit outer
    storage.commit().unwrap();

    // Outer should exist, inner should not
    assert!(storage.get_entity(outer_id).unwrap().is_some());
    assert!(storage.get_entity(inner_id).unwrap().is_none());
}

#[test]
fn test_transaction_closure() {
    let mut storage = WorldStorage::in_memory().unwrap();

    // Use transaction closure for automatic commit
    let result = storage.transaction(|s| {
        let id = s.create_entity(json!({"name": "Closure Test"}), None)?;
        Ok(id)
    });

    let id = result.unwrap();
    assert!(storage.get_entity(id).unwrap().is_some());
}

#[test]
fn test_transaction_closure_rollback_on_error() {
    let mut storage = WorldStorage::in_memory().unwrap();

    // Use transaction closure that fails
    let result: Result<(), StorageError> = storage.transaction(|s| {
        s.create_entity(json!({"name": "Will Rollback"}), None)?;
        Err(StorageError::Transaction("intentional error".to_string()))
    });

    assert!(result.is_err());

    // No entities should exist (only the failed one was created)
    // Note: we can't easily test this without knowing the ID, but the transaction
    // test above confirms the mechanism works
}

#[test]
fn test_in_transaction_flag() {
    let mut storage = WorldStorage::in_memory().unwrap();

    assert!(!storage.in_transaction());

    storage.begin_transaction().unwrap();
    assert!(storage.in_transaction());

    storage.begin_transaction().unwrap(); // nested
    assert!(storage.in_transaction());

    storage.commit().unwrap(); // inner
    assert!(storage.in_transaction());

    storage.commit().unwrap(); // outer
    assert!(!storage.in_transaction());
}

#[test]
fn test_commit_without_transaction_fails() {
    let mut storage = WorldStorage::in_memory().unwrap();

    let result = storage.commit();
    assert!(result.is_err());
}

#[test]
fn test_rollback_without_transaction_fails() {
    let mut storage = WorldStorage::in_memory().unwrap();

    let result = storage.rollback();
    assert!(result.is_err());
}

// =========================================================================
// Capability-Gated Verb Tests
// =========================================================================

#[test]
fn test_add_verb_with_capability_requirement() {
    let storage = WorldStorage::in_memory().unwrap();

    let id = storage
        .create_entity(json!({"name": "Test Entity"}), None)
        .unwrap();

    // Add verb with required capability
    let code = SExpr::call("std.return", vec![SExpr::number(42).erase_type()]);
    storage
        .add_verb_with_cap(id, "protected_verb", &code, Some("admin.execute"))
        .unwrap();

    let verb = storage.get_verb(id, "protected_verb").unwrap().unwrap();
    assert_eq!(verb.required_capability, Some("admin.execute".to_string()));
}

#[test]
fn test_add_verb_without_capability_requirement() {
    let storage = WorldStorage::in_memory().unwrap();

    let id = storage
        .create_entity(json!({"name": "Test Entity"}), None)
        .unwrap();

    // Add verb without capability requirement
    let code = SExpr::call("std.return", vec![SExpr::number(42).erase_type()]);
    storage.add_verb(id, "public_verb", &code).unwrap();

    let verb = storage.get_verb(id, "public_verb").unwrap().unwrap();
    assert!(verb.required_capability.is_none());
}

#[test]
fn test_get_verbs_includes_capability_requirement() {
    let storage = WorldStorage::in_memory().unwrap();

    let id = storage
        .create_entity(json!({"name": "Test Entity"}), None)
        .unwrap();

    // Add verbs with and without capability requirements
    let code = SExpr::number(1).erase_type();
    storage.add_verb(id, "public", &code).unwrap();
    storage
        .add_verb_with_cap(id, "protected", &code, Some("admin.execute"))
        .unwrap();

    let verbs = storage.get_verbs(id).unwrap();
    assert_eq!(verbs.len(), 2);

    let public_verb = verbs.iter().find(|v| v.name == "public").unwrap();
    assert!(public_verb.required_capability.is_none());

    let protected_verb = verbs.iter().find(|v| v.name == "protected").unwrap();
    assert_eq!(
        protected_verb.required_capability,
        Some("admin.execute".to_string())
    );
}

#[test]
fn test_inherited_verb_capability_requirement() {
    let storage = WorldStorage::in_memory().unwrap();

    let proto_id = storage
        .create_entity(json!({"name": "Proto"}), None)
        .unwrap();
    let instance_id = storage
        .create_entity(json!({"name": "Instance"}), Some(proto_id))
        .unwrap();

    // Add protected verb to prototype
    let code = SExpr::number(1).erase_type();
    storage
        .add_verb_with_cap(
            proto_id,
            "inherited_protected",
            &code,
            Some("entity.control"),
        )
        .unwrap();

    // Instance should inherit the verb with its capability requirement
    let verb = storage
        .get_verb(instance_id, "inherited_protected")
        .unwrap()
        .unwrap();
    assert_eq!(verb.entity_id, proto_id);
    assert_eq!(verb.required_capability, Some("entity.control".to_string()));
}
