//! Tests for verb-to-verb calling and entity interaction from scripts.

use lotus_core::WorldStorage;
use lotus_ir::SExpr;
use lotus_runtime::LotusRuntime;
use serde_json::json;

#[test]
fn test_update_entity_from_verb() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = LotusRuntime::new(storage);

    let entity_id = {
        let storage = runtime.storage().lock().unwrap();
        storage
            .create_entity(json!({"name": "Counter", "count": 0}), None)
            .unwrap()
    };

    // Add verb that increments count
    let increment_verb = SExpr::call(
        "std.seq",
        vec![
            // Get current count
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
            // Set new count (current + 1)
            SExpr::call(
                "obj.set",
                vec![
                    SExpr::call("std.this", vec![]),
                    SExpr::str("count").erase_type(),
                    SExpr::call(
                        "math.add",
                        vec![
                            SExpr::call("std.var", vec![SExpr::str("current").erase_type()]),
                            SExpr::num(1).erase_type(),
                        ],
                    ),
                ],
            ),
            // Return new count
            SExpr::call(
                "obj.get",
                vec![
                    SExpr::call("std.this", vec![]),
                    SExpr::str("count").erase_type(),
                ],
            ),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage
            .add_verb(entity_id, "increment", &increment_verb)
            .unwrap();
    }

    // Execute increment
    let result = runtime
        .execute_verb(entity_id, "increment", vec![], None)
        .unwrap();

    assert_eq!(result.as_f64().unwrap(), 1.0);

    // Verify persistence
    let entity = {
        let storage = runtime.storage().lock().unwrap();
        storage.get_entity(entity_id).unwrap().unwrap()
    };

    assert_eq!(entity.props["count"], 1);
}

#[test]
fn test_call_another_verb() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = LotusRuntime::new(storage);

    let entity_id = {
        let storage = runtime.storage().lock().unwrap();
        let id = storage
            .create_entity(json!({"name": "Test"}), None)
            .unwrap();

        // Add a helper verb
        storage
            .add_verb(id, "helper", &SExpr::str("helper_result").erase_type())
            .unwrap();

        // Add a verb that calls helper
        let caller_verb = SExpr::call(
            "call",
            vec![
                SExpr::call("std.this", vec![]),
                SExpr::str("helper").erase_type(),
            ],
        );
        storage.add_verb(id, "caller", &caller_verb).unwrap();

        id
    };

    // Execute caller - should return helper's result
    let result = runtime
        .execute_verb(entity_id, "caller", vec![], None)
        .unwrap();

    assert_eq!(result.as_str().unwrap(), "helper_result");
}
