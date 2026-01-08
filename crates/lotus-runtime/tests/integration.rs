//! Integration tests for the full runtime.

use lotus_core::WorldStorage;
use lotus_ir::SExpr;
use lotus_runtime::LotusRuntime;
use serde_json::json;

#[test]
fn test_execute_simple_verb() {
    // Create storage and runtime
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = LotusRuntime::new(storage);

    // Create an entity
    let entity_id = {
        let storage = runtime.storage().lock().unwrap();
        storage
            .create_entity(json!({"name": "Test Entity"}), None)
            .unwrap()
    };

    // Add a simple verb that returns a number
    {
        let storage = runtime.storage().lock().unwrap();
        storage
            .add_verb(entity_id, "test", &SExpr::num(42))
            .unwrap();
    }

    // Execute the verb
    let result = runtime
        .execute_verb(entity_id, "test", vec![], None)
        .unwrap();

    assert_eq!(result, json!(42));
}

#[test]
fn test_execute_verb_with_math() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = LotusRuntime::new(storage);

    let entity_id = {
        let storage = runtime.storage().lock().unwrap();
        storage
            .create_entity(json!({"name": "Math"}), None)
            .unwrap()
    };

    // Add a verb that does 1 + 2
    let verb_code = SExpr::call("math.add", vec![SExpr::num(1.0), SExpr::num(2.0)]);

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(entity_id, "add", &verb_code).unwrap();
    }

    let result = runtime
        .execute_verb(entity_id, "add", vec![], None)
        .unwrap();

    assert_eq!(result.as_f64().unwrap(), 3.0);
}

#[test]
fn test_execute_verb_with_args() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = LotusRuntime::new(storage);

    let entity_id = {
        let storage = runtime.storage().lock().unwrap();
        storage
            .create_entity(json!({"name": "Args"}), None)
            .unwrap()
    };

    // Verb that returns arg 0
    let verb_code = SExpr::call("std.arg", vec![SExpr::num(0.0)]);

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(entity_id, "echo", &verb_code).unwrap();
    }

    let result = runtime
        .execute_verb(entity_id, "echo", vec![json!("hello")], None)
        .unwrap();

    assert_eq!(result, json!("hello"));
}
