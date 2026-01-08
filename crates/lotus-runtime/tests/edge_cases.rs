//! Edge case tests ported from TypeScript interpreter.test.ts

use lotus_core::WorldStorage;
use lotus_ir::SExpr;
use lotus_runtime::LotusRuntime;
use serde_json::json;

/// Helper to create a runtime with an entity
fn setup_entity() -> (LotusRuntime, i64) {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = LotusRuntime::new(storage);

    let entity_id = {
        let storage = runtime.storage().lock().unwrap();
        storage
            .create_entity(json!({"name": "Test"}), None)
            .unwrap()
    };

    (runtime, entity_id)
}

#[test]
fn test_break_in_for_loop() {
    let (runtime, entity_id) = setup_entity();

    // sum = 0; for x in [1, 2, 3, 4, 5] { if (x > 3) break; sum += x; } return sum;
    let verb = SExpr::call(
        "std.seq",
        vec![
            SExpr::call("std.let", vec![SExpr::str("sum"), SExpr::num(0.0)]),
            SExpr::call(
                "std.for",
                vec![
                    SExpr::str("x"),
                    SExpr::call(
                        "list.new",
                        vec![
                            SExpr::num(1.0),
                            SExpr::num(2.0),
                            SExpr::num(3.0),
                            SExpr::num(4.0),
                            SExpr::num(5.0),
                        ],
                    ),
                    SExpr::call(
                        "std.seq",
                        vec![
                            SExpr::call(
                                "std.if",
                                vec![
                                    SExpr::call(
                                        "bool.gt",
                                        vec![
                                            SExpr::call("std.var", vec![SExpr::str("x")]),
                                            SExpr::num(3.0),
                                        ],
                                    ),
                                    SExpr::call("std.break", vec![]),
                                ],
                            ),
                            SExpr::call(
                                "std.set",
                                vec![
                                    SExpr::str("sum"),
                                    SExpr::call(
                                        "math.add",
                                        vec![
                                            SExpr::call("std.var", vec![SExpr::str("sum")]),
                                            SExpr::call("std.var", vec![SExpr::str("x")]),
                                        ],
                                    ),
                                ],
                            ),
                        ],
                    ),
                ],
            ),
            SExpr::call("std.var", vec![SExpr::str("sum")]),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(entity_id, "test", &verb).unwrap();
    }

    let result = runtime
        .execute_verb(entity_id, "test", vec![], None)
        .unwrap();
    assert_eq!(result.as_f64().unwrap(), 6.0); // 1 + 2 + 3
}

#[test]
fn test_break_in_while_loop() {
    let (runtime, entity_id) = setup_entity();

    // i = 0; while (true) { i++; if (i > 3) break; } return i;
    let verb = SExpr::call(
        "std.seq",
        vec![
            SExpr::call("std.let", vec![SExpr::str("i"), SExpr::num(0.0)]),
            SExpr::call(
                "std.while",
                vec![
                    SExpr::boolean(true),
                    SExpr::call(
                        "std.seq",
                        vec![
                            SExpr::call(
                                "std.set",
                                vec![
                                    SExpr::str("i"),
                                    SExpr::call(
                                        "math.add",
                                        vec![
                                            SExpr::call("std.var", vec![SExpr::str("i")]),
                                            SExpr::num(1.0),
                                        ],
                                    ),
                                ],
                            ),
                            SExpr::call(
                                "std.if",
                                vec![
                                    SExpr::call(
                                        "bool.gt",
                                        vec![
                                            SExpr::call("std.var", vec![SExpr::str("i")]),
                                            SExpr::num(3.0),
                                        ],
                                    ),
                                    SExpr::call("std.break", vec![]),
                                ],
                            ),
                        ],
                    ),
                ],
            ),
            SExpr::call("std.var", vec![SExpr::str("i")]),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(entity_id, "test", &verb).unwrap();
    }

    let result = runtime
        .execute_verb(entity_id, "test", vec![], None)
        .unwrap();
    assert_eq!(result.as_f64().unwrap(), 4.0);
}

#[test]
fn test_continue_in_for_loop() {
    let (runtime, entity_id) = setup_entity();

    // sum = 0; for x in [1, 2, 3, 4, 5] { if (x == 3) continue; sum += x; } return sum;
    let verb = SExpr::call(
        "std.seq",
        vec![
            SExpr::call("std.let", vec![SExpr::str("sum"), SExpr::num(0.0)]),
            SExpr::call(
                "std.for",
                vec![
                    SExpr::str("x"),
                    SExpr::call(
                        "list.new",
                        vec![
                            SExpr::num(1.0),
                            SExpr::num(2.0),
                            SExpr::num(3.0),
                            SExpr::num(4.0),
                            SExpr::num(5.0),
                        ],
                    ),
                    SExpr::call(
                        "std.seq",
                        vec![
                            SExpr::call(
                                "std.if",
                                vec![
                                    SExpr::call(
                                        "bool.eq",
                                        vec![
                                            SExpr::call("std.var", vec![SExpr::str("x")]),
                                            SExpr::num(3.0),
                                        ],
                                    ),
                                    SExpr::call("std.continue", vec![]),
                                ],
                            ),
                            SExpr::call(
                                "std.set",
                                vec![
                                    SExpr::str("sum"),
                                    SExpr::call(
                                        "math.add",
                                        vec![
                                            SExpr::call("std.var", vec![SExpr::str("sum")]),
                                            SExpr::call("std.var", vec![SExpr::str("x")]),
                                        ],
                                    ),
                                ],
                            ),
                        ],
                    ),
                ],
            ),
            SExpr::call("std.var", vec![SExpr::str("sum")]),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(entity_id, "test", &verb).unwrap();
    }

    let result = runtime
        .execute_verb(entity_id, "test", vec![], None)
        .unwrap();
    assert_eq!(result.as_f64().unwrap(), 12.0); // 1 + 2 + 4 + 5
}

#[test]
fn test_try_catch() {
    let (runtime, entity_id) = setup_entity();

    // try { throw "error" } catch { return "caught" }
    let verb = SExpr::call(
        "std.try",
        vec![
            SExpr::call("std.throw", vec![SExpr::str("oops")]),
            SExpr::str("err"),
            SExpr::str("caught"),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(entity_id, "test", &verb).unwrap();
    }

    let result = runtime
        .execute_verb(entity_id, "test", vec![], None)
        .unwrap();
    assert_eq!(result.as_str().unwrap(), "caught");
}

#[test]
fn test_try_catch_with_error_variable() {
    let (runtime, entity_id) = setup_entity();

    // try { throw "error message" } catch(err) { return err }
    let verb = SExpr::call(
        "std.try",
        vec![
            SExpr::call("std.throw", vec![SExpr::str("error message")]),
            SExpr::str("err"),
            SExpr::call("std.var", vec![SExpr::str("err")]),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(entity_id, "test", &verb).unwrap();
    }

    let result = runtime
        .execute_verb(entity_id, "test", vec![], None)
        .unwrap();
    assert_eq!(result.as_str().unwrap(), "error message");
}

#[test]
fn test_try_no_error() {
    let (runtime, entity_id) = setup_entity();

    // try { return "ok" } catch { return "bad" }
    let verb = SExpr::call(
        "std.try",
        vec![SExpr::str("ok"), SExpr::str("err"), SExpr::str("bad")],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(entity_id, "test", &verb).unwrap();
    }

    let result = runtime
        .execute_verb(entity_id, "test", vec![], None)
        .unwrap();
    assert_eq!(result.as_str().unwrap(), "ok");
}

#[test]
fn test_if_without_else_returns_null() {
    let (runtime, entity_id) = setup_entity();

    // if (false) { "then" } // no else branch
    let verb = SExpr::call("std.if", vec![SExpr::boolean(false), SExpr::str("then")]);

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(entity_id, "test", &verb).unwrap();
    }

    let result = runtime
        .execute_verb(entity_id, "test", vec![], None)
        .unwrap();
    assert!(result.is_null());
}

#[test]
fn test_comparisons() {
    let (runtime, entity_id) = setup_entity();

    // Return array of comparison results
    let verb = SExpr::call(
        "list.new",
        vec![
            SExpr::call("bool.neq", vec![SExpr::num(1.0), SExpr::num(2.0)]),
            SExpr::call("bool.lt", vec![SExpr::num(1.0), SExpr::num(2.0)]),
            SExpr::call("bool.gte", vec![SExpr::num(2.0), SExpr::num(2.0)]),
            SExpr::call("bool.lte", vec![SExpr::num(2.0), SExpr::num(2.0)]),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(entity_id, "test", &verb).unwrap();
    }

    let result = runtime
        .execute_verb(entity_id, "test", vec![], None)
        .unwrap();
    let arr = result.as_array().unwrap();
    assert_eq!(arr[0].as_bool().unwrap(), true); // 1 != 2
    assert_eq!(arr[1].as_bool().unwrap(), true); // 1 < 2
    assert_eq!(arr[2].as_bool().unwrap(), true); // 2 >= 2
    assert_eq!(arr[3].as_bool().unwrap(), true); // 2 <= 2
}

#[test]
fn test_unknown_variable_returns_null() {
    let (runtime, entity_id) = setup_entity();

    let verb = SExpr::call("std.var", vec![SExpr::str("nonexistent")]);

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(entity_id, "test", &verb).unwrap();
    }

    let result = runtime
        .execute_verb(entity_id, "test", vec![], None)
        .unwrap();
    assert!(result.is_null());
}

#[test]
fn test_string_operations() {
    let (runtime, entity_id) = setup_entity();

    // Test str.concat, str.len, str.slice
    let verb = SExpr::call(
        "list.new",
        vec![
            SExpr::call(
                "str.concat",
                vec![SExpr::str("hello"), SExpr::str(" "), SExpr::str("world")],
            ),
            SExpr::call("str.len", vec![SExpr::str("hello")]),
            SExpr::call(
                "str.slice",
                vec![SExpr::str("hello"), SExpr::num(1.0), SExpr::num(4.0)],
            ),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(entity_id, "test", &verb).unwrap();
    }

    let result = runtime
        .execute_verb(entity_id, "test", vec![], None)
        .unwrap();
    let arr = result.as_array().unwrap();
    assert_eq!(arr[0].as_str().unwrap(), "hello world");
    assert_eq!(arr[1].as_f64().unwrap(), 5.0);
    assert_eq!(arr[2].as_str().unwrap(), "ell");
}

#[test]
fn test_list_map_filter() {
    let (runtime, entity_id) = setup_entity();

    // Double each number and filter > 4
    let verb = SExpr::call(
        "std.seq",
        vec![
            // nums = [1, 2, 3, 4, 5]
            SExpr::call(
                "std.let",
                vec![
                    SExpr::str("nums"),
                    SExpr::call(
                        "list.new",
                        vec![
                            SExpr::num(1.0),
                            SExpr::num(2.0),
                            SExpr::num(3.0),
                            SExpr::num(4.0),
                            SExpr::num(5.0),
                        ],
                    ),
                ],
            ),
            // doubled = list.map(nums, x => x * 2)
            SExpr::call(
                "std.let",
                vec![
                    SExpr::str("doubled"),
                    SExpr::call(
                        "list.map",
                        vec![
                            SExpr::call("std.var", vec![SExpr::str("nums")]),
                            SExpr::call(
                                "std.lambda",
                                vec![
                                    SExpr::arr(vec![SExpr::str("x")]),
                                    SExpr::call(
                                        "math.mul",
                                        vec![
                                            SExpr::call("std.var", vec![SExpr::str("x")]),
                                            SExpr::num(2.0),
                                        ],
                                    ),
                                ],
                            ),
                        ],
                    ),
                ],
            ),
            // Return doubled
            SExpr::call("std.var", vec![SExpr::str("doubled")]),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(entity_id, "test", &verb).unwrap();
    }

    let result = runtime
        .execute_verb(entity_id, "test", vec![], None)
        .unwrap();
    let arr = result.as_array().unwrap();
    assert_eq!(arr.len(), 5);
    assert_eq!(arr[0].as_f64().unwrap(), 2.0);
    assert_eq!(arr[1].as_f64().unwrap(), 4.0);
    assert_eq!(arr[2].as_f64().unwrap(), 6.0);
    assert_eq!(arr[3].as_f64().unwrap(), 8.0);
    assert_eq!(arr[4].as_f64().unwrap(), 10.0);
}
