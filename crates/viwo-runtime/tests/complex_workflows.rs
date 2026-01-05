//! Complex workflow integration tests.

use serde_json::json;
use viwo_core::WorldStorage;
use viwo_ir::SExpr;
use viwo_runtime::ViwoRuntime;

#[test]
fn test_multi_verb_workflow() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = ViwoRuntime::new(storage);

    // Create an entity with multiple interacting verbs
    let entity_id = {
        let storage = runtime.storage().lock().unwrap();
        let id = storage
            .create_entity(json!({"name": "Calculator", "value": 0}), None)
            .unwrap();

        // Add a "set_value" verb
        let set_verb = SExpr::call(
            "std.seq",
            vec![
                SExpr::call(
                    "obj.set",
                    vec![
                        SExpr::call("std.this", vec![]),
                        SExpr::string("value"),
                        SExpr::call("std.arg", vec![SExpr::number(0.0)]),
                    ],
                ),
                SExpr::call(
                    "obj.get",
                    vec![
                        SExpr::call("std.this", vec![]),
                        SExpr::string("value"),
                    ],
                ),
            ],
        );
        storage.add_verb(id, "set_value", &set_verb).unwrap();

        // Add a "get_value" verb
        let get_verb = SExpr::call(
            "obj.get",
            vec![
                SExpr::call("std.this", vec![]),
                SExpr::string("value"),
            ],
        );
        storage.add_verb(id, "get_value", &get_verb).unwrap();

        id
    };

    // Initial value should be 0
    let result = runtime
        .execute_verb(entity_id, "get_value", vec![], None)
        
        .unwrap();
    assert_eq!(result.as_f64().unwrap(), 0.0);

    // Note: set_value modifies __this but changes aren't persisted yet
    // This test documents current behavior
    let result = runtime
        .execute_verb(entity_id, "set_value", vec![json!(42)], None)
        
        .unwrap();
    assert_eq!(result.as_f64().unwrap(), 42.0);
}

#[test]
fn test_conditional_verb() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = ViwoRuntime::new(storage);

    let entity_id = {
        let storage = runtime.storage().lock().unwrap();
        let id = storage
            .create_entity(json!({"name": "Checker"}), None)
            .unwrap();

        // Verb that returns "big" if arg > 10, else "small"
        let check_verb = SExpr::call(
            "std.if",
            vec![
                SExpr::call(
                    "bool.gt",
                    vec![
                        SExpr::call("std.arg", vec![SExpr::number(0.0)]),
                        SExpr::number(10.0),
                    ],
                ),
                SExpr::string("big"),
                SExpr::string("small"),
            ],
        );
        storage.add_verb(id, "check_size", &check_verb).unwrap();

        id
    };

    let result = runtime
        .execute_verb(entity_id, "check_size", vec![json!(5)], None)
        
        .unwrap();
    assert_eq!(result.as_str().unwrap(), "small");

    let result = runtime
        .execute_verb(entity_id, "check_size", vec![json!(15)], None)
        
        .unwrap();
    assert_eq!(result.as_str().unwrap(), "big");
}

#[test]
fn test_loop_in_verb() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = ViwoRuntime::new(storage);

    let entity_id = {
        let storage = runtime.storage().lock().unwrap();
        let id = storage
            .create_entity(json!({"name": "Counter"}), None)
            .unwrap();

        // Verb that sums numbers from 1 to N
        let sum_verb = SExpr::call(
            "std.seq",
            vec![
                // let total = 0
                SExpr::call(
                    "std.let",
                    vec![SExpr::string("total"), SExpr::number(0.0)],
                ),
                // let i = 1
                SExpr::call(
                    "std.let",
                    vec![SExpr::string("i"), SExpr::number(1.0)],
                ),
                // while i <= arg0
                SExpr::call(
                    "std.while",
                    vec![
                        SExpr::call(
                            "bool.lte",
                            vec![
                                SExpr::call("std.var", vec![SExpr::string("i")]),
                                SExpr::call("std.arg", vec![SExpr::number(0.0)]),
                            ],
                        ),
                        SExpr::call(
                            "std.seq",
                            vec![
                                // total = total + i
                                SExpr::call(
                                    "std.set",
                                    vec![
                                        SExpr::string("total"),
                                        SExpr::call(
                                            "math.add",
                                            vec![
                                                SExpr::call("std.var", vec![SExpr::string("total")]),
                                                SExpr::call("std.var", vec![SExpr::string("i")]),
                                            ],
                                        ),
                                    ],
                                ),
                                // i = i + 1
                                SExpr::call(
                                    "std.set",
                                    vec![
                                        SExpr::string("i"),
                                        SExpr::call(
                                            "math.add",
                                            vec![
                                                SExpr::call("std.var", vec![SExpr::string("i")]),
                                                SExpr::number(1.0),
                                            ],
                                        ),
                                    ],
                                ),
                            ],
                        ),
                    ],
                ),
                // return total
                SExpr::call("std.var", vec![SExpr::string("total")]),
            ],
        );
        storage.add_verb(id, "sum", &sum_verb).unwrap();

        id
    };

    // Sum 1 to 5 = 15
    let result = runtime
        .execute_verb(entity_id, "sum", vec![json!(5)], None)
        
        .unwrap();
    assert_eq!(result.as_f64().unwrap(), 15.0);

    // Sum 1 to 10 = 55
    let result = runtime
        .execute_verb(entity_id, "sum", vec![json!(10)], None)
        
        .unwrap();
    assert_eq!(result.as_f64().unwrap(), 55.0);
}

#[test]
fn test_lambda_in_verb() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = ViwoRuntime::new(storage);

    let entity_id = {
        let storage = runtime.storage().lock().unwrap();
        let id = storage
            .create_entity(json!({"name": "Mapper"}), None)
            .unwrap();

        // Verb that creates and calls a lambda
        let lambda_verb = SExpr::call(
            "std.seq",
            vec![
                // let double = (x) => x * 2
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("double"),
                        SExpr::call(
                            "std.lambda",
                            vec![
                                SExpr::list(vec![SExpr::string("x").erase_type()]).erase_type(),
                                SExpr::call(
                                    "math.mul",
                                    vec![
                                        SExpr::call("std.var", vec![SExpr::string("x")]),
                                        SExpr::number(2.0),
                                    ],
                                ),
                            ],
                        ),
                    ],
                ),
                // Call double(arg0)
                SExpr::call(
                    "std.apply",
                    vec![
                        SExpr::call("std.var", vec![SExpr::string("double")]),
                        SExpr::call("std.arg", vec![SExpr::number(0.0)]),
                    ],
                ),
            ],
        );
        storage.add_verb(id, "double", &lambda_verb).unwrap();

        id
    };

    let result = runtime
        .execute_verb(entity_id, "double", vec![json!(7)], None)
        
        .unwrap();
    assert_eq!(result.as_f64().unwrap(), 14.0);
}

#[test]
fn test_list_operations_in_verb() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = ViwoRuntime::new(storage);

    let entity_id = {
        let storage = runtime.storage().lock().unwrap();
        let id = storage
            .create_entity(json!({"name": "ListOps"}), None)
            .unwrap();

        // Verb that creates a list and returns its length
        let list_verb = SExpr::call(
            "std.seq",
            vec![
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("mylist"),
                        SExpr::call(
                            "list.new",
                            vec![
                                SExpr::number(1.0),
                                SExpr::number(2.0),
                                SExpr::number(3.0),
                            ],
                        ),
                    ],
                ),
                SExpr::call(
                    "list.len",
                    vec![SExpr::call("std.var", vec![SExpr::string("mylist")])],
                ),
            ],
        );
        storage.add_verb(id, "list_len", &list_verb).unwrap();

        id
    };

    let result = runtime
        .execute_verb(entity_id, "list_len", vec![], None)
        
        .unwrap();
    assert_eq!(result.as_f64().unwrap(), 3.0);
}
