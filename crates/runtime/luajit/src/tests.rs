//! Tests for viwo-runtime-luajit.
//!
//! Compile tests are in each library module (codegen/std.rs, codegen/math.rs, etc.)
//! This file contains general compile tests and execution tests.

use crate::codegen::compile;
use viwo_ir::SExpr;

// ============================================================================
// General compile tests
// ============================================================================

#[test]
fn test_compile_literals() {
    assert_eq!(compile(&SExpr::null()).unwrap(), "return null");
    assert_eq!(compile(&SExpr::bool(true)).unwrap(), "return true");
    assert_eq!(compile(&SExpr::bool(false)).unwrap(), "return false");
    assert_eq!(compile(&SExpr::number(42.0)).unwrap(), "return 42");
    assert_eq!(compile(&SExpr::number(3.14)).unwrap(), "return 3.14");
    assert_eq!(
        compile(&SExpr::string("hello")).unwrap(),
        "return \"hello\""
    );
}

#[test]
fn test_compile_string_escaping() {
    assert_eq!(
        compile(&SExpr::string("line1\nline2")).unwrap(),
        "return [[line1\nline2]]"
    );
    assert_eq!(
        compile(&SExpr::string("with \"quotes\"")).unwrap(),
        "return \"with \\\"quotes\\\"\""
    );
}

#[test]
fn test_compile_unknown_opcode() {
    let expr = SExpr::call("custom.opcode", vec![SExpr::number(1), SExpr::number(2)]);
    // Unknown opcodes become function calls
    assert_eq!(compile(&expr).unwrap(), "return custom_opcode(1, 2)");
}

// ============================================================================
// Execution tests - actually run generated Lua code
// ============================================================================

use crate::execute;
use serde_json::json;

#[test]
fn test_execute_literal_number() {
    let result = execute(&SExpr::number(42)).unwrap();
    assert_eq!(result, json!(42));
}

#[test]
fn test_execute_literal_string() {
    let result = execute(&SExpr::string("hello")).unwrap();
    assert_eq!(result, json!("hello"));
}

#[test]
fn test_execute_literal_bool() {
    let result = execute(&SExpr::bool(true)).unwrap();
    assert_eq!(result, json!(true));

    let result = execute(&SExpr::bool(false)).unwrap();
    assert_eq!(result, json!(false));
}

#[test]
fn test_execute_literal_null() {
    let result = execute(&SExpr::null()).unwrap();
    assert_eq!(result, serde_json::Value::Null);
}

#[test]
fn test_execute_arithmetic() {
    // 2 + 3
    let expr = SExpr::call("+", vec![SExpr::number(2), SExpr::number(3)]);
    let result = execute(&expr).unwrap();
    assert_eq!(result.as_i64(), Some(5));

    // 10 - 4
    let expr = SExpr::call("-", vec![SExpr::number(10), SExpr::number(4)]);
    let result = execute(&expr).unwrap();
    assert_eq!(result.as_i64(), Some(6));

    // 6 * 7
    let expr = SExpr::call("*", vec![SExpr::number(6), SExpr::number(7)]);
    let result = execute(&expr).unwrap();
    assert_eq!(result.as_i64(), Some(42));

    // 15 / 3
    let expr = SExpr::call("/", vec![SExpr::number(15), SExpr::number(3)]);
    let result = execute(&expr).unwrap();
    assert_eq!(result.as_i64(), Some(5));
}

#[test]
fn test_execute_comparison() {
    // 1 == 1
    let expr = SExpr::call("==", vec![SExpr::number(1), SExpr::number(1)]);
    let result = execute(&expr).unwrap();
    assert_eq!(result, json!(true));

    // 1 != 2
    let expr = SExpr::call("!=", vec![SExpr::number(1), SExpr::number(2)]);
    let result = execute(&expr).unwrap();
    assert_eq!(result, json!(true));

    // 5 > 3
    let expr = SExpr::call(">", vec![SExpr::number(5), SExpr::number(3)]);
    let result = execute(&expr).unwrap();
    assert_eq!(result, json!(true));

    // 2 < 2
    let expr = SExpr::call("<", vec![SExpr::number(2), SExpr::number(2)]);
    let result = execute(&expr).unwrap();
    assert_eq!(result, json!(false));
}

#[test]
fn test_execute_logical() {
    // true && false
    let expr = SExpr::call("&&", vec![SExpr::bool(true), SExpr::bool(false)]);
    let result = execute(&expr).unwrap();
    assert_eq!(result, json!(false));

    // true || false
    let expr = SExpr::call("||", vec![SExpr::bool(true), SExpr::bool(false)]);
    let result = execute(&expr).unwrap();
    assert_eq!(result, json!(true));

    // !true
    let expr = SExpr::call("!", vec![SExpr::bool(true)]);
    let result = execute(&expr).unwrap();
    assert_eq!(result, json!(false));
}

#[test]
fn test_execute_string_concat() {
    let expr = SExpr::call(
        "str.concat",
        vec![
            SExpr::string("Hello"),
            SExpr::string(", "),
            SExpr::string("World!"),
        ],
    );
    let result = execute(&expr).unwrap();
    assert_eq!(result, json!("Hello, World!"));
}

#[test]
fn test_execute_string_len() {
    let expr = SExpr::call("str.len", vec![SExpr::string("hello")]);
    let result = execute(&expr).unwrap();
    assert_eq!(result.as_i64(), Some(5));
}

#[test]
fn test_execute_if_true() {
    // if true then 1 else 2
    let expr = SExpr::call(
        "std.if",
        vec![SExpr::bool(true), SExpr::number(1), SExpr::number(2)],
    );
    let result = execute(&expr).unwrap();
    assert_eq!(result.as_i64(), Some(1));
}

#[test]
fn test_execute_if_false() {
    // if false then 1 else 2
    let expr = SExpr::call(
        "std.if",
        vec![SExpr::bool(false), SExpr::number(1), SExpr::number(2)],
    );
    let result = execute(&expr).unwrap();
    assert_eq!(result.as_i64(), Some(2));
}

#[test]
fn test_execute_seq_with_let_and_var() {
    // { let x = 10; x }
    let expr = SExpr::call(
        "std.seq",
        vec![
            SExpr::call("std.let", vec![SExpr::string("x"), SExpr::number(10)]),
            SExpr::call("std.var", vec![SExpr::string("x")]),
        ],
    );
    let result = execute(&expr).unwrap();
    assert_eq!(result.as_i64(), Some(10));
}

#[test]
fn test_execute_nested_arithmetic() {
    // (1 + 2) * (3 + 4) = 3 * 7 = 21
    let expr = SExpr::call(
        "*",
        vec![
            SExpr::call("+", vec![SExpr::number(1), SExpr::number(2)]),
            SExpr::call("+", vec![SExpr::number(3), SExpr::number(4)]),
        ],
    );
    let result = execute(&expr).unwrap();
    assert_eq!(result.as_i64(), Some(21));
}

#[test]
fn test_execute_list_new() {
    let expr = SExpr::call(
        "list.new",
        vec![SExpr::number(1), SExpr::number(2), SExpr::number(3)],
    );
    let result = execute(&expr).unwrap();
    assert!(result.is_array());
    assert_eq!(result.as_array().unwrap().len(), 3);
}

#[test]
fn test_execute_list_empty() {
    let expr = SExpr::call("list.new", vec![]);
    let result = execute(&expr).unwrap();
    assert!(result.is_array());
    assert!(result.as_array().unwrap().is_empty());
}

#[test]
fn test_execute_list_with_null() {
    let expr = SExpr::call(
        "list.new",
        vec![SExpr::number(1), SExpr::null(), SExpr::number(3)],
    );
    let result = execute(&expr).unwrap();
    let arr = result.as_array().unwrap();
    assert_eq!(arr.len(), 3);
    assert_eq!(arr[1], serde_json::Value::Null);
}

#[test]
fn test_execute_lambda_call() {
    use crate::Runtime;
    let runtime = Runtime::new().unwrap();
    let code = r#"
        local add = function(x, y)
            return x + y
        end
        return add(3, 4)
    "#;
    let result = runtime.execute_lua(code).unwrap();
    assert_eq!(result.as_i64(), Some(7));
}

#[test]
fn test_execute_complex_expression() {
    // let x = 5; let y = 10; if x < y then x + y else x - y
    let expr = SExpr::call(
        "std.seq",
        vec![
            SExpr::call("std.let", vec![SExpr::string("x"), SExpr::number(5)]),
            SExpr::call("std.let", vec![SExpr::string("y"), SExpr::number(10)]),
            SExpr::call(
                "std.if",
                vec![
                    SExpr::call(
                        "<",
                        vec![
                            SExpr::call("std.var", vec![SExpr::string("x")]),
                            SExpr::call("std.var", vec![SExpr::string("y")]),
                        ],
                    ),
                    SExpr::call(
                        "+",
                        vec![
                            SExpr::call("std.var", vec![SExpr::string("x")]),
                            SExpr::call("std.var", vec![SExpr::string("y")]),
                        ],
                    ),
                    SExpr::call(
                        "-",
                        vec![
                            SExpr::call("std.var", vec![SExpr::string("x")]),
                            SExpr::call("std.var", vec![SExpr::string("y")]),
                        ],
                    ),
                ],
            ),
        ],
    );
    let result = execute(&expr).unwrap();
    assert_eq!(result.as_i64(), Some(15)); // 5 + 10 = 15
}

// ============================================================================
// Math execution tests
// ============================================================================

#[test]
fn test_execute_math_abs() {
    let expr = SExpr::call("math.abs", vec![SExpr::number(-5)]);
    assert_eq!(execute(&expr).unwrap().as_i64(), Some(5));

    let expr = SExpr::call("math.abs", vec![SExpr::number(5)]);
    assert_eq!(execute(&expr).unwrap().as_i64(), Some(5));
}

#[test]
fn test_execute_math_floor() {
    let expr = SExpr::call("math.floor", vec![SExpr::number(3.7)]);
    assert_eq!(execute(&expr).unwrap().as_i64(), Some(3));

    let expr = SExpr::call("math.floor", vec![SExpr::number(-1.5)]);
    assert_eq!(execute(&expr).unwrap().as_i64(), Some(-2));
}

#[test]
fn test_execute_math_ceil() {
    let expr = SExpr::call("math.ceil", vec![SExpr::number(3.2)]);
    assert_eq!(execute(&expr).unwrap().as_i64(), Some(4));

    let expr = SExpr::call("math.ceil", vec![SExpr::number(-1.5)]);
    assert_eq!(execute(&expr).unwrap().as_i64(), Some(-1));
}

#[test]
fn test_execute_math_sqrt() {
    let expr = SExpr::call("math.sqrt", vec![SExpr::number(9)]);
    assert_eq!(execute(&expr).unwrap().as_i64(), Some(3));

    let expr = SExpr::call("math.sqrt", vec![SExpr::number(2)]);
    let result = execute(&expr).unwrap().as_f64().unwrap();
    assert!((result - 1.414).abs() < 0.01);
}

#[test]
fn test_execute_math_min_max() {
    let expr = SExpr::call(
        "math.min",
        vec![SExpr::number(5), SExpr::number(3), SExpr::number(8)],
    );
    assert_eq!(execute(&expr).unwrap().as_i64(), Some(3));

    let expr = SExpr::call(
        "math.max",
        vec![SExpr::number(5), SExpr::number(3), SExpr::number(8)],
    );
    assert_eq!(execute(&expr).unwrap().as_i64(), Some(8));
}

#[test]
fn test_execute_math_neg() {
    let expr = SExpr::call("math.neg", vec![SExpr::number(5)]);
    assert_eq!(execute(&expr).unwrap().as_i64(), Some(-5));

    let expr = SExpr::call("math.neg", vec![SExpr::number(-3)]);
    assert_eq!(execute(&expr).unwrap().as_i64(), Some(3));
}

// ============================================================================
// String execution tests
// ============================================================================

#[test]
fn test_execute_str_lower() {
    let expr = SExpr::call("str.lower", vec![SExpr::string("HELLO")]);
    assert_eq!(execute(&expr).unwrap(), json!("hello"));
}

#[test]
fn test_execute_str_upper() {
    let expr = SExpr::call("str.upper", vec![SExpr::string("hello")]);
    assert_eq!(execute(&expr).unwrap(), json!("HELLO"));
}

#[test]
fn test_execute_str_trim() {
    let expr = SExpr::call("str.trim", vec![SExpr::string("  hello  ")]);
    assert_eq!(execute(&expr).unwrap(), json!("hello"));
}

// ============================================================================
// List execution tests
// ============================================================================

#[test]
fn test_execute_list_len() {
    let expr = SExpr::call(
        "list.len",
        vec![SExpr::call(
            "list.new",
            vec![SExpr::number(1), SExpr::number(2), SExpr::number(3)],
        )],
    );
    assert_eq!(execute(&expr).unwrap().as_i64(), Some(3));
}

#[test]
fn test_execute_list_get() {
    let expr = SExpr::call(
        "list.get",
        vec![
            SExpr::call(
                "list.new",
                vec![SExpr::number(10), SExpr::number(20), SExpr::number(30)],
            ),
            SExpr::number(1),
        ],
    );
    assert_eq!(execute(&expr).unwrap().as_i64(), Some(20));
}

#[test]
fn test_execute_list_push() {
    let expr = SExpr::call(
        "std.seq",
        vec![
            SExpr::call(
                "std.let",
                vec![
                    SExpr::string("arr"),
                    SExpr::call("list.new", vec![SExpr::number(1), SExpr::number(2)]),
                ],
            ),
            SExpr::call(
                "list.push",
                vec![
                    SExpr::call("std.var", vec![SExpr::string("arr")]),
                    SExpr::number(3),
                ],
            ),
            SExpr::call(
                "list.len",
                vec![SExpr::call("std.var", vec![SExpr::string("arr")])],
            ),
        ],
    );
    assert_eq!(execute(&expr).unwrap().as_i64(), Some(3));
}

// ============================================================================
// Object execution tests
// ============================================================================

#[test]
fn test_execute_obj_get() {
    let expr = SExpr::call(
        "obj.get",
        vec![
            SExpr::call(
                "obj.new",
                vec![
                    SExpr::list(vec![SExpr::string("x").erase_type(), SExpr::number(42).erase_type()]),
                    SExpr::list(vec![SExpr::string("y").erase_type(), SExpr::number(10).erase_type()]),
                ],
            ),
            SExpr::string("x"),
        ],
    );
    assert_eq!(execute(&expr).unwrap().as_i64(), Some(42));
}

#[test]
fn test_execute_obj_keys() {
    let expr = SExpr::call(
        "obj.keys",
        vec![SExpr::call(
            "obj.new",
            vec![
                SExpr::list(vec![SExpr::string("a").erase_type(), SExpr::number(1).erase_type()]),
                SExpr::list(vec![SExpr::string("b").erase_type(), SExpr::number(2).erase_type()]),
            ],
        )],
    );
    let result = execute(&expr).unwrap();
    let arr = result.as_array().unwrap();
    assert_eq!(arr.len(), 2);
}

#[test]
fn test_execute_obj_values() {
    let expr = SExpr::call(
        "obj.values",
        vec![SExpr::call(
            "obj.new",
            vec![
                SExpr::list(vec![SExpr::string("a").erase_type(), SExpr::number(1).erase_type()]),
                SExpr::list(vec![SExpr::string("b").erase_type(), SExpr::number(2).erase_type()]),
            ],
        )],
    );
    let result = execute(&expr).unwrap();
    let arr = result.as_array().unwrap();
    assert_eq!(arr.len(), 2);
}

// Typeof tests
#[test]
fn test_execute_typeof_array() {
    let expr = SExpr::call(
        "std.typeof",
        vec![SExpr::call("list.new", vec![SExpr::number(1), SExpr::number(2)])],
    );
    let result = execute(&expr).unwrap();
    assert_eq!(result, json!("array"));
}

#[test]
fn test_execute_typeof_null() {
    let expr = SExpr::call("std.typeof", vec![SExpr::null()]);
    let result = execute(&expr).unwrap();
    assert_eq!(result, json!("null"));
}

// Test null vs nil comparison behavior
#[test]
fn test_null_nil_comparison() {
    use crate::Runtime;
    let runtime = Runtime::new().unwrap();

    // null ~= nil should be true (they're different types)
    let result = runtime.execute_lua("return null ~= nil").unwrap();
    assert_eq!(result, json!(true), "null and nil should be different");

    // null == null should be true
    let result = runtime.execute_lua("return null == null").unwrap();
    assert_eq!(result, json!(true), "null should equal itself");

    // type(null) should be userdata
    let result = runtime.execute_lua("return type(null)").unwrap();
    assert_eq!(result, json!("userdata"), "null should be userdata type");
}

// Test LuaJIT FFI null pointer behavior
#[test]
fn test_ffi_null_pointer() {
    use crate::Runtime;
    let runtime = Runtime::new().unwrap();

    // Try to load FFI and test null pointer comparison
    // Note: FFI might not be available in all mlua builds
    let result = runtime.execute_lua(r#"
        local ok, ffi = pcall(require, "ffi")
        if not ok then
            return "ffi_not_available"
        end
        -- FFI NULL should compare equal to nil in boolean context
        -- but is actually a cdata, not nil
        local null_ptr = ffi.cast("void*", 0)
        return {
            type_of_null = type(null_ptr),
            is_nil = null_ptr == nil,
            is_falsy = not null_ptr
        }
    "#);

    match result {
        Ok(v) => {
            if v == json!("ffi_not_available") {
                // FFI not available, skip test
                return;
            }
            let obj = v.as_object().expect("expected object");
            assert_eq!(obj.get("type_of_null").unwrap(), "cdata", "FFI null should be cdata");
            // In LuaJIT, NULL pointer == nil is true
            assert_eq!(obj.get("is_nil").unwrap(), true, "FFI NULL should equal nil");
            // NULL is falsy
            assert_eq!(obj.get("is_falsy").unwrap(), true, "FFI NULL should be falsy");
        }
        Err(_) => {
            // FFI not available in this build, that's okay
        }
    }
}

#[test]
fn test_execute_obj_has() {
    let expr = SExpr::call(
        "obj.has",
        vec![
            SExpr::call(
                "obj.new",
                vec![SExpr::list(vec![SExpr::string("x").erase_type(), SExpr::number(1).erase_type()])],
            ),
            SExpr::string("x"),
        ],
    );
    assert_eq!(execute(&expr).unwrap(), json!(true));

    let expr = SExpr::call(
        "obj.has",
        vec![
            SExpr::call(
                "obj.new",
                vec![SExpr::list(vec![SExpr::string("x").erase_type(), SExpr::number(1).erase_type()])],
            ),
            SExpr::string("y"),
        ],
    );
    assert_eq!(execute(&expr).unwrap(), json!(false));
}
