//! Tests for viwo-runtime-luajit.

use crate::codegen::compile;
use viwo_ir::SExpr;

#[test]
fn test_compile_literals() {
    assert_eq!(compile(&SExpr::Null).unwrap(), "return nil");
    assert_eq!(compile(&SExpr::Bool(true)).unwrap(), "return true");
    assert_eq!(compile(&SExpr::Bool(false)).unwrap(), "return false");
    assert_eq!(compile(&SExpr::Number(42.0)).unwrap(), "return 42");
    assert_eq!(compile(&SExpr::Number(3.14)).unwrap(), "return 3.14");
    assert_eq!(
        compile(&SExpr::String("hello".into())).unwrap(),
        "return \"hello\""
    );
}

#[test]
fn test_compile_string_escaping() {
    assert_eq!(
        compile(&SExpr::String("line1\nline2".into())).unwrap(),
        "return [[line1\nline2]]"
    );
    assert_eq!(
        compile(&SExpr::String("with \"quotes\"".into())).unwrap(),
        "return \"with \\\"quotes\\\"\""
    );
}

#[test]
fn test_compile_let() {
    let expr = SExpr::call("std.let", vec![SExpr::string("x"), SExpr::number(10)]);
    assert_eq!(compile(&expr).unwrap(), "local x = 10");
}

#[test]
fn test_compile_var() {
    let expr = SExpr::call("std.var", vec![SExpr::string("x")]);
    assert_eq!(compile(&expr).unwrap(), "return x");
}

#[test]
fn test_compile_seq() {
    let expr = SExpr::call(
        "std.seq",
        vec![
            SExpr::call("std.let", vec![SExpr::string("x"), SExpr::number(10)]),
            SExpr::call("std.var", vec![SExpr::string("x")]),
        ],
    );
    let code = compile(&expr).unwrap();
    assert!(code.contains("local x = 10"));
    assert!(code.contains("return x"));
}

#[test]
fn test_compile_if() {
    let expr = SExpr::call(
        "std.if",
        vec![
            SExpr::Bool(true),
            SExpr::number(1),
            SExpr::number(2),
        ],
    );
    let code = compile(&expr).unwrap();
    assert!(code.contains("if true then"));
    assert!(code.contains("return 1"));
    assert!(code.contains("else"));
    assert!(code.contains("return 2"));
    assert!(code.contains("end"));
}

#[test]
fn test_compile_while() {
    let expr = SExpr::call(
        "std.while",
        vec![
            SExpr::Bool(true),
            SExpr::call("std.break", vec![]),
        ],
    );
    let code = compile(&expr).unwrap();
    assert!(code.contains("while true do"));
    assert!(code.contains("break"));
    assert!(code.contains("end"));
}

#[test]
fn test_compile_for() {
    let expr = SExpr::call(
        "std.for",
        vec![
            SExpr::string("item"),
            SExpr::call("list.new", vec![SExpr::number(1), SExpr::number(2)]),
            SExpr::call("std.var", vec![SExpr::string("item")]),
        ],
    );
    let code = compile(&expr).unwrap();
    assert!(code.contains("for _, item in ipairs"));
    assert!(code.contains("end"));
}

#[test]
fn test_compile_arithmetic() {
    let expr = SExpr::call(
        "+",
        vec![SExpr::number(1), SExpr::number(2)],
    );
    assert_eq!(compile(&expr).unwrap(), "return (1 + 2)");

    let expr = SExpr::call(
        "*",
        vec![SExpr::number(3), SExpr::number(4)],
    );
    assert_eq!(compile(&expr).unwrap(), "return (3 * 4)");
}

#[test]
fn test_compile_comparison() {
    let expr = SExpr::call(
        "==",
        vec![SExpr::number(1), SExpr::number(1)],
    );
    assert_eq!(compile(&expr).unwrap(), "return (1 == 1)");

    let expr = SExpr::call(
        "!=",
        vec![SExpr::number(1), SExpr::number(2)],
    );
    assert_eq!(compile(&expr).unwrap(), "return (1 ~= 2)");
}

#[test]
fn test_compile_logical() {
    let expr = SExpr::call(
        "&&",
        vec![SExpr::Bool(true), SExpr::Bool(false)],
    );
    assert_eq!(compile(&expr).unwrap(), "return (true and false)");

    let expr = SExpr::call(
        "!",
        vec![SExpr::Bool(true)],
    );
    assert_eq!(compile(&expr).unwrap(), "return not true");
}

#[test]
fn test_compile_string_ops() {
    let expr = SExpr::call(
        "str.concat",
        vec![SExpr::string("hello"), SExpr::string(" "), SExpr::string("world")],
    );
    assert_eq!(
        compile(&expr).unwrap(),
        "return \"hello\" .. \" \" .. \"world\""
    );

    let expr = SExpr::call("str.len", vec![SExpr::string("test")]);
    assert_eq!(compile(&expr).unwrap(), "return #\"test\"");
}

#[test]
fn test_compile_list_ops() {
    let expr = SExpr::call("list.new", vec![SExpr::number(1), SExpr::number(2), SExpr::number(3)]);
    assert_eq!(compile(&expr).unwrap(), "return { 1, 2, 3 }");

    let expr = SExpr::call(
        "list.get",
        vec![
            SExpr::call("list.new", vec![SExpr::number(10), SExpr::number(20)]),
            SExpr::number(0),
        ],
    );
    // Lua is 1-indexed, so we add 1
    assert!(compile(&expr).unwrap().contains("[0 + 1]"));
}

#[test]
fn test_compile_lambda() {
    let expr = SExpr::call(
        "std.lambda",
        vec![
            SExpr::List(vec![SExpr::string("a"), SExpr::string("b")]),
            SExpr::call("+", vec![
                SExpr::call("std.var", vec![SExpr::string("a")]),
                SExpr::call("std.var", vec![SExpr::string("b")]),
            ]),
        ],
    );
    let code = compile(&expr).unwrap();
    assert!(code.contains("function(a, b)"));
    assert!(code.contains("return (a + b)"));
}

#[test]
fn test_compile_keyword_escaping() {
    // 'end' is a Lua keyword
    let expr = SExpr::call("std.let", vec![SExpr::string("end"), SExpr::number(1)]);
    assert_eq!(compile(&expr).unwrap(), "local _end = 1");

    let expr = SExpr::call("std.let", vec![SExpr::string("local"), SExpr::number(2)]);
    assert_eq!(compile(&expr).unwrap(), "local _local = 2");
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
        vec![SExpr::string("Hello"), SExpr::string(", "), SExpr::string("World!")],
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
    // Result should be an array (Lua tables with integer keys become arrays)
    assert!(result.is_array());
    assert_eq!(result.as_array().unwrap().len(), 3);
}

#[test]
fn test_execute_lambda_call() {
    // Create and call lambda using the Runtime directly
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
                    SExpr::call("<", vec![
                        SExpr::call("std.var", vec![SExpr::string("x")]),
                        SExpr::call("std.var", vec![SExpr::string("y")]),
                    ]),
                    SExpr::call("+", vec![
                        SExpr::call("std.var", vec![SExpr::string("x")]),
                        SExpr::call("std.var", vec![SExpr::string("y")]),
                    ]),
                    SExpr::call("-", vec![
                        SExpr::call("std.var", vec![SExpr::string("x")]),
                        SExpr::call("std.var", vec![SExpr::string("y")]),
                    ]),
                ],
            ),
        ],
    );
    let result = execute(&expr).unwrap();
    assert_eq!(result.as_i64(), Some(15)); // 5 + 10 = 15
}
