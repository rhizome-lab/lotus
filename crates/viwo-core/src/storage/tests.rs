//! Tests for WorldStorage.

use super::*;
use serde_json::json;
use viwo_ir::SExpr;

#[test]
fn test_create_and_get_entity() {
    let storage = WorldStorage::in_memory().unwrap();

    let id = storage.create_entity(json!({"name": "Test Entity"}), None).unwrap();
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

    let id = storage.create_entity(json!({"name": "Original"}), None).unwrap();
    storage.update_entity(id, json!({"description": "Added description"})).unwrap();

    let entity = storage.get_entity(id).unwrap().unwrap();
    assert_eq!(entity.name(), Some("Original"));
    assert_eq!(entity.description(), Some("Added description"));
}

#[test]
fn test_delete_entity() {
    let storage = WorldStorage::in_memory().unwrap();

    let id = storage.create_entity(json!({"name": "To Delete"}), None).unwrap();
    storage.delete_entity(id).unwrap();

    let entity = storage.get_entity(id).unwrap();
    assert!(entity.is_none());
}

#[test]
fn test_prototype_chain() {
    let storage = WorldStorage::in_memory().unwrap();

    // Create a prototype
    let proto_id = storage.create_entity(
        json!({"name": "Prototype", "inherited_prop": "from_proto"}),
        None
    ).unwrap();

    // Create an instance
    let instance_id = storage.create_entity(
        json!({"name": "Instance", "own_prop": "from_instance"}),
        Some(proto_id)
    ).unwrap();

    let instance = storage.get_entity(instance_id).unwrap().unwrap();

    // Should have both own and inherited props
    assert_eq!(instance.name(), Some("Instance")); // Overrides proto
    assert_eq!(instance.get_prop("own_prop").and_then(|v| v.as_str()), Some("from_instance"));
    assert_eq!(instance.get_prop("inherited_prop").and_then(|v| v.as_str()), Some("from_proto"));
}

#[test]
fn test_deep_prototype_chain() {
    let storage = WorldStorage::in_memory().unwrap();

    // Create chain: root -> mid -> leaf
    let root_id = storage.create_entity(json!({"level": "root", "root_only": true}), None).unwrap();
    let mid_id = storage.create_entity(json!({"level": "mid", "mid_only": true}), Some(root_id)).unwrap();
    let leaf_id = storage.create_entity(json!({"level": "leaf"}), Some(mid_id)).unwrap();

    let leaf = storage.get_entity(leaf_id).unwrap().unwrap();

    // Leaf overrides level
    assert_eq!(leaf.get_prop("level").and_then(|v| v.as_str()), Some("leaf"));
    // But inherits from ancestors
    assert_eq!(leaf.get_prop("mid_only").and_then(|v| v.as_bool()), Some(true));
    assert_eq!(leaf.get_prop("root_only").and_then(|v| v.as_bool()), Some(true));
}

#[test]
fn test_add_and_get_verb() {
    let storage = WorldStorage::in_memory().unwrap();

    let id = storage.create_entity(json!({"name": "Test"}), None).unwrap();
    let code = SExpr::call("std.return", vec![SExpr::number(42)]);

    storage.add_verb(id, "test_verb", &code).unwrap();

    let verb = storage.get_verb(id, "test_verb").unwrap().unwrap();
    assert_eq!(verb.name, "test_verb");
    assert_eq!(verb.entity_id, id);
    assert_eq!(verb.code, code);
}

#[test]
fn test_verb_not_found() {
    let storage = WorldStorage::in_memory().unwrap();

    let id = storage.create_entity(json!({"name": "Test"}), None).unwrap();

    let verb = storage.get_verb(id, "nonexistent").unwrap();
    assert!(verb.is_none());
}

#[test]
fn test_verb_inheritance() {
    let storage = WorldStorage::in_memory().unwrap();

    let proto_id = storage.create_entity(json!({"name": "Proto"}), None).unwrap();
    let instance_id = storage.create_entity(json!({"name": "Instance"}), Some(proto_id)).unwrap();

    let proto_code = SExpr::call("std.return", vec![SExpr::string("proto")]);
    storage.add_verb(proto_id, "inherited", &proto_code).unwrap();

    // Instance should inherit verb from prototype
    let verb = storage.get_verb(instance_id, "inherited").unwrap().unwrap();
    assert_eq!(verb.entity_id, proto_id);
    assert_eq!(verb.code, proto_code);
}

#[test]
fn test_verb_override() {
    let storage = WorldStorage::in_memory().unwrap();

    let proto_id = storage.create_entity(json!({"name": "Proto"}), None).unwrap();
    let instance_id = storage.create_entity(json!({"name": "Instance"}), Some(proto_id)).unwrap();

    let proto_code = SExpr::call("std.return", vec![SExpr::string("proto")]);
    let instance_code = SExpr::call("std.return", vec![SExpr::string("instance")]);

    storage.add_verb(proto_id, "method", &proto_code).unwrap();
    storage.add_verb(instance_id, "method", &instance_code).unwrap();

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

    let proto_id = storage.create_entity(json!({"name": "Proto"}), None).unwrap();
    let instance_id = storage.create_entity(json!({"name": "Instance"}), Some(proto_id)).unwrap();

    storage.add_verb(proto_id, "proto_only", &SExpr::number(1)).unwrap();
    storage.add_verb(proto_id, "overridden", &SExpr::number(2)).unwrap();
    storage.add_verb(instance_id, "overridden", &SExpr::number(3)).unwrap();
    storage.add_verb(instance_id, "instance_only", &SExpr::number(4)).unwrap();

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

    let id = storage.create_entity(json!({"name": "Test"}), None).unwrap();
    storage.add_verb(id, "verb", &SExpr::number(1)).unwrap();

    let verb = storage.get_verb(id, "verb").unwrap().unwrap();
    storage.update_verb(verb.id, &SExpr::number(2)).unwrap();

    let updated = storage.get_verb(id, "verb").unwrap().unwrap();
    assert_eq!(updated.code, SExpr::number(2));
}

#[test]
fn test_delete_verb() {
    let storage = WorldStorage::in_memory().unwrap();

    let id = storage.create_entity(json!({"name": "Test"}), None).unwrap();
    storage.add_verb(id, "verb", &SExpr::number(1)).unwrap();

    let verb = storage.get_verb(id, "verb").unwrap().unwrap();
    storage.delete_verb(verb.id).unwrap();

    let deleted = storage.get_verb(id, "verb").unwrap();
    assert!(deleted.is_none());
}

#[test]
fn test_set_prototype() {
    let storage = WorldStorage::in_memory().unwrap();

    let proto_id = storage.create_entity(json!({"inherited": true}), None).unwrap();
    let id = storage.create_entity(json!({"name": "Test"}), None).unwrap();

    // Initially no prototype
    let entity = storage.get_entity(id).unwrap().unwrap();
    assert!(entity.prototype_id.is_none());
    assert!(entity.get_prop("inherited").is_none());

    // Set prototype
    storage.set_prototype(id, Some(proto_id)).unwrap();

    let entity = storage.get_entity(id).unwrap().unwrap();
    assert_eq!(entity.prototype_id, Some(proto_id));
    assert_eq!(entity.get_prop("inherited").and_then(|v| v.as_bool()), Some(true));
}

#[test]
fn test_delete_entity_cascades_verbs() {
    let storage = WorldStorage::in_memory().unwrap();

    let id = storage.create_entity(json!({"name": "Test"}), None).unwrap();
    storage.add_verb(id, "verb1", &SExpr::number(1)).unwrap();
    storage.add_verb(id, "verb2", &SExpr::number(2)).unwrap();

    storage.delete_entity(id).unwrap();

    // Entity gone
    assert!(storage.get_entity(id).unwrap().is_none());

    // Verbs also gone (can't query them by entity anymore since entity doesn't exist)
}
