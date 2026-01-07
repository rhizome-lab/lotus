//! Object creation flow tests.
//!
//! Tests for create/update operations, prototype assignment,
//! room contents updates, and capability-gated creation.

use serde_json::json;
use viwo_core::WorldStorage;
use viwo_ir::SExpr;
use viwo_runtime::ViwoRuntime;

/// Helper to create a runtime with initial entities
fn setup_world() -> (ViwoRuntime, i64, i64) {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = ViwoRuntime::new(storage);

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
                    SExpr::string("name").erase_type(),
                    SExpr::string("New Object").erase_type(),
                ])
                .erase_type(),
                SExpr::list(vec![
                    SExpr::string("location").erase_type(),
                    SExpr::call("std.var", vec![SExpr::string("room_id")]),
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

    // Should return the new entity
    let new_id = result["id"].as_i64().unwrap();
    assert!(new_id > 0);

    // Verify entity was created
    let storage = runtime.storage().lock().unwrap();
    let entity = storage.get_entity(new_id).unwrap();
    assert_eq!(entity["name"], "New Object");
}

#[test]
fn test_create_entity_with_prototype() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = ViwoRuntime::new(storage);

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
        let verb = SExpr::string("I am an item!");
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
                        SExpr::string("name").erase_type(),
                        SExpr::string("Sword").erase_type(),
                    ])
                    .erase_type(),
                ],
            ),
            SExpr::call("std.arg", vec![SExpr::number(0.0)]),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(player_id, "create_item", &verb).unwrap();
    }

    let result = runtime
        .execute_verb(player_id, "create_item", vec![json!(proto_id)], None)
        .unwrap();

    let new_id = result["id"].as_i64().unwrap();

    // Verify prototype was set
    let storage = runtime.storage().lock().unwrap();
    let entity = storage.get_entity(new_id).unwrap();
    assert_eq!(entity["name"], "Sword");
    assert_eq!(entity["_prototype"], proto_id);

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
            SExpr::call("std.arg", vec![SExpr::number(0.0)]),
            SExpr::call(
                "obj.new",
                vec![
                    SExpr::list(vec![
                        SExpr::string("health").erase_type(),
                        SExpr::number(75.0).erase_type(),
                    ])
                    .erase_type(),
                    SExpr::list(vec![
                        SExpr::string("status").erase_type(),
                        SExpr::string("wounded").erase_type(),
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
    let entity = storage.get_entity(target_id).unwrap();
    assert_eq!(entity["health"], 75);
    assert_eq!(entity["mana"], 50); // Unchanged
    assert_eq!(entity["status"], "wounded"); // New field
}

#[test]
fn test_prototype_chain_verb_resolution() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = ViwoRuntime::new(storage);

    // Create prototype chain: grandparent -> parent -> child
    let (grandparent_id, parent_id, child_id) = {
        let storage = runtime.storage().lock().unwrap();

        let grandparent_id = storage
            .create_entity(json!({"name": "Grandparent", "level": 1}), None)
            .unwrap();

        // Grandparent has a verb
        let gp_verb = SExpr::string("grandparent verb");
        storage
            .add_verb(grandparent_id, "inherited", &gp_verb)
            .unwrap();

        let parent_id = storage
            .create_entity(
                json!({"name": "Parent", "level": 2, "_prototype": grandparent_id}),
                None,
            )
            .unwrap();

        // Parent overrides and adds verbs
        let parent_verb = SExpr::string("parent verb");
        storage
            .add_verb(parent_id, "parent_only", &parent_verb)
            .unwrap();

        let child_id = storage
            .create_entity(
                json!({"name": "Child", "level": 3, "_prototype": parent_id}),
                None,
            )
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
    let runtime = ViwoRuntime::new(storage);

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
                    SExpr::call("std.arg", vec![SExpr::number(0.0)]), // item_id
                    SExpr::call(
                        "obj.new",
                        vec![
                            SExpr::list(vec![
                                SExpr::string("location").erase_type(),
                                SExpr::call("std.arg", vec![SExpr::number(1.0)]), // new_room
                            ])
                            .erase_type(),
                        ],
                    ),
                ],
            ),
            SExpr::string("moved"),
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
    let item = storage.get_entity(item_id).unwrap();
    assert_eq!(item["location"], room2_id);
}

#[test]
fn test_nested_object_creation() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = ViwoRuntime::new(storage);

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
                    SExpr::string("name").erase_type(),
                    SExpr::string("Complex Item").erase_type(),
                ])
                .erase_type(),
                SExpr::list(vec![
                    SExpr::string("stats").erase_type(),
                    SExpr::call(
                        "obj.new",
                        vec![
                            SExpr::list(vec![
                                SExpr::string("attack").erase_type(),
                                SExpr::number(10.0).erase_type(),
                            ])
                            .erase_type(),
                            SExpr::list(vec![
                                SExpr::string("defense").erase_type(),
                                SExpr::number(5.0).erase_type(),
                            ])
                            .erase_type(),
                        ],
                    ),
                ])
                .erase_type(),
                SExpr::list(vec![
                    SExpr::string("tags").erase_type(),
                    SExpr::call(
                        "list.new",
                        vec![
                            SExpr::string("weapon").erase_type(),
                            SExpr::string("rare").erase_type(),
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

    let new_id = result["id"].as_i64().unwrap();

    // Verify nested props
    let storage = runtime.storage().lock().unwrap();
    let entity = storage.get_entity(new_id).unwrap();
    assert_eq!(entity["name"], "Complex Item");
    assert_eq!(entity["stats"]["attack"], 10);
    assert_eq!(entity["stats"]["defense"], 5);
    assert_eq!(entity["tags"][0], "weapon");
    assert_eq!(entity["tags"][1], "rare");
}
