//! Tests for TypeScript transpiler.

use super::*;
use viwo_ir::SExpr;

fn assert_transpile(source: &str, expected: SExpr) {
    let result = transpile(source).expect("transpile failed");
    assert_eq!(result, expected, "source: {}", source);
}

#[test]
fn test_number_literals() {
    assert_transpile("42", SExpr::number(42.0));
    assert_transpile("3.14", SExpr::number(3.14));
    assert_transpile("0", SExpr::number(0.0));
}

#[test]
fn test_string_literals() {
    assert_transpile("\"hello\"", SExpr::string("hello"));
    assert_transpile("'world'", SExpr::string("world"));
}

#[test]
fn test_boolean_literals() {
    assert_transpile("true", SExpr::bool(true));
    assert_transpile("false", SExpr::bool(false));
}

#[test]
fn test_null_undefined() {
    assert_transpile("null", SExpr::null());
    assert_transpile("undefined", SExpr::null());
}

#[test]
fn test_variable_reference() {
    assert_transpile("x", SExpr::call("std.var", vec![SExpr::string("x")]));
    assert_transpile(
        "myVar",
        SExpr::call("std.var", vec![SExpr::string("myVar")]),
    );
}

#[test]
fn test_binary_arithmetic() {
    assert_transpile(
        "1 + 2",
        SExpr::call("math.add", vec![SExpr::number(1.0).erase_type(), SExpr::number(2.0).erase_type()]),
    );
    assert_transpile(
        "5 - 3",
        SExpr::call("math.sub", vec![SExpr::number(5.0).erase_type(), SExpr::number(3.0).erase_type()]),
    );
    assert_transpile(
        "4 * 2",
        SExpr::call("math.mul", vec![SExpr::number(4.0).erase_type(), SExpr::number(2.0).erase_type()]),
    );
    assert_transpile(
        "10 / 2",
        SExpr::call("math.div", vec![SExpr::number(10.0).erase_type(), SExpr::number(2.0).erase_type()]),
    );
    assert_transpile(
        "7 % 3",
        SExpr::call("math.mod", vec![SExpr::number(7.0).erase_type(), SExpr::number(3.0).erase_type()]),
    );
}

#[test]
fn test_binary_comparison() {
    assert_transpile(
        "1 == 2",
        SExpr::call("bool.eq", vec![SExpr::number(1.0).erase_type(), SExpr::number(2.0).erase_type()]),
    );
    assert_transpile(
        "1 === 2",
        SExpr::call("bool.eq", vec![SExpr::number(1.0).erase_type(), SExpr::number(2.0).erase_type()]),
    );
    assert_transpile(
        "1 < 2",
        SExpr::call("bool.lt", vec![SExpr::number(1.0).erase_type(), SExpr::number(2.0).erase_type()]),
    );
    assert_transpile(
        "1 > 2",
        SExpr::call("bool.gt", vec![SExpr::number(1.0).erase_type(), SExpr::number(2.0).erase_type()]),
    );
}

#[test]
fn test_logical_operators() {
    assert_transpile(
        "true && false",
        SExpr::call("bool.and", vec![SExpr::bool(true).erase_type(), SExpr::bool(false).erase_type()]),
    );
    assert_transpile(
        "true || false",
        SExpr::call("bool.or", vec![SExpr::bool(true).erase_type(), SExpr::bool(false).erase_type()]),
    );
}

#[test]
fn test_unary_operators() {
    assert_transpile("!true", SExpr::call("bool.not", vec![SExpr::bool(true).erase_type()]));
    assert_transpile("-5", SExpr::call("math.neg", vec![SExpr::number(5.0).erase_type()]));
}

#[test]
fn test_nested_expressions() {
    // (1 + 2) * 3
    assert_transpile(
        "(1 + 2) * 3",
        SExpr::call(
            "math.mul",
            vec![
                SExpr::call("math.add", vec![SExpr::number(1.0).erase_type(), SExpr::number(2.0).erase_type()]),
                SExpr::number(3.0).erase_type(),
            ],
        ),
    );
}

#[test]
fn test_variable_declaration() {
    assert_transpile(
        "let x = 10",
        SExpr::call("std.let", vec![SExpr::string("x"), SExpr::number(10.0).erase_type()]),
    );
    assert_transpile(
        "const y = 20",
        SExpr::call("std.let", vec![SExpr::string("y"), SExpr::number(20.0).erase_type()]),
    );
}

#[test]
fn test_function_call() {
    assert_transpile(
        "foo()",
        SExpr::call("foo", vec![]),
    );
    assert_transpile(
        "add(1, 2)",
        SExpr::call("add", vec![SExpr::number(1.0).erase_type(), SExpr::number(2.0).erase_type()]),
    );
}

#[test]
fn test_namespaced_call() {
    assert_transpile(
        "math.sqrt(4)",
        SExpr::call("math.sqrt", vec![SExpr::number(4.0).erase_type()]),
    );
    assert_transpile(
        "str.concat(\"a\", \"b\")",
        SExpr::call(
            "str.concat",
            vec![SExpr::string("a"), SExpr::string("b")],
        ),
    );
}

#[test]
fn test_array_literal() {
    assert_transpile(
        "[1, 2, 3]",
        SExpr::call(
            "list.new",
            vec![SExpr::Number(1.0), SExpr::Number(2.0), SExpr::Number(3.0)],
        ),
    );
    assert_transpile("[]", SExpr::call("list.new", vec![]));
}

#[test]
fn test_object_literal() {
    assert_transpile(
        "{ x: 1 }",
        SExpr::call(
            "obj.new",
            vec![SExpr::List(vec![SExpr::string("x"), SExpr::Number(1.0)])],
        ),
    );
    assert_transpile(
        "{ a: 1, b: 2 }",
        SExpr::call(
            "obj.new",
            vec![
                SExpr::List(vec![SExpr::string("a"), SExpr::Number(1.0)]),
                SExpr::List(vec![SExpr::string("b"), SExpr::Number(2.0)]),
            ],
        ),
    );
}

#[test]
fn test_member_access() {
    assert_transpile(
        "obj.prop",
        SExpr::call(
            "obj.get",
            vec![
                SExpr::call("std.var", vec![SExpr::string("obj")]),
                SExpr::string("prop"),
            ],
        ),
    );
}

#[test]
fn test_subscript_access() {
    assert_transpile(
        "arr[0]",
        SExpr::call(
            "list.get",
            vec![
                SExpr::call("std.var", vec![SExpr::string("arr")]),
                SExpr::Number(0.0),
            ],
        ),
    );
}

#[test]
fn test_arrow_function() {
    // x => x + 1
    assert_transpile(
        "x => x + 1",
        SExpr::call(
            "std.lambda",
            vec![
                SExpr::List(vec![SExpr::string("x")]),
                SExpr::call(
                    "math.add",
                    vec![
                        SExpr::call("std.var", vec![SExpr::string("x")]),
                        SExpr::Number(1.0),
                    ],
                ),
            ],
        ),
    );
}

#[test]
fn test_ternary_expression() {
    assert_transpile(
        "x ? 1 : 2",
        SExpr::call(
            "std.if",
            vec![
                SExpr::call("std.var", vec![SExpr::string("x")]),
                SExpr::Number(1.0),
                SExpr::Number(2.0),
            ],
        ),
    );
}

#[test]
fn test_if_statement() {
    assert_transpile(
        "if (x) { y }",
        SExpr::call(
            "std.if",
            vec![
                SExpr::call("std.var", vec![SExpr::string("x")]),
                SExpr::call("std.var", vec![SExpr::string("y")]),
            ],
        ),
    );
}

#[test]
fn test_if_else_statement() {
    assert_transpile(
        "if (x) { 1 } else { 2 }",
        SExpr::call(
            "std.if",
            vec![
                SExpr::call("std.var", vec![SExpr::string("x")]),
                SExpr::Number(1.0),
                SExpr::Number(2.0),
            ],
        ),
    );
}

#[test]
fn test_multiple_statements() {
    assert_transpile(
        "let x = 1; let y = 2",
        SExpr::call(
            "std.seq",
            vec![
                SExpr::call("std.let", vec![SExpr::string("x"), SExpr::Number(1.0)]),
                SExpr::call("std.let", vec![SExpr::string("y"), SExpr::Number(2.0)]),
            ],
        ),
    );
}

#[test]
fn test_block_statement() {
    assert_transpile(
        "{ let x = 1; x + 1 }",
        SExpr::call(
            "std.seq",
            vec![
                SExpr::call("std.let", vec![SExpr::string("x"), SExpr::Number(1.0)]),
                SExpr::call(
                    "math.add",
                    vec![
                        SExpr::call("std.var", vec![SExpr::string("x")]),
                        SExpr::Number(1.0),
                    ],
                ),
            ],
        ),
    );
}
