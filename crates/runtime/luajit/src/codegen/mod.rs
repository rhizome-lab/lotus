//! S-expression to Lua code generation.

mod ai;
mod bool;
mod fs;
mod game;
mod json;
mod list;
mod math;
mod memory;
mod net;
mod obj;
mod procgen;
mod sqlite;
mod std;
mod str;
mod vector;

use ::std::collections::HashSet;
use rhizome_lotus_ir::SExpr;
use thiserror::Error;

/// Errors that can occur during compilation.
#[derive(Debug, Error)]
pub enum CompileError {
    #[error("unknown opcode: {0}")]
    UnknownOpcode(String),

    #[error("invalid argument count for {opcode}: expected {expected}, got {got}")]
    InvalidArgCount {
        opcode: String,
        expected: usize,
        got: usize,
    },

    #[error("invalid argument: {0}")]
    InvalidArgument(String),

    #[error("invalid arguments: {0}")]
    InvalidArguments(String),
}

/// Lua reserved keywords that need escaping.
fn lua_keywords() -> HashSet<&'static str> {
    [
        "and", "break", "do", "else", "elseif", "end", "false", "for", "function", "goto", "if",
        "in", "local", "nil", "not", "or", "repeat", "return", "then", "true", "until", "while",
    ]
    .into_iter()
    .collect()
}

/// Convert a variable name to a safe Lua identifier.
pub(crate) fn to_lua_name(name: &str) -> String {
    let keywords = lua_keywords();

    // Replace invalid characters with _
    let mut safe: String = name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();

    // Cannot start with digit
    if safe.chars().next().is_some_and(|c| c.is_ascii_digit()) {
        safe = format!("_{}", safe);
    }

    // Avoid keywords
    if keywords.contains(safe.as_str()) {
        format!("_{}", safe)
    } else {
        safe
    }
}

/// Compile an S-expression to Lua source code.
pub fn compile(expr: &SExpr) -> Result<String, CompileError> {
    compile_value(expr, true)
}

pub(crate) fn compile_value(node: &SExpr, should_return: bool) -> Result<String, CompileError> {
    let prefix = if should_return { "return " } else { "" };

    // Check null
    if node.is_null() {
        return Ok(format!("{}null", prefix));
    }

    // Check bool
    if let Some(b) = node.as_bool() {
        return Ok(format!("{}{}", prefix, if b { "true" } else { "false" }));
    }

    // Check number
    if let Some(n) = node.as_number() {
        // Handle special float values
        if n.is_nan() {
            return Ok(format!("{}(0/0)", prefix));
        } else if n.is_infinite() {
            if n > 0.0 {
                return Ok(format!("{}(1/0)", prefix));
            } else {
                return Ok(format!("{}(-1/0)", prefix));
            }
        } else {
            return Ok(format!("{}{}", prefix, n));
        }
    }

    // Check string
    if let Some(s) = node.as_str() {
        return Ok(format!("{}{}", prefix, lua_string_literal(s)));
    }

    // Check object
    if let Some(map) = node.as_object() {
        let mut pairs = Vec::new();
        for (key, value) in map {
            let val_code = compile_value(value, false)?;
            pairs.push(format!("[{}] = {}", lua_string_literal(key), val_code));
        }
        return Ok(format!("{}{{ {} }}", prefix, pairs.join(", ")));
    }

    // Check list
    if let Some(items) = node.as_list() {
        if items.is_empty() {
            return Ok(format!("{}{{}}", prefix));
        }

        // Check if this is an opcode call
        if let Some(op) = items[0].as_str() {
            return compile_opcode(op, &items[1..], should_return);
        } else {
            // Literal array
            let elements: Result<Vec<_>, _> = items
                .iter()
                .map(|item| compile_value(item, false))
                .collect();
            return Ok(format!("{}{{ {} }}", prefix, elements?.join(", ")));
        }
    }

    // This should never happen if SExpr is properly constructed
    Ok(format!("{}null", prefix))
}

pub(crate) fn lua_string_literal(s: &str) -> String {
    // Use Lua's [[ ]] syntax for multiline strings if needed
    if s.contains('\n') && !s.contains("]]") {
        format!("[[{}]]", s)
    } else {
        // Escape special characters
        let escaped = s
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
            .replace('\r', "\\r")
            .replace('\t', "\\t");
        format!("\"{}\"", escaped)
    }
}

fn compile_opcode(op: &str, args: &[SExpr], should_return: bool) -> Result<String, CompileError> {
    let prefix = if should_return { "return " } else { "" };

    // Try each library in order
    if let Some(result) = std::compile_std(op, args, should_return)? {
        return Ok(result);
    }
    if let Some(result) = game::compile_game(op, args, prefix)? {
        return Ok(result);
    }
    if let Some(result) = math::compile_math(op, args, prefix)? {
        return Ok(result);
    }
    if let Some(result) = bool::compile_bool(op, args, prefix)? {
        return Ok(result);
    }
    if let Some(result) = str::compile_str(op, args, prefix)? {
        return Ok(result);
    }
    if let Some(result) = list::compile_list(op, args, prefix)? {
        return Ok(result);
    }
    if let Some(result) = obj::compile_obj(op, args, prefix)? {
        return Ok(result);
    }
    if let Some(result) = json::compile_json(op, args, prefix)? {
        return Ok(result);
    }
    if let Some(result) = procgen::compile_procgen(op, args, prefix)? {
        return Ok(result);
    }
    if let Some(result) = fs::compile_fs(op, args, prefix)? {
        return Ok(result);
    }
    if let Some(result) = sqlite::compile_sqlite(op, args, prefix)? {
        return Ok(result);
    }
    if let Some(result) = net::compile_net(op, args, prefix)? {
        return Ok(result);
    }
    if let Some(result) = vector::compile_vector(op, args, prefix)? {
        return Ok(result);
    }
    if let Some(result) = ai::compile_ai(op, args, prefix)? {
        return Ok(result);
    }
    if let Some(result) = memory::compile_memory(op, args, prefix)? {
        return Ok(result);
    }

    // Default: unknown opcode - generate a function call
    let compiled: Result<Vec<_>, _> = args.iter().map(|a| compile_value(a, false)).collect();
    let func_name = op.replace('.', "_");
    Ok(format!("{}{}({})", prefix, func_name, compiled?.join(", ")))
}

pub(crate) fn compile_infix_op(
    lua_op: &str,
    args: &[SExpr],
    prefix: &str,
) -> Result<String, CompileError> {
    if args.is_empty() {
        return Err(CompileError::InvalidArgCount {
            opcode: lua_op.to_string(),
            expected: 1,
            got: 0,
        });
    }
    let compiled: Result<Vec<_>, _> = args.iter().map(|a| compile_value(a, false)).collect();
    let expr = compiled?.join(&format!(" {} ", lua_op));
    Ok(format!("{}({})", prefix, expr))
}

/// Check if an S-expression compiles to a Lua statement (not needing prefix).
pub(crate) fn is_statement_opcode(expr: &SExpr) -> bool {
    if let Some(items) = expr.as_list() {
        if let Some(first) = items.first() {
            if let Some(op) = first.as_str() {
                return matches!(
                    op,
                    "std.let"
                        | "std.set"
                        | "std.if"
                        | "std.while"
                        | "std.for"
                        | "std.break"
                        | "std.continue"
                        | "std.return"
                        | "std.seq"
                        | "obj.set"
                        | "obj.delete"
                        | "list.set"
                        | "list.push"
                );
            }
        }
    }
    false
}

/// Check if an expression contains control flow (break/continue/return) that can't be wrapped in IIFE.
/// These opcodes can't escape from a function boundary in Lua.
pub(crate) fn contains_loop_control_flow(expr: &SExpr) -> bool {
    if let Some(items) = expr.as_list() {
        if let Some(first) = items.first() {
            if let Some(op) = first.as_str() {
                // Direct control flow opcodes that can't escape IIFE
                if matches!(op, "std.break" | "std.continue" | "std.return") {
                    return true;
                }
                // Don't recurse into lambdas - they create a new scope where control flow is valid
                if op == "std.lambda" {
                    return false;
                }
            }
        }
        // Recurse into all children
        for item in items {
            if contains_loop_control_flow(item) {
                return true;
            }
        }
    }
    false
}

pub(crate) fn sexpr_to_lua_table(expr: &SExpr, prefix: &str) -> Result<String, CompileError> {
    if expr.is_null() {
        return Ok(format!("{}nil", prefix));
    }
    if let Some(b) = expr.as_bool() {
        return Ok(format!("{}{}", prefix, b));
    }
    if let Some(n) = expr.as_number() {
        return Ok(format!("{}{}", prefix, n));
    }
    if let Some(s) = expr.as_str() {
        return Ok(format!("{}{}", prefix, lua_string_literal(s)));
    }
    if let Some(items) = expr.as_list() {
        let elements: Result<Vec<_>, _> = items
            .iter()
            .map(|item| sexpr_to_lua_table(item, ""))
            .collect();
        return Ok(format!("{}{{ {} }}", prefix, elements?.join(", ")));
    }
    if let Some(map) = expr.as_object() {
        let mut pairs = Vec::new();
        for (key, value) in map {
            let val = sexpr_to_lua_table(value, "")?;
            pairs.push(format!("[{}] = {}", lua_string_literal(key), val));
        }
        return Ok(format!("{}{{ {} }}", prefix, pairs.join(", ")));
    }
    Ok(format!("{}nil", prefix))
}
