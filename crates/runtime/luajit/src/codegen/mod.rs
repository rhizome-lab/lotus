//! S-expression to Lua code generation.

mod bool;
mod fs;
mod game;
mod json;
mod list;
mod math;
mod obj;
mod procgen;
mod std;
mod str;

use ::std::collections::HashSet;
use thiserror::Error;
use viwo_ir::SExpr;

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
        "and", "break", "do", "else", "elseif", "end", "false", "for", "function",
        "goto", "if", "in", "local", "nil", "not", "or", "repeat", "return",
        "then", "true", "until", "while",
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
        .map(|c| if c.is_alphanumeric() || c == '_' { c } else { '_' })
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

    match node {
        // Use null sentinel so null values serialize correctly in arrays
        SExpr::Null => Ok(format!("{}null", prefix)),
        SExpr::Bool(b) => Ok(format!("{}{}", prefix, if *b { "true" } else { "false" })),
        SExpr::Number(n) => {
            // Handle special float values
            if n.is_nan() {
                Ok(format!("{}(0/0)", prefix))
            } else if n.is_infinite() {
                if *n > 0.0 {
                    Ok(format!("{}(1/0)", prefix))
                } else {
                    Ok(format!("{}(-1/0)", prefix))
                }
            } else {
                Ok(format!("{}{}", prefix, n))
            }
        }
        SExpr::String(s) => Ok(format!("{}{}", prefix, lua_string_literal(s))),
        SExpr::Object(map) => {
            let mut pairs = Vec::new();
            for (key, value) in map {
                let val_code = compile_value(value, false)?;
                pairs.push(format!("[{}] = {}", lua_string_literal(key), val_code));
            }
            Ok(format!("{}{{ {} }}", prefix, pairs.join(", ")))
        }
        SExpr::List(items) => {
            if items.is_empty() {
                return Ok(format!("{}{{}}", prefix));
            }

            // Check if this is an opcode call
            if let SExpr::String(op) = &items[0] {
                compile_opcode(op, &items[1..], should_return)
            } else {
                // Literal array
                let elements: Result<Vec<_>, _> = items
                    .iter()
                    .map(|item| compile_value(item, false))
                    .collect();
                Ok(format!("{}{{ {} }}", prefix, elements?.join(", ")))
            }
        }
    }
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
    if let SExpr::List(items) = expr {
        if let Some(SExpr::String(op)) = items.first() {
            return matches!(
                op.as_str(),
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
    false
}

pub(crate) fn sexpr_to_lua_table(expr: &SExpr, prefix: &str) -> Result<String, CompileError> {
    match expr {
        SExpr::Null => Ok(format!("{}nil", prefix)),
        SExpr::Bool(b) => Ok(format!("{}{}", prefix, b)),
        SExpr::Number(n) => Ok(format!("{}{}", prefix, n)),
        SExpr::String(s) => Ok(format!("{}{}", prefix, lua_string_literal(s))),
        SExpr::List(items) => {
            let elements: Result<Vec<_>, _> = items
                .iter()
                .map(|item| sexpr_to_lua_table(item, ""))
                .collect();
            Ok(format!("{}{{ {} }}", prefix, elements?.join(", ")))
        }
        SExpr::Object(map) => {
            let mut pairs = Vec::new();
            for (key, value) in map {
                let val = sexpr_to_lua_table(value, "")?;
                pairs.push(format!("[{}] = {}", lua_string_literal(key), val));
            }
            Ok(format!("{}{{ {} }}", prefix, pairs.join(", ")))
        }
    }
}
