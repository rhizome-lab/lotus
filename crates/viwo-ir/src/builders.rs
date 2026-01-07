//! Type-safe S-expression builders generated from schema.
//!
//! This module is auto-generated from opcodes.toml.
//! Do not edit manually.

use crate::{Any, Arr, Bool, Null, Num, Obj, SExpr, Str};

// ============================================================================
// bool library
// ============================================================================

/// Logical AND
///
/// Opcode: `bool.and`
///
/// Note: This opcode is lazy (defers evaluation of arguments)
pub fn bool_and(args: Vec<SExpr<Arr>>) -> SExpr<Bool> {
    SExpr::call(
        "bool.and",
        args.into_iter().map(|a| a.erase_type()).collect(),
    )
    .cast_type()
}

/// Logical OR
///
/// Opcode: `bool.or`
///
/// Note: This opcode is lazy (defers evaluation of arguments)
pub fn bool_or(args: Vec<SExpr<Arr>>) -> SExpr<Bool> {
    SExpr::call(
        "bool.or",
        args.into_iter().map(|a| a.erase_type()).collect(),
    )
    .cast_type()
}

/// Logical NOT
///
/// Opcode: `bool.not`
pub fn bool_not(value: SExpr<Bool>) -> SExpr<Bool> {
    SExpr::call("bool.not", vec![value.erase_type()]).cast_type()
}

// ============================================================================
// list library
// ============================================================================

/// Creates a new list from elements
///
/// Opcode: `list.new`
///
/// Generic parameters: `Elements extends readonly unknown[]`
///
/// Note: This opcode is lazy (defers evaluation of arguments)
pub fn list_new(args: Vec<SExpr<Arr>>) -> SExpr<Arr> {
    SExpr::call(
        "list.new",
        args.into_iter().map(|a| a.erase_type()).collect(),
    )
    .cast_type()
}

/// Gets an element from a list by index
///
/// Opcode: `list.get`
///
/// Generic parameters: `T`
pub fn list_get(list: SExpr<Arr>, index: SExpr<Num>) -> SExpr<Any> {
    SExpr::call("list.get", vec![list.erase_type(), index.erase_type()])
}

/// Returns the length of a list
///
/// Opcode: `list.length`
pub fn list_length(list: SExpr<Arr>) -> SExpr<Num> {
    SExpr::call("list.length", vec![list.erase_type()]).cast_type()
}

// ============================================================================
// math library
// ============================================================================

/// Adds numbers
///
/// Opcode: `math.add`
pub fn math_add(args: Vec<SExpr<Arr>>) -> SExpr<Num> {
    SExpr::call(
        "math.add",
        args.into_iter().map(|a| a.erase_type()).collect(),
    )
    .cast_type()
}

/// Subtracts numbers
///
/// Opcode: `math.sub`
pub fn math_sub(left: SExpr<Num>, right: SExpr<Num>) -> SExpr<Num> {
    SExpr::call("math.sub", vec![left.erase_type(), right.erase_type()]).cast_type()
}

/// Multiplies numbers
///
/// Opcode: `math.mul`
pub fn math_mul(args: Vec<SExpr<Arr>>) -> SExpr<Num> {
    SExpr::call(
        "math.mul",
        args.into_iter().map(|a| a.erase_type()).collect(),
    )
    .cast_type()
}

/// Divides numbers
///
/// Opcode: `math.div`
pub fn math_div(left: SExpr<Num>, right: SExpr<Num>) -> SExpr<Num> {
    SExpr::call("math.div", vec![left.erase_type(), right.erase_type()]).cast_type()
}

// ============================================================================
// obj library
// ============================================================================

/// Gets a property value from an object
///
/// Opcode: `obj.get`
///
/// Generic parameters: `Type, Key extends keyof Type`
pub fn obj_get(object: SExpr<Obj>, key: SExpr<Str>) -> SExpr<Any> {
    SExpr::call("obj.get", vec![object.erase_type(), key.erase_type()])
}

/// Sets a property value on an object
///
/// Opcode: `obj.set`
///
/// Note: This opcode is lazy (defers evaluation of arguments)
pub fn obj_set(object: SExpr<Obj>, key: SExpr<Str>, value: SExpr<Any>) -> SExpr<Null> {
    SExpr::call(
        "obj.set",
        vec![object.erase_type(), key.erase_type(), value.erase_type()],
    )
    .cast_type()
}

/// Returns an array of a given object's own enumerable property names
///
/// Opcode: `obj.keys`
///
/// Generic parameters: `Type`
pub fn obj_keys(object: SExpr<Obj>) -> SExpr<Arr> {
    SExpr::call("obj.keys", vec![object.erase_type()]).cast_type()
}

/// Returns an array of a given object's own enumerable property values
///
/// Opcode: `obj.values`
///
/// Generic parameters: `Type`
pub fn obj_values(object: SExpr<Obj>) -> SExpr<Arr> {
    SExpr::call("obj.values", vec![object.erase_type()]).cast_type()
}

// ============================================================================
// std library
// ============================================================================

/// Current entity
///
/// Opcode: `std.this`
pub fn std_this() -> SExpr<Obj> {
    SExpr::call("std.this", vec![]).cast_type()
}

/// Current caller
///
/// Opcode: `std.caller`
pub fn std_caller() -> SExpr<Obj> {
    SExpr::call("std.caller", vec![]).cast_type()
}

/// Executes a sequence of steps and returns the result of the last step
///
/// Opcode: `std.seq`
///
/// Note: This opcode is lazy (defers evaluation of arguments)
pub fn std_seq(args: Vec<SExpr<Arr>>) -> SExpr<Any> {
    SExpr::call(
        "std.seq",
        args.into_iter().map(|a| a.erase_type()).collect(),
    )
}

/// Creates a new variable in the current scope
///
/// Opcode: `std.let`
///
/// Note: This opcode is lazy (defers evaluation of arguments)
pub fn std_let(name: SExpr<Str>, value: SExpr<Any>) -> SExpr<Null> {
    SExpr::call("std.let", vec![name.erase_type(), value.erase_type()]).cast_type()
}

/// Reads the value of a variable
///
/// Opcode: `std.var`
pub fn std_var(name: SExpr<Str>) -> SExpr<Any> {
    SExpr::call("std.var", vec![name.erase_type()])
}

/// Sets the value of an existing variable
///
/// Opcode: `std.set`
///
/// Note: This opcode is lazy (defers evaluation of arguments)
pub fn std_set(name: SExpr<Str>, value: SExpr<Any>) -> SExpr<Null> {
    SExpr::call("std.set", vec![name.erase_type(), value.erase_type()]).cast_type()
}

/// Conditional execution
///
/// Opcode: `std.if`
///
/// Note: This opcode is lazy (defers evaluation of arguments)
pub fn std_if(condition: SExpr<Bool>, then: SExpr<Any>, r#else: SExpr<Any>) -> SExpr<Any> {
    SExpr::call(
        "std.if",
        vec![
            condition.erase_type(),
            then.erase_type(),
            r#else.erase_type(),
        ],
    )
}

// ============================================================================
// str library
// ============================================================================

/// Concatenates strings
///
/// Opcode: `str.concat`
pub fn str_concat(args: Vec<SExpr<Arr>>) -> SExpr<Str> {
    SExpr::call(
        "str.concat",
        args.into_iter().map(|a| a.erase_type()).collect(),
    )
    .cast_type()
}

/// Returns the length of a string
///
/// Opcode: `str.length`
pub fn str_length(string: SExpr<Str>) -> SExpr<Num> {
    SExpr::call("str.length", vec![string.erase_type()]).cast_type()
}
