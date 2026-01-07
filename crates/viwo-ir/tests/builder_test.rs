//! Test that generated builders work correctly.

use viwo_ir::SExpr;
use viwo_ir::builders::*;

#[test]
fn test_math_builders() {
    // Note: Variadic builders currently expect Array type due to schema
    // This will be improved when we refine the schema
    let expr = math_sub(SExpr::number(10), SExpr::number(3));

    // Verify it's an opcode call
    assert!(expr.is_call());
    assert_eq!(expr.opcode(), Some("math.sub"));

    // Verify arguments
    let args = expr.args().unwrap();
    assert_eq!(args.len(), 2);
    assert_eq!(args[0].as_number(), Some(10.0));
    assert_eq!(args[1].as_number(), Some(3.0));
}

#[test]
fn test_str_builders() {
    // Test str.length with type-safe builders
    let expr = str_length(SExpr::string("Hello"));

    assert!(expr.is_call());
    assert_eq!(expr.opcode(), Some("str.length"));

    let args = expr.args().unwrap();
    assert_eq!(args.len(), 1);
    assert_eq!(args[0].as_str(), Some("Hello"));
}

#[test]
fn test_std_builders() {
    // Test std.let which has keyword parameter names
    let expr = std_let(SExpr::string("x"), SExpr::number(42).erase_type());

    assert!(expr.is_call());
    assert_eq!(expr.opcode(), Some("std.let"));

    let args = expr.args().unwrap();
    assert_eq!(args.len(), 2);
    assert_eq!(args[0].as_str(), Some("x"));
    assert_eq!(args[1].as_number(), Some(42.0));
}

#[test]
fn test_std_if_builder() {
    // Test std.if which has "else" as a keyword parameter
    let expr = std_if(
        SExpr::bool(true),
        SExpr::number(1).erase_type(),
        SExpr::number(2).erase_type(),
    );

    assert!(expr.is_call());
    assert_eq!(expr.opcode(), Some("std.if"));

    let args = expr.args().unwrap();
    assert_eq!(args.len(), 3);
    assert_eq!(args[0].as_bool(), Some(true));
    assert_eq!(args[1].as_number(), Some(1.0));
    assert_eq!(args[2].as_number(), Some(2.0));
}

#[test]
fn test_obj_builders() {
    // Test obj.get with generic types
    let expr = obj_get(
        SExpr::object(std::collections::HashMap::new()),
        SExpr::string("key"),
    );

    assert!(expr.is_call());
    assert_eq!(expr.opcode(), Some("obj.get"));

    let args = expr.args().unwrap();
    assert_eq!(args.len(), 2);
}

#[test]
fn test_builder_type_safety() {
    // This test verifies that the builders have correct type signatures
    // by using them in a type-constrained context

    let _num_expr: SExpr<viwo_ir::Num> = math_sub(SExpr::number(10), SExpr::number(2));

    // str_length returns a number (length)
    let _len_expr: SExpr<viwo_ir::Num> = str_length(SExpr::string("test"));

    let _bool_expr: SExpr<viwo_ir::Bool> = bool_not(SExpr::bool(true));
}
