//! Tests for TypeScript transpiler.

use super::*;
use lotus_ir::SExpr;

fn assert_transpile(source: &str, expected: SExpr) {
    let result = transpile(source).expect("transpile failed");
    assert_eq!(result, expected, "source: {}", source);
}

#[test]
fn test_number_literals() {
    assert_transpile("42", SExpr::number(42.0).erase_type());
    assert_transpile("3.14", SExpr::number(3.14).erase_type());
    assert_transpile("0", SExpr::number(0.0).erase_type());
}

#[test]
fn test_numeric_separators() {
    // TypeScript numeric separators: 10_000 -> 10000
    assert_transpile("10_000", SExpr::number(10000.0).erase_type());
    assert_transpile("1_000_000", SExpr::number(1000000.0).erase_type());
}

#[test]
fn test_string_literals() {
    assert_transpile("\"hello\"", SExpr::string("hello").erase_type());
    assert_transpile("'world'", SExpr::string("world").erase_type());
}

#[test]
fn test_boolean_literals() {
    assert_transpile("true", SExpr::bool(true).erase_type());
    assert_transpile("false", SExpr::bool(false).erase_type());
}

#[test]
fn test_null_undefined() {
    assert_transpile("null", SExpr::null().erase_type());
    assert_transpile("undefined", SExpr::null().erase_type());
}

#[test]
fn test_variable_reference() {
    assert_transpile(
        "x",
        SExpr::call("std.var", vec![SExpr::string("x").erase_type()]),
    );
    assert_transpile(
        "myVar",
        SExpr::call("std.var", vec![SExpr::string("myVar").erase_type()]),
    );
}

#[test]
fn test_binary_arithmetic() {
    assert_transpile(
        "1 + 2",
        SExpr::call(
            "math.add",
            vec![
                SExpr::number(1.0).erase_type(),
                SExpr::number(2.0).erase_type(),
            ],
        ),
    );
    assert_transpile(
        "5 - 3",
        SExpr::call(
            "math.sub",
            vec![
                SExpr::number(5.0).erase_type(),
                SExpr::number(3.0).erase_type(),
            ],
        ),
    );
    assert_transpile(
        "4 * 2",
        SExpr::call(
            "math.mul",
            vec![
                SExpr::number(4.0).erase_type(),
                SExpr::number(2.0).erase_type(),
            ],
        ),
    );
    assert_transpile(
        "10 / 2",
        SExpr::call(
            "math.div",
            vec![
                SExpr::number(10.0).erase_type(),
                SExpr::number(2.0).erase_type(),
            ],
        ),
    );
    assert_transpile(
        "7 % 3",
        SExpr::call(
            "math.mod",
            vec![
                SExpr::number(7.0).erase_type(),
                SExpr::number(3.0).erase_type(),
            ],
        ),
    );
}

#[test]
fn test_binary_comparison() {
    assert_transpile(
        "1 == 2",
        SExpr::call(
            "bool.eq",
            vec![
                SExpr::number(1.0).erase_type(),
                SExpr::number(2.0).erase_type(),
            ],
        ),
    );
    assert_transpile(
        "1 === 2",
        SExpr::call(
            "bool.eq",
            vec![
                SExpr::number(1.0).erase_type(),
                SExpr::number(2.0).erase_type(),
            ],
        ),
    );
    assert_transpile(
        "1 < 2",
        SExpr::call(
            "bool.lt",
            vec![
                SExpr::number(1.0).erase_type(),
                SExpr::number(2.0).erase_type(),
            ],
        ),
    );
    assert_transpile(
        "1 > 2",
        SExpr::call(
            "bool.gt",
            vec![
                SExpr::number(1.0).erase_type(),
                SExpr::number(2.0).erase_type(),
            ],
        ),
    );
}

#[test]
fn test_logical_operators() {
    assert_transpile(
        "true && false",
        SExpr::call(
            "bool.and",
            vec![
                SExpr::bool(true).erase_type(),
                SExpr::bool(false).erase_type(),
            ],
        ),
    );
    assert_transpile(
        "true || false",
        SExpr::call(
            "bool.or",
            vec![
                SExpr::bool(true).erase_type(),
                SExpr::bool(false).erase_type(),
            ],
        ),
    );
}

#[test]
fn test_unary_operators() {
    assert_transpile(
        "!true",
        SExpr::call("bool.not", vec![SExpr::bool(true).erase_type()]),
    );
    assert_transpile(
        "-5",
        SExpr::call("math.neg", vec![SExpr::number(5.0).erase_type()]),
    );
}

#[test]
fn test_nested_expressions() {
    // (1 + 2) * 3
    assert_transpile(
        "(1 + 2) * 3",
        SExpr::call(
            "math.mul",
            vec![
                SExpr::call(
                    "math.add",
                    vec![
                        SExpr::number(1.0).erase_type(),
                        SExpr::number(2.0).erase_type(),
                    ],
                ),
                SExpr::number(3.0).erase_type(),
            ],
        ),
    );
}

#[test]
fn test_variable_declaration() {
    assert_transpile(
        "let x = 10",
        SExpr::call(
            "std.let",
            vec![
                SExpr::string("x").erase_type(),
                SExpr::number(10.0).erase_type(),
            ],
        ),
    );
    assert_transpile(
        "const y = 20",
        SExpr::call(
            "std.let",
            vec![
                SExpr::string("y").erase_type(),
                SExpr::number(20.0).erase_type(),
            ],
        ),
    );
}

#[test]
fn test_function_call() {
    assert_transpile("foo()", SExpr::call("foo", vec![]));
    assert_transpile(
        "add(1, 2)",
        SExpr::call(
            "add",
            vec![
                SExpr::number(1.0).erase_type(),
                SExpr::number(2.0).erase_type(),
            ],
        ),
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
            vec![
                SExpr::string("a").erase_type(),
                SExpr::string("b").erase_type(),
            ],
        ),
    );
}

#[test]
fn test_array_literal() {
    assert_transpile(
        "[1, 2, 3]",
        SExpr::call(
            "list.new",
            vec![
                SExpr::number(1.0).erase_type(),
                SExpr::number(2.0).erase_type(),
                SExpr::number(3.0).erase_type(),
            ],
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
            vec![
                SExpr::list(vec![
                    SExpr::string("x").erase_type(),
                    SExpr::number(1.0).erase_type(),
                ])
                .erase_type(),
            ],
        ),
    );
    assert_transpile(
        "{ a: 1, b: 2 }",
        SExpr::call(
            "obj.new",
            vec![
                SExpr::list(vec![
                    SExpr::string("a").erase_type(),
                    SExpr::number(1.0).erase_type(),
                ])
                .erase_type(),
                SExpr::list(vec![
                    SExpr::string("b").erase_type(),
                    SExpr::number(2.0).erase_type(),
                ])
                .erase_type(),
            ],
        ),
    );
}

#[test]
fn test_computed_property_name() {
    // Computed property: { [key]: value }
    assert_transpile(
        "{ [k]: 42 }",
        SExpr::call(
            "obj.new",
            vec![
                SExpr::list(vec![
                    SExpr::call("std.var", vec![SExpr::string("k").erase_type()]),
                    SExpr::number(42.0).erase_type(),
                ])
                .erase_type(),
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
                SExpr::call("std.var", vec![SExpr::string("obj").erase_type()]),
                SExpr::string("prop").erase_type(),
            ],
        ),
    );
}

#[test]
fn test_subscript_access() {
    // Numeric index uses list.get (for array access)
    assert_transpile(
        "arr[0]",
        SExpr::call(
            "list.get",
            vec![
                SExpr::call("std.var", vec![SExpr::string("arr").erase_type()]),
                SExpr::number(0.0).erase_type(),
            ],
        ),
    );
}

#[test]
fn test_subscript_string_key() {
    // String key uses obj.get (for object property access)
    assert_transpile(
        r#"obj["key"]"#,
        SExpr::call(
            "obj.get",
            vec![
                SExpr::call("std.var", vec![SExpr::string("obj").erase_type()]),
                SExpr::string("key").erase_type(),
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
                SExpr::list(vec![SExpr::string("x").erase_type()]).erase_type(),
                SExpr::call(
                    "math.add",
                    vec![
                        SExpr::call("std.var", vec![SExpr::string("x").erase_type()]),
                        SExpr::number(1.0).erase_type(),
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
                SExpr::call("std.var", vec![SExpr::string("x").erase_type()]),
                SExpr::number(1.0).erase_type(),
                SExpr::number(2.0).erase_type(),
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
                SExpr::call("std.var", vec![SExpr::string("x").erase_type()]),
                SExpr::call("std.var", vec![SExpr::string("y").erase_type()]),
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
                SExpr::call("std.var", vec![SExpr::string("x").erase_type()]),
                SExpr::number(1.0).erase_type(),
                SExpr::number(2.0).erase_type(),
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
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("x").erase_type(),
                        SExpr::number(1.0).erase_type(),
                    ],
                ),
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("y").erase_type(),
                        SExpr::number(2.0).erase_type(),
                    ],
                ),
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
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("x").erase_type(),
                        SExpr::number(1.0).erase_type(),
                    ],
                ),
                SExpr::call(
                    "math.add",
                    vec![
                        SExpr::call("std.var", vec![SExpr::string("x").erase_type()]),
                        SExpr::number(1.0).erase_type(),
                    ],
                ),
            ],
        ),
    );
}

#[test]
fn test_array_method_push() {
    // arr.push(x) -> list.push(arr, x)
    assert_transpile(
        "arr.push(42)",
        SExpr::call(
            "list.push",
            vec![
                SExpr::call("std.var", vec![SExpr::string("arr").erase_type()]),
                SExpr::number(42.0).erase_type(),
            ],
        ),
    );
}

#[test]
fn test_array_method_pop() {
    // arr.pop() -> list.pop(arr)
    assert_transpile(
        "arr.pop()",
        SExpr::call(
            "list.pop",
            vec![SExpr::call(
                "std.var",
                vec![SExpr::string("arr").erase_type()],
            )],
        ),
    );
}

#[test]
fn test_array_method_map() {
    // arr.map(x => x * 2) -> list.map(arr, lambda)
    assert_transpile(
        "arr.map(x => x * 2)",
        SExpr::call(
            "list.map",
            vec![
                SExpr::call("std.var", vec![SExpr::string("arr").erase_type()]),
                SExpr::call(
                    "std.lambda",
                    vec![
                        SExpr::list(vec![SExpr::string("x").erase_type()]).erase_type(),
                        SExpr::call(
                            "math.mul",
                            vec![
                                SExpr::call("std.var", vec![SExpr::string("x").erase_type()]),
                                SExpr::number(2.0).erase_type(),
                            ],
                        ),
                    ],
                ),
            ],
        ),
    );
}

#[test]
fn test_array_method_filter() {
    // arr.filter(x => x > 0) -> list.filter(arr, lambda)
    assert_transpile(
        "arr.filter(x => x > 0)",
        SExpr::call(
            "list.filter",
            vec![
                SExpr::call("std.var", vec![SExpr::string("arr").erase_type()]),
                SExpr::call(
                    "std.lambda",
                    vec![
                        SExpr::list(vec![SExpr::string("x").erase_type()]).erase_type(),
                        SExpr::call(
                            "bool.gt",
                            vec![
                                SExpr::call("std.var", vec![SExpr::string("x").erase_type()]),
                                SExpr::number(0.0).erase_type(),
                            ],
                        ),
                    ],
                ),
            ],
        ),
    );
}

#[test]
fn test_array_method_reverse() {
    // arr.reverse() -> list.reverse(arr)
    assert_transpile(
        "arr.reverse()",
        SExpr::call(
            "list.reverse",
            vec![SExpr::call(
                "std.var",
                vec![SExpr::string("arr").erase_type()],
            )],
        ),
    );
}

#[test]
fn test_array_method_includes() {
    // arr.includes(5) -> list.includes(arr, 5)
    assert_transpile(
        "arr.includes(5)",
        SExpr::call(
            "list.includes",
            vec![
                SExpr::call("std.var", vec![SExpr::string("arr").erase_type()]),
                SExpr::number(5.0).erase_type(),
            ],
        ),
    );
}

#[test]
fn test_string_method_split() {
    // str.split(",") -> str.split(str, ",")
    assert_transpile(
        "s.split(\",\")",
        SExpr::call(
            "str.split",
            vec![
                SExpr::call("std.var", vec![SExpr::string("s").erase_type()]),
                SExpr::string(",").erase_type(),
            ],
        ),
    );
}

#[test]
fn test_string_method_trim() {
    // s.trim() -> str.trim(s)
    assert_transpile(
        "s.trim()",
        SExpr::call(
            "str.trim",
            vec![SExpr::call(
                "std.var",
                vec![SExpr::string("s").erase_type()],
            )],
        ),
    );
}

#[test]
fn test_string_method_to_lower_case() {
    // s.toLowerCase() -> str.lower(s)
    assert_transpile(
        "s.toLowerCase()",
        SExpr::call(
            "str.lower",
            vec![SExpr::call(
                "std.var",
                vec![SExpr::string("s").erase_type()],
            )],
        ),
    );
}

#[test]
fn test_string_method_to_upper_case() {
    // s.toUpperCase() -> str.upper(s)
    assert_transpile(
        "s.toUpperCase()",
        SExpr::call(
            "str.upper",
            vec![SExpr::call(
                "std.var",
                vec![SExpr::string("s").erase_type()],
            )],
        ),
    );
}

#[test]
fn test_for_of_loop() {
    // for (const x of arr) { x }
    assert_transpile(
        "for (const x of arr) { x }",
        SExpr::call(
            "std.for",
            vec![
                SExpr::string("x").erase_type(),
                SExpr::call("std.var", vec![SExpr::string("arr").erase_type()]),
                SExpr::call("std.var", vec![SExpr::string("x").erase_type()]),
            ],
        ),
    );
}

#[test]
fn test_for_in_loop() {
    // for (const k in obj) { k } -> iterates over keys
    assert_transpile(
        "for (const k in obj) { k }",
        SExpr::call(
            "std.for",
            vec![
                SExpr::string("k").erase_type(),
                SExpr::call(
                    "obj.keys",
                    vec![SExpr::call(
                        "std.var",
                        vec![SExpr::string("obj").erase_type()],
                    )],
                ),
                SExpr::call("std.var", vec![SExpr::string("k").erase_type()]),
            ],
        ),
    );
}

#[test]
fn test_classic_for_loop() {
    // for (let i = 0; i < 10; i += 1) { x }
    // Should become: std.seq(std.let("i", 0), std.while(i < 10, std.seq(x, i += 1)))
    assert_transpile(
        "for (let i = 0; i < 10; i += 1) { x }",
        SExpr::call(
            "std.seq",
            vec![
                // Initializer: let i = 0
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("i").erase_type(),
                        SExpr::number(0.0).erase_type(),
                    ],
                ),
                // While loop
                SExpr::call(
                    "std.while",
                    vec![
                        // Condition: i < 10
                        SExpr::call(
                            "bool.lt",
                            vec![
                                SExpr::call("std.var", vec![SExpr::string("i").erase_type()]),
                                SExpr::number(10.0).erase_type(),
                            ],
                        ),
                        // Body: std.seq(x, i += 1)
                        SExpr::call(
                            "std.seq",
                            vec![
                                // Body: { x }
                                SExpr::call("std.var", vec![SExpr::string("x").erase_type()]),
                                // Update: i += 1
                                SExpr::call(
                                    "std.set",
                                    vec![
                                        SExpr::string("i").erase_type(),
                                        SExpr::call(
                                            "math.add",
                                            vec![
                                                SExpr::call(
                                                    "std.var",
                                                    vec![SExpr::string("i").erase_type()],
                                                ),
                                                SExpr::number(1.0).erase_type(),
                                            ],
                                        ),
                                    ],
                                ),
                            ],
                        ),
                    ],
                ),
            ],
        ),
    );
}

#[test]
fn test_switch_statement() {
    // switch (x) { case 1: a; break; case 2: b; break; default: c; }
    // Should become nested if-else
    assert_transpile(
        "switch (x) { case 1: a; break; case 2: b; break; default: c; }",
        SExpr::call(
            "std.if",
            vec![
                // Condition: x == 1
                SExpr::call(
                    "bool.eq",
                    vec![
                        SExpr::call("std.var", vec![SExpr::string("x").erase_type()]),
                        SExpr::number(1.0).erase_type(),
                    ],
                ),
                // Case 1 body: a
                SExpr::call("std.var", vec![SExpr::string("a").erase_type()]),
                // Else branch: nested if for case 2
                SExpr::call(
                    "std.if",
                    vec![
                        // Condition: x == 2
                        SExpr::call(
                            "bool.eq",
                            vec![
                                SExpr::call("std.var", vec![SExpr::string("x").erase_type()]),
                                SExpr::number(2.0).erase_type(),
                            ],
                        ),
                        // Case 2 body: b
                        SExpr::call("std.var", vec![SExpr::string("b").erase_type()]),
                        // Default: c
                        SExpr::call("std.var", vec![SExpr::string("c").erase_type()]),
                    ],
                ),
            ],
        ),
    );
}
