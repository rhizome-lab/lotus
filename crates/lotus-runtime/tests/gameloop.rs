//! Game loop integration tests.
//!
//! These tests exercise the full stack: entities, verbs, capabilities, execution.

use rhizome_lotus_core::WorldStorage;
use rhizome_lotus_ir::SExpr;
use rhizome_lotus_runtime::LotusRuntime;
use serde_json::json;

#[test]
fn test_state_persistence() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = LotusRuntime::new(storage);

    // Create an entity with a counter
    let entity_id = {
        let storage = runtime.storage().lock().unwrap();
        storage
            .create_entity(json!({"name": "Counter", "count": 0}), None)
            .unwrap()
    };

    // Add an increment verb that returns the current count
    let verb_code = SExpr::call(
        "std.seq",
        vec![
            // Get current count from this entity
            SExpr::call(
                "std.let",
                vec![
                    SExpr::str("current").erase_type(),
                    SExpr::call(
                        "obj.get",
                        vec![
                            SExpr::call("std.this", vec![]),
                            SExpr::str("count").erase_type(),
                        ],
                    ),
                ],
            ),
            // Return the current count
            SExpr::call("std.var", vec![SExpr::str("current").erase_type()]),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage
            .add_verb(entity_id, "get_count", &verb_code)
            .unwrap();
    }

    // Execute the verb
    let result = runtime
        .execute_verb(entity_id, "get_count", vec![], None)
        .unwrap();

    assert_eq!(result.as_f64().unwrap(), 0.0);

    // Update the count
    {
        let storage = runtime.storage().lock().unwrap();
        storage
            .update_entity(entity_id, json!({"count": 5}))
            .unwrap();
    }

    // Execute again - should see updated value
    let result = runtime
        .execute_verb(entity_id, "get_count", vec![], None)
        .unwrap();

    assert_eq!(result.as_f64().unwrap(), 5.0);
}

#[test]
fn test_verb_inheritance() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = LotusRuntime::new(storage);

    // Create a base entity with a verb
    let (base_id, child_id) = {
        let storage = runtime.storage().lock().unwrap();
        let base = storage
            .create_entity(json!({"name": "Base"}), None)
            .unwrap();

        // Add verb to base
        storage
            .add_verb(base, "greet", &SExpr::str("Hello from base").erase_type())
            .unwrap();

        // Create child that inherits from base
        let child = storage
            .create_entity(json!({"name": "Child"}), Some(base))
            .unwrap();

        (base, child)
    };

    // Child should inherit the verb
    let result = runtime
        .execute_verb(child_id, "greet", vec![], None)
        .unwrap();

    assert_eq!(result.as_str().unwrap(), "Hello from base");

    // Override verb on child
    {
        let storage = runtime.storage().lock().unwrap();
        storage
            .add_verb(
                child_id,
                "greet",
                &SExpr::str("Hello from child").erase_type(),
            )
            .unwrap();
    }

    // Should now use child's version
    let result = runtime
        .execute_verb(child_id, "greet", vec![], None)
        .unwrap();

    assert_eq!(result.as_str().unwrap(), "Hello from child");

    // Base should still have original
    let result = runtime
        .execute_verb(base_id, "greet", vec![], None)
        .unwrap();

    assert_eq!(result.as_str().unwrap(), "Hello from base");
}
