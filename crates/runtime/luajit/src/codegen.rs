//! S-expression to Lua code generation.

use std::collections::HashSet;
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
fn to_lua_name(name: &str) -> String {
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

fn compile_value(node: &SExpr, should_return: bool) -> Result<String, CompileError> {
    let prefix = if should_return { "return " } else { "" };

    match node {
        SExpr::Null => Ok(format!("{}nil", prefix)),
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

fn lua_string_literal(s: &str) -> String {
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

    // Special forms that need custom code generation
    match op {
        "std.seq" => {
            if args.is_empty() {
                return Ok(format!("{}nil", prefix));
            }
            let mut code = String::new();
            for (idx, arg) in args.iter().enumerate() {
                let is_last = idx == args.len() - 1;
                let result = compile_value(arg, should_return && is_last)?;
                code.push_str(&result);
                code.push('\n');
            }
            Ok(code)
        }

        "std.if" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let cond = compile_value(&args[0], false)?;
            let then_branch = compile_value(&args[1], should_return)?;
            let else_branch = if args.len() > 2 {
                compile_value(&args[2], should_return)?
            } else if should_return {
                "return nil".to_string()
            } else {
                String::new()
            };

            if else_branch.is_empty() {
                Ok(format!("if {} then\n{}\nend", cond, then_branch))
            } else {
                Ok(format!(
                    "if {} then\n{}\nelse\n{}\nend",
                    cond, then_branch, else_branch
                ))
            }
        }

        "std.while" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let cond = compile_value(&args[0], false)?;
            let body = compile_value(&args[1], false)?;
            Ok(format!("while {} do\n{}\nend", cond, body))
        }

        "std.for" => {
            if args.len() < 3 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 3,
                    got: args.len(),
                });
            }
            let var_name = args[0]
                .as_str()
                .ok_or_else(|| CompileError::InvalidArgument("for variable must be string".into()))?;
            let iter = compile_value(&args[1], false)?;
            let body = compile_value(&args[2], false)?;
            Ok(format!(
                "for _, {} in ipairs({}) do\n{}\nend",
                to_lua_name(var_name),
                iter,
                body
            ))
        }

        "std.let" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let var_name = args[0]
                .as_str()
                .ok_or_else(|| CompileError::InvalidArgument("let variable must be string".into()))?;
            let value = compile_value(&args[1], false)?;
            Ok(format!("local {} = {}", to_lua_name(var_name), value))
        }

        "std.set" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let var_name = args[0]
                .as_str()
                .ok_or_else(|| CompileError::InvalidArgument("set variable must be string".into()))?;
            let value = compile_value(&args[1], false)?;
            Ok(format!("{} = {}", to_lua_name(var_name), value))
        }

        "std.var" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let var_name = args[0]
                .as_str()
                .ok_or_else(|| CompileError::InvalidArgument("var name must be string".into()))?;
            Ok(format!("{}{}", prefix, to_lua_name(var_name)))
        }

        "std.break" => Ok("break".to_string()),
        "std.continue" => {
            // Lua doesn't have continue, use goto
            Ok("goto continue_label".to_string())
        }

        "std.return" => {
            let value = if args.is_empty() {
                "nil".to_string()
            } else {
                compile_value(&args[0], false)?
            };
            Ok(format!("return {}", value))
        }

        "std.lambda" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let params = args[0]
                .as_list()
                .ok_or_else(|| CompileError::InvalidArgument("lambda params must be list".into()))?;
            let param_names: Result<Vec<_>, _> = params
                .iter()
                .map(|p| {
                    p.as_str()
                        .map(to_lua_name)
                        .ok_or_else(|| CompileError::InvalidArgument("param must be string".into()))
                })
                .collect();
            let body = compile_value(&args[1], true)?;
            Ok(format!(
                "{}function({})\n{}\nend",
                prefix,
                param_names?.join(", "),
                body
            ))
        }

        "std.quote" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            // Quote returns the raw S-expression as a Lua table
            sexpr_to_lua_table(&args[0], prefix)
        }

        // Arithmetic operators
        "+" | "math.add" => compile_infix_op("+", args, prefix),
        "-" | "math.sub" => compile_infix_op("-", args, prefix),
        "*" | "math.mul" => compile_infix_op("*", args, prefix),
        "/" | "math.div" => compile_infix_op("/", args, prefix),
        "%" | "math.mod" => compile_infix_op("%", args, prefix),
        "^" | "math.pow" => compile_infix_op("^", args, prefix),

        // Comparison operators
        "==" | "bool.eq" => compile_infix_op("==", args, prefix),
        "!=" | "bool.neq" => compile_infix_op("~=", args, prefix),
        "<" | "bool.lt" => compile_infix_op("<", args, prefix),
        "<=" | "bool.lte" => compile_infix_op("<=", args, prefix),
        ">" | "bool.gt" => compile_infix_op(">", args, prefix),
        ">=" | "bool.gte" => compile_infix_op(">=", args, prefix),

        // Logical operators
        "&&" | "bool.and" => compile_infix_op("and", args, prefix),
        "||" | "bool.or" => compile_infix_op("or", args, prefix),
        "!" | "bool.not" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let arg = compile_value(&args[0], false)?;
            Ok(format!("{}not {}", prefix, arg))
        }

        // String operations
        "str.concat" => {
            let compiled: Result<Vec<_>, _> =
                args.iter().map(|a| compile_value(a, false)).collect();
            Ok(format!("{}{}", prefix, compiled?.join(" .. ")))
        }

        "str.len" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let arg = compile_value(&args[0], false)?;
            Ok(format!("{}#{}", prefix, arg))
        }

        // List operations
        "list.new" => {
            let elements: Result<Vec<_>, _> =
                args.iter().map(|a| compile_value(a, false)).collect();
            Ok(format!("{}{{ {} }}", prefix, elements?.join(", ")))
        }

        "list.len" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let arg = compile_value(&args[0], false)?;
            Ok(format!("{}#{}", prefix, arg))
        }

        "list.get" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let list = compile_value(&args[0], false)?;
            let index = compile_value(&args[1], false)?;
            // Lua is 1-indexed, so add 1 to the index
            Ok(format!("{}{}[{} + 1]", prefix, list, index))
        }

        // Object operations
        "obj.get" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let obj = compile_value(&args[0], false)?;
            let key = compile_value(&args[1], false)?;
            Ok(format!("{}{}[{}]", prefix, obj, key))
        }

        "obj.set" => {
            if args.len() < 3 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 3,
                    got: args.len(),
                });
            }
            let obj = compile_value(&args[0], false)?;
            let key = compile_value(&args[1], false)?;
            let value = compile_value(&args[2], false)?;
            Ok(format!("{}[{}] = {}", obj, key, value))
        }

        "obj.new" => {
            let mut pairs = Vec::new();
            for arg in args {
                let pair = arg
                    .as_list()
                    .ok_or_else(|| CompileError::InvalidArgument("obj.new arg must be pair".into()))?;
                if pair.len() < 2 {
                    return Err(CompileError::InvalidArgument("obj.new pair must have key and value".into()));
                }
                let key = compile_value(&pair[0], false)?;
                let val = compile_value(&pair[1], false)?;
                pairs.push(format!("[{}] = {}", key, val));
            }
            Ok(format!("{}{{ {} }}", prefix, pairs.join(", ")))
        }

        // Default: unknown opcode - generate a function call
        _ => {
            let compiled: Result<Vec<_>, _> =
                args.iter().map(|a| compile_value(a, false)).collect();
            let func_name = op.replace('.', "_");
            Ok(format!("{}{}({})", prefix, func_name, compiled?.join(", ")))
        }
    }
}

fn compile_infix_op(lua_op: &str, args: &[SExpr], prefix: &str) -> Result<String, CompileError> {
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

fn sexpr_to_lua_table(expr: &SExpr, prefix: &str) -> Result<String, CompileError> {
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
