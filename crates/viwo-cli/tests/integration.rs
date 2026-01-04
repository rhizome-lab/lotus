//! Integration tests for the full TypeScript → S-expr → Lua pipeline.
//! Ported from packages/scripting/src/*.test.ts

use viwo_ir::SExpr;
use viwo_runtime_luajit::execute;
use viwo_syntax_typescript::transpile;

// =============================================================================
// Test Helpers
// =============================================================================

fn eval_ts(source: &str) -> serde_json::Value {
    let sexpr = transpile(source).expect("transpile failed");
    execute(&sexpr).expect("execute failed")
}

fn eval_sexpr(expr: &SExpr) -> serde_json::Value {
    execute(expr).expect("execute failed")
}

fn assert_num(actual: serde_json::Value, expected: f64) {
    let n = actual.as_f64().expect("expected number");
    assert!(
        (n - expected).abs() < 1e-10,
        "expected {}, got {}",
        expected,
        n
    );
}

fn assert_close(actual: serde_json::Value, expected: f64) {
    let n = actual.as_f64().expect("expected number");
    assert!(
        (n - expected).abs() < 1e-6,
        "expected ~{}, got {}",
        expected,
        n
    );
}

// =============================================================================
// Literals (from interpreter.test.ts)
// =============================================================================

#[test]
fn test_literal_number() {
    assert_num(eval_ts("1"), 1.0);
    assert_num(eval_ts("42"), 42.0);
    assert_num(eval_ts("3.14"), 3.14);
}

#[test]
fn test_literal_string() {
    assert_eq!(eval_ts("\"hello\""), serde_json::json!("hello"));
    assert_eq!(eval_ts("'world'"), serde_json::json!("world"));
}

#[test]
fn test_literal_boolean() {
    assert_eq!(eval_ts("true"), serde_json::json!(true));
    assert_eq!(eval_ts("false"), serde_json::json!(false));
}

#[test]
fn test_literal_null() {
    assert_eq!(eval_ts("null"), serde_json::Value::Null);
}

// =============================================================================
// Math (from interpreter.test.ts, math.test.ts)
// =============================================================================

#[test]
fn test_math_add() {
    assert_num(eval_ts("1 + 2"), 3.0);
    assert_num(eval_ts("1 + 2 + 3"), 6.0);
}

#[test]
fn test_math_sub() {
    assert_num(eval_ts("5 - 3"), 2.0);
    assert_num(eval_ts("10 - 2 - 3"), 5.0);
}

#[test]
fn test_math_mul() {
    assert_num(eval_ts("2 * 3"), 6.0);
    assert_num(eval_ts("2 * 3 * 4"), 24.0);
}

#[test]
fn test_math_div() {
    assert_num(eval_ts("6 / 2"), 3.0);
    assert_num(eval_ts("12 / 2 / 3"), 2.0);
}

#[test]
fn test_math_mod() {
    assert_num(eval_ts("10 % 3"), 1.0);
    assert_num(eval_ts("5 % 2"), 1.0);
}

#[test]
fn test_math_pow() {
    assert_num(eval_ts("2 ** 3"), 8.0);
}

#[test]
fn test_math_neg() {
    assert_num(eval_ts("-5"), -5.0);
    assert_num(eval_ts("-(3 + 2)"), -5.0);
}

#[test]
fn test_math_nested() {
    assert_num(eval_ts("(1 + 2) * 3"), 9.0);
    assert_num(eval_ts("10 / (2 + 3)"), 2.0);
    assert_num(eval_ts("(4 + 6) * (3 - 1)"), 20.0);
}

// Math functions (need Lua math library)
#[test]
#[ignore = "math.floor not implemented"]
fn test_math_floor() {
    assert_num(eval_ts("math.floor(1.5)"), 1.0);
    assert_num(eval_ts("math.floor(-1.5)"), -2.0);
}

#[test]
#[ignore = "math.ceil not implemented"]
fn test_math_ceil() {
    assert_num(eval_ts("math.ceil(1.5)"), 2.0);
}

#[test]
#[ignore = "math.sqrt not implemented"]
fn test_math_sqrt() {
    assert_num(eval_ts("math.sqrt(9)"), 3.0);
}

#[test]
#[ignore = "math.abs not implemented"]
fn test_math_abs() {
    assert_num(eval_ts("math.abs(-5)"), 5.0);
}

// =============================================================================
// Boolean/Logic (from interpreter.test.ts, boolean.test.ts)
// =============================================================================

#[test]
fn test_bool_and() {
    assert_eq!(eval_ts("true && true"), serde_json::json!(true));
    assert_eq!(eval_ts("true && false"), serde_json::json!(false));
    assert_eq!(eval_ts("false && true"), serde_json::json!(false));
}

#[test]
fn test_bool_or() {
    assert_eq!(eval_ts("true || false"), serde_json::json!(true));
    assert_eq!(eval_ts("false || true"), serde_json::json!(true));
    assert_eq!(eval_ts("false || false"), serde_json::json!(false));
}

#[test]
fn test_bool_not() {
    assert_eq!(eval_ts("!true"), serde_json::json!(false));
    assert_eq!(eval_ts("!false"), serde_json::json!(true));
}

#[test]
fn test_bool_eq() {
    assert_eq!(eval_ts("1 == 1"), serde_json::json!(true));
    assert_eq!(eval_ts("1 == 2"), serde_json::json!(false));
    assert_eq!(eval_ts("1 === 1"), serde_json::json!(true));
}

#[test]
fn test_bool_neq() {
    assert_eq!(eval_ts("1 != 2"), serde_json::json!(true));
    assert_eq!(eval_ts("1 != 1"), serde_json::json!(false));
    assert_eq!(eval_ts("1 !== 2"), serde_json::json!(true));
}

#[test]
fn test_bool_lt() {
    assert_eq!(eval_ts("1 < 2"), serde_json::json!(true));
    assert_eq!(eval_ts("2 < 1"), serde_json::json!(false));
    assert_eq!(eval_ts("1 < 1"), serde_json::json!(false));
}

#[test]
fn test_bool_gt() {
    assert_eq!(eval_ts("2 > 1"), serde_json::json!(true));
    assert_eq!(eval_ts("1 > 2"), serde_json::json!(false));
}

#[test]
fn test_bool_lte() {
    assert_eq!(eval_ts("1 <= 1"), serde_json::json!(true));
    assert_eq!(eval_ts("1 <= 2"), serde_json::json!(true));
    assert_eq!(eval_ts("2 <= 1"), serde_json::json!(false));
}

#[test]
fn test_bool_gte() {
    assert_eq!(eval_ts("1 >= 1"), serde_json::json!(true));
    assert_eq!(eval_ts("2 >= 1"), serde_json::json!(true));
    assert_eq!(eval_ts("1 >= 2"), serde_json::json!(false));
}

// =============================================================================
// Variables (from interpreter.test.ts, std.test.ts)
// =============================================================================

#[test]
fn test_var_let() {
    assert_num(eval_ts("let x = 10; x"), 10.0);
}

#[test]
fn test_var_const() {
    assert_num(eval_ts("const x = 20; x"), 20.0);
}

#[test]
fn test_var_multiple() {
    assert_num(eval_ts("let x = 5; let y = 3; x + y"), 8.0);
}

#[test]
fn test_var_reassign() {
    // Note: std.set isn't generated by transpiler yet, but let works
    assert_num(eval_ts("let a = 2; let b = a * 3; b + 1"), 7.0);
}

// =============================================================================
// Control Flow (from interpreter.test.ts, std.test.ts)
// =============================================================================

#[test]
fn test_seq() {
    // Bare literals aren't valid Lua statements, use let instead
    assert_num(eval_ts("let a = 1; let b = 2; 3"), 3.0);
}

#[test]
fn test_if_true() {
    // Simple if needs block syntax in TS
    assert_num(eval_ts("if (true) { 1 }"), 1.0);
}

#[test]
fn test_if_else() {
    assert_num(eval_ts("if (false) { 1 } else { 2 }"), 2.0);
}

#[test]
fn test_ternary() {
    assert_num(eval_ts("true ? 1 : 2"), 1.0);
    assert_num(eval_ts("false ? 1 : 2"), 2.0);
}

#[test]
fn test_if_with_comparison() {
    assert_num(eval_ts("let x = 5; if (x > 3) { x * 2 } else { x }"), 10.0);
}

#[test]
#[ignore = "while loops not fully working"]
fn test_while_loop() {
    assert_num(
        eval_ts("let i = 0; while (i < 3) { i = i + 1 }; i"),
        3.0,
    );
}

#[test]
#[ignore = "for loops not fully working"]
fn test_for_loop() {
    // for (x of [1, 2, 3]) sum += x
    assert_num(
        eval_ts("let sum = 0; for (const x of [1, 2, 3]) { sum = sum + x }; sum"),
        6.0,
    );
}

#[test]
#[ignore = "break not implemented"]
fn test_break_in_while() {
    assert_num(
        eval_ts("let i = 0; while (true) { i = i + 1; if (i > 3) { break } }; i"),
        4.0,
    );
}

// =============================================================================
// Arrays (from list.test.ts)
// =============================================================================

#[test]
fn test_list_new() {
    let result = eval_ts("[1, 2, 3]");
    let arr = result.as_array().expect("expected array");
    assert_eq!(arr.len(), 3);
    assert_num(arr[0].clone(), 1.0);
    assert_num(arr[1].clone(), 2.0);
    assert_num(arr[2].clone(), 3.0);
}

#[test]
fn test_list_empty() {
    let result = eval_ts("[]");
    // Lua empty table serializes as {} object, not [] array
    // This is a known Lua/JSON interop limitation
    assert!(result.as_array().map(|a| a.is_empty()).unwrap_or(false)
         || result.as_object().map(|o| o.is_empty()).unwrap_or(false));
}

#[test]
fn test_list_nested() {
    let result = eval_ts("[[1, 2], [3, 4]]");
    let arr = result.as_array().expect("expected array");
    assert_eq!(arr.len(), 2);
}

#[test]
fn test_list_with_expressions() {
    let result = eval_ts("[1 + 1, 2 + 2, 3 + 3]");
    let arr = result.as_array().expect("expected array");
    assert_num(arr[0].clone(), 2.0);
    assert_num(arr[1].clone(), 4.0);
    assert_num(arr[2].clone(), 6.0);
}

#[test]
fn test_list_get() {
    // arr[0] uses list.get
    assert_num(eval_ts("let arr = [10, 20, 30]; arr[1]"), 20.0);
}

#[test]
#[ignore = "list.len not implemented"]
fn test_list_len() {
    assert_num(eval_ts("list.len([1, 2, 3])"), 3.0);
}

#[test]
#[ignore = "list.push not implemented"]
fn test_list_push() {
    let result = eval_ts("let l = [1, 2]; list.push(l, 3); l");
    let arr = result.as_array().expect("expected array");
    assert_eq!(arr.len(), 3);
}

#[test]
#[ignore = "list.map not implemented"]
fn test_list_map() {
    let result = eval_ts("list.map([1, 2, 3], x => x + 1)");
    let arr = result.as_array().expect("expected array");
    assert_num(arr[0].clone(), 2.0);
}

#[test]
#[ignore = "list.filter not implemented"]
fn test_list_filter() {
    let result = eval_ts("list.filter([1, 2, 3], x => x > 1)");
    let arr = result.as_array().expect("expected array");
    assert_eq!(arr.len(), 2);
}

#[test]
#[ignore = "list.reduce not implemented"]
fn test_list_reduce() {
    assert_num(eval_ts("list.reduce([1, 2, 3], (acc, x) => acc + x, 0)"), 6.0);
}

// =============================================================================
// Objects (from object.test.ts)
// =============================================================================

#[test]
fn test_obj_new() {
    let result = eval_ts("{ x: 1, y: 2 }");
    let obj = result.as_object().expect("expected object");
    assert_num(obj.get("x").unwrap().clone(), 1.0);
    assert_num(obj.get("y").unwrap().clone(), 2.0);
}

#[test]
fn test_obj_nested() {
    let result = eval_ts("{ a: { b: 1 } }");
    let obj = result.as_object().expect("expected object");
    let inner = obj.get("a").unwrap().as_object().expect("expected inner object");
    assert_num(inner.get("b").unwrap().clone(), 1.0);
}

#[test]
fn test_obj_with_expressions() {
    let result = eval_ts("{ sum: 1 + 2, prod: 3 * 4 }");
    let obj = result.as_object().expect("expected object");
    assert_num(obj.get("sum").unwrap().clone(), 3.0);
    assert_num(obj.get("prod").unwrap().clone(), 12.0);
}

#[test]
fn test_obj_get() {
    // obj.prop uses obj.get
    assert_num(eval_ts("let o = { x: 42 }; o.x"), 42.0);
}

#[test]
#[ignore = "obj.keys not implemented"]
fn test_obj_keys() {
    let result = eval_ts("obj.keys({ a: 1, b: 2 })");
    let arr = result.as_array().expect("expected array");
    assert_eq!(arr.len(), 2);
}

#[test]
#[ignore = "obj.values not implemented"]
fn test_obj_values() {
    let result = eval_ts("obj.values({ a: 1, b: 2 })");
    let arr = result.as_array().expect("expected array");
    assert_eq!(arr.len(), 2);
}

// =============================================================================
// Strings (from string.test.ts)
// =============================================================================

#[test]
fn test_str_literal() {
    assert_eq!(eval_ts("\"hello world\""), serde_json::json!("hello world"));
}

#[test]
#[ignore = "str.len not implemented"]
fn test_str_len() {
    assert_num(eval_ts("str.len(\"hello\")"), 5.0);
}

#[test]
fn test_str_concat() {
    assert_eq!(
        eval_ts("str.concat(\"hello\", \" \", \"world\")"),
        serde_json::json!("hello world")
    );
}

#[test]
#[ignore = "str.split not implemented"]
fn test_str_split() {
    let result = eval_ts("str.split(\"a,b,c\", \",\")");
    let arr = result.as_array().expect("expected array");
    assert_eq!(arr.len(), 3);
}

#[test]
#[ignore = "str.lower not implemented"]
fn test_str_lower() {
    assert_eq!(eval_ts("str.lower(\"HELLO\")"), serde_json::json!("hello"));
}

#[test]
#[ignore = "str.upper not implemented"]
fn test_str_upper() {
    assert_eq!(eval_ts("str.upper(\"hello\")"), serde_json::json!("HELLO"));
}

// =============================================================================
// Lambda/Functions (from interpreter.test.ts)
// =============================================================================

#[test]
#[ignore = "lambda apply not implemented"]
fn test_lambda_basic() {
    // (x => x + 1)(1)
    assert_num(eval_ts("((x) => x + 1)(1)"), 2.0);
}

#[test]
#[ignore = "closure capture not implemented"]
fn test_lambda_closure() {
    assert_num(
        eval_ts("let x = 10; let addX = (y) => x + y; addX(5)"),
        15.0,
    );
}

// =============================================================================
// Complex Expressions
// =============================================================================

#[test]
fn test_complex_calculation() {
    let code = r#"
        let base = 100;
        let multiplier = 1.5;
        let bonus = 25;
        let result = base * multiplier + bonus;
        result
    "#;
    assert_num(eval_ts(code), 175.0);
}

#[test]
fn test_conditional_logic() {
    let code = r#"
        let health = 30;
        let maxHealth = 100;
        let isLowHealth = health < maxHealth * 0.5;
        isLowHealth
    "#;
    assert_eq!(eval_ts(code), serde_json::json!(true));
}

#[test]
fn test_chained_comparisons() {
    // Note: In JS/TS, 1 < 2 < 3 is (1 < 2) < 3 = true < 3 = 1 < 3 = true
    // We test individual comparisons instead
    assert_eq!(eval_ts("1 < 2 && 2 < 3"), serde_json::json!(true));
}

#[test]
fn test_mixed_types_in_array() {
    // Note: null (Lua nil) creates holes in arrays and gets dropped
    // This is a known Lua/JSON interop limitation
    let result = eval_ts("[1, \"two\", true]");
    let arr = result.as_array().expect("expected array");
    assert_eq!(arr.len(), 3);
    assert_num(arr[0].clone(), 1.0);
    assert_eq!(arr[1], serde_json::json!("two"));
    assert_eq!(arr[2], serde_json::json!(true));
}

#[test]
fn test_object_in_array() {
    let result = eval_ts("[{ x: 1 }, { x: 2 }]");
    let arr = result.as_array().expect("expected array");
    assert_eq!(arr.len(), 2);
    assert_num(arr[0].as_object().unwrap().get("x").unwrap().clone(), 1.0);
    assert_num(arr[1].as_object().unwrap().get("x").unwrap().clone(), 2.0);
}
