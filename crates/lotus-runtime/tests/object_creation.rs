//! Object creation flow tests.
//!
//! Tests for create/update operations, prototype assignment,
//! room contents updates, and capability-gated creation.

use lotus_core::WorldStorage;
use lotus_ir::SExpr;
use lotus_runtime::LotusRuntime;
use serde_json::json;

/// Helper to create a runtime with initial entities
fn setup_world() -> (LotusRuntime, i64, i64) {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = LotusRuntime::new(storage);

    let (room_id, player_id) = {
        let storage = runtime.storage().lock().unwrap();

        // Create a room
        let room_id = storage
            .create_entity(
                json!({
                    "name": "Test Room",
                    "contents": []
                }),
                None,
            )
            .unwrap();

        // Create a player in the room
        let player_id = storage
            .create_entity(
                json!({
                    "name": "Test Player",
                    "location": room_id
                }),
                None,
            )
            .unwrap();

        // Update room contents
        storage
            .update_entity(room_id, json!({"contents": [player_id]}))
            .unwrap();

        (room_id, player_id)
    };

    (runtime, room_id, player_id)
}

#[test]
fn test_create_entity_via_opcode() {
    let (runtime, room_id, player_id) = setup_world();

    // Verb that creates a new entity
    let verb = SExpr::call(
        "create",
        vec![SExpr::call(
            "obj.new",
            vec![
                SExpr::list(vec![
                    SExpr::str("name").erase_type(),
                    SExpr::str("New Object").erase_type(),
                ])
                .erase_type(),
                SExpr::list(vec![
                    SExpr::str("location").erase_type(),
                    SExpr::call("std.var", vec![SExpr::str("room_id").erase_type()]),
                ])
                .erase_type(),
            ],
        )],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(player_id, "create_object", &verb).unwrap();
    }

    // Execute with room_id in context
    let result = runtime
        .execute_verb(player_id, "create_object", vec![json!(room_id)], None)
        .unwrap();

    // Should return the new entity ID
    let new_id = result.as_i64().unwrap();
    assert!(new_id > 0);

    // Verify entity was created
    let storage = runtime.storage().lock().unwrap();
    let entity = storage.get_entity(new_id).unwrap().unwrap();
    assert_eq!(entity.props["name"], "New Object");
}

#[test]
fn test_create_entity_with_prototype() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = LotusRuntime::new(storage);

    // Create a prototype entity
    let (proto_id, player_id) = {
        let storage = runtime.storage().lock().unwrap();

        let proto_id = storage
            .create_entity(
                json!({
                    "name": "Item Prototype",
                    "type": "item",
                    "weight": 1,
                    "takeable": true
                }),
                None,
            )
            .unwrap();

        // Add a verb to the prototype
        let verb = SExpr::str("I am an item!").erase_type();
        storage.add_verb(proto_id, "describe", &verb).unwrap();

        let player_id = storage
            .create_entity(json!({"name": "Player"}), None)
            .unwrap();

        (proto_id, player_id)
    };

    // Verb that creates entity with prototype
    let verb = SExpr::call(
        "create",
        vec![
            SExpr::call(
                "obj.new",
                vec![
                    SExpr::list(vec![
                        SExpr::str("name").erase_type(),
                        SExpr::str("Sword").erase_type(),
                    ])
                    .erase_type(),
                ],
            ),
            SExpr::call("std.arg", vec![SExpr::num(0.0).erase_type()]),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(player_id, "create_item", &verb).unwrap();
    }

    let result = runtime
        .execute_verb(player_id, "create_item", vec![json!(proto_id)], None)
        .unwrap();

    let new_id = result.as_i64().unwrap();

    // Verify prototype was set
    let storage = runtime.storage().lock().unwrap();
    let entity = storage.get_entity(new_id).unwrap().unwrap();
    assert_eq!(entity.props["name"], "Sword");
    assert_eq!(entity.prototype_id, Some(proto_id));

    // Verify verb inheritance works
    let verbs = storage.get_verbs(new_id).unwrap();
    let describe = verbs.iter().find(|v| v.name == "describe");
    assert!(describe.is_some(), "Should inherit verb from prototype");
}

#[test]
fn test_update_entity_modifies_props() {
    let (runtime, _room_id, player_id) = setup_world();

    // Create a target entity
    let target_id = {
        let storage = runtime.storage().lock().unwrap();
        storage
            .create_entity(
                json!({
                    "name": "Target",
                    "health": 100,
                    "mana": 50
                }),
                None,
            )
            .unwrap()
    };

    // Verb that updates entity
    let verb = SExpr::call(
        "update",
        vec![
            SExpr::call("std.arg", vec![SExpr::num(0.0).erase_type()]),
            SExpr::call(
                "obj.new",
                vec![
                    SExpr::list(vec![
                        SExpr::str("health").erase_type(),
                        SExpr::num(75.0).erase_type(),
                    ])
                    .erase_type(),
                    SExpr::list(vec![
                        SExpr::str("status").erase_type(),
                        SExpr::str("wounded").erase_type(),
                    ])
                    .erase_type(),
                ],
            ),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(player_id, "damage", &verb).unwrap();
    }

    runtime
        .execute_verb(player_id, "damage", vec![json!(target_id)], None)
        .unwrap();

    // Verify entity was updated
    let storage = runtime.storage().lock().unwrap();
    let entity = storage.get_entity(target_id).unwrap().unwrap();
    assert_eq!(entity.props["health"], 75);
    assert_eq!(entity.props["mana"], 50); // Unchanged
    assert_eq!(entity.props["status"], "wounded"); // New field
}

#[test]
fn test_prototype_chain_verb_resolution() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = LotusRuntime::new(storage);

    // Create prototype chain: grandparent -> parent -> child
    let (grandparent_id, parent_id, child_id) = {
        let storage = runtime.storage().lock().unwrap();

        let grandparent_id = storage
            .create_entity(json!({"name": "Grandparent", "level": 1}), None)
            .unwrap();

        // Grandparent has a verb
        let gp_verb = SExpr::str("grandparent verb").erase_type();
        storage
            .add_verb(grandparent_id, "inherited", &gp_verb)
            .unwrap();

        let parent_id = storage
            .create_entity(json!({"name": "Parent", "level": 2}), Some(grandparent_id))
            .unwrap();

        // Parent overrides and adds verbs
        let parent_verb = SExpr::str("parent verb").erase_type();
        storage
            .add_verb(parent_id, "parent_only", &parent_verb)
            .unwrap();

        let child_id = storage
            .create_entity(json!({"name": "Child", "level": 3}), Some(parent_id))
            .unwrap();

        (grandparent_id, parent_id, child_id)
    };

    // Child should inherit from grandparent through parent
    let result = runtime
        .execute_verb(child_id, "inherited", vec![], None)
        .unwrap();
    assert_eq!(result.as_str().unwrap(), "grandparent verb");

    // Child should also have access to parent's verb
    let result = runtime
        .execute_verb(child_id, "parent_only", vec![], None)
        .unwrap();
    assert_eq!(result.as_str().unwrap(), "parent verb");
}

#[test]
fn test_entity_location_tracking() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = LotusRuntime::new(storage);

    let (room1_id, room2_id, item_id, player_id) = {
        let storage = runtime.storage().lock().unwrap();

        let room1_id = storage
            .create_entity(json!({"name": "Room 1", "contents": []}), None)
            .unwrap();

        let room2_id = storage
            .create_entity(json!({"name": "Room 2", "contents": []}), None)
            .unwrap();

        let item_id = storage
            .create_entity(json!({"name": "Key", "location": room1_id}), None)
            .unwrap();

        // Update room1 contents
        storage
            .update_entity(room1_id, json!({"contents": [item_id]}))
            .unwrap();

        let player_id = storage
            .create_entity(json!({"name": "Player"}), None)
            .unwrap();

        (room1_id, room2_id, item_id, player_id)
    };

    // Verb to move item to new room
    let verb = SExpr::call(
        "std.seq",
        vec![
            // Update item location
            SExpr::call(
                "update",
                vec![
                    SExpr::call("std.arg", vec![SExpr::num(0.0).erase_type()]), // item_id
                    SExpr::call(
                        "obj.new",
                        vec![
                            SExpr::list(vec![
                                SExpr::str("location").erase_type(),
                                SExpr::call("std.arg", vec![SExpr::num(1.0).erase_type()]), // new_room
                            ])
                            .erase_type(),
                        ],
                    ),
                ],
            ),
            SExpr::str("moved").erase_type(),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(player_id, "move_item", &verb).unwrap();
    }

    runtime
        .execute_verb(
            player_id,
            "move_item",
            vec![json!(item_id), json!(room2_id)],
            None,
        )
        .unwrap();

    // Verify item moved
    let storage = runtime.storage().lock().unwrap();
    let item = storage.get_entity(item_id).unwrap().unwrap();
    assert_eq!(item.props["location"], room2_id);
}

#[test]
fn test_nested_object_creation() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = LotusRuntime::new(storage);

    let player_id = {
        let storage = runtime.storage().lock().unwrap();
        storage
            .create_entity(json!({"name": "Player"}), None)
            .unwrap()
    };

    // Verb that creates entity with nested object props
    let verb = SExpr::call(
        "create",
        vec![SExpr::call(
            "obj.new",
            vec![
                SExpr::list(vec![
                    SExpr::str("name").erase_type(),
                    SExpr::str("Complex Item").erase_type(),
                ])
                .erase_type(),
                SExpr::list(vec![
                    SExpr::str("stats").erase_type(),
                    SExpr::call(
                        "obj.new",
                        vec![
                            SExpr::list(vec![
                                SExpr::str("attack").erase_type(),
                                SExpr::num(10.0).erase_type(),
                            ])
                            .erase_type(),
                            SExpr::list(vec![
                                SExpr::str("defense").erase_type(),
                                SExpr::num(5.0).erase_type(),
                            ])
                            .erase_type(),
                        ],
                    ),
                ])
                .erase_type(),
                SExpr::list(vec![
                    SExpr::str("tags").erase_type(),
                    SExpr::call(
                        "list.new",
                        vec![
                            SExpr::str("weapon").erase_type(),
                            SExpr::str("rare").erase_type(),
                        ],
                    ),
                ])
                .erase_type(),
            ],
        )],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage
            .add_verb(player_id, "create_complex", &verb)
            .unwrap();
    }

    let result = runtime
        .execute_verb(player_id, "create_complex", vec![], None)
        .unwrap();

    let new_id = result.as_i64().unwrap();

    // Verify nested props
    let storage = runtime.storage().lock().unwrap();
    let entity = storage.get_entity(new_id).unwrap().unwrap();
    assert_eq!(entity.props["name"], "Complex Item");
    assert_eq!(entity.props["stats"]["attack"], 10);
    assert_eq!(entity.props["stats"]["defense"], 5);
    assert_eq!(entity.props["tags"][0], "weapon");
    assert_eq!(entity.props["tags"][1], "rare");
}
