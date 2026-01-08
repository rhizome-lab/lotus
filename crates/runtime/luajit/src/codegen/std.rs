//! std.* opcode compilation.

use super::{
    CompileError, compile_value, contains_loop_control_flow, is_statement_opcode,
    sexpr_to_lua_table, to_lua_name,
};
use lotus_ir::SExpr;

/// Compile std.* opcodes. Returns None if opcode doesn't match.
pub fn compile_std(
    op: &str,
    args: &[SExpr],
    should_return: bool,
) -> Result<Option<String>, CompileError> {
    let prefix = if should_return { "return " } else { "" };

    let result = match op {
        "std.seq" => {
            if args.is_empty() {
                return Ok(Some(format!("{}nil", prefix)));
            }
            let mut code = String::new();
            for (idx, arg) in args.iter().enumerate() {
                let is_last = idx == args.len() - 1;
                if is_last {
                    let result = compile_value(arg, should_return)?;
                    code.push_str(&result);
                } else {
                    // Non-last expressions need to be valid Lua statements
                    let result = compile_value(arg, false)?;
                    if is_statement_opcode(arg) {
                        code.push_str(&result);
                    } else {
                        // Wrap expression in _ = to make it a valid statement
                        code.push_str("_ = ");
                        code.push_str(&result);
                    }
                }
                // Add semicolon to prevent Lua parsing ambiguity when a statement
                // ends with ) and the next starts with ( - Lua may parse as function call
                code.push_str(";\n");
            }
            code
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

            // Check if branches contain loop control flow (break/continue)
            // These can't be wrapped in IIFE because they need to escape to the outer loop
            let has_control_flow = contains_loop_control_flow(&args[1])
                || args.get(2).is_some_and(|e| contains_loop_control_flow(e));

            // When used as a value (should_return = false), we normally wrap in IIFE
            // since Lua's if is a statement, not an expression.
            // But if branches contain break/continue, we must use plain if.
            if should_return || has_control_flow {
                // Generate if statement (not wrapped in IIFE)
                let then_branch = compile_value(&args[1], should_return)?;
                let else_branch = if args.len() > 2 {
                    compile_value(&args[2], should_return)?
                } else if should_return {
                    "return nil".to_string()
                } else {
                    String::new()
                };
                if else_branch.is_empty() {
                    format!("if {} then\n{}\nend", cond, then_branch)
                } else {
                    format!(
                        "if {} then\n{}\nelse\n{}\nend",
                        cond, then_branch, else_branch
                    )
                }
            } else {
                // Used as expression: wrap in IIFE with returns
                let then_branch = compile_value(&args[1], true)?;
                let else_branch = if args.len() > 2 {
                    compile_value(&args[2], true)?
                } else {
                    "return nil".to_string()
                };
                format!(
                    "(function() if {} then\n{}\nelse\n{}\nend end)()",
                    cond, then_branch, else_branch
                )
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
            // Include ::continue_label:: for std.continue support (goto)
            format!("while {} do\n{}\n::continue_label::\nend", cond, body)
        }

        "std.for" => {
            if args.len() < 3 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 3,
                    got: args.len(),
                });
            }
            let var_name = args[0].as_str().ok_or_else(|| {
                CompileError::InvalidArgument("for variable must be string".into())
            })?;
            let iter = compile_value(&args[1], false)?;
            let body = compile_value(&args[2], false)?;
            // Include ::continue_label:: for std.continue support (goto)
            format!(
                "for _, {} in ipairs({}) do\n{}\n::continue_label::\nend",
                to_lua_name(var_name),
                iter,
                body
            )
        }

        "std.let" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let var_name = args[0].as_str().ok_or_else(|| {
                CompileError::InvalidArgument("let variable must be string".into())
            })?;
            let value = compile_value(&args[1], false)?;
            format!("local {} = {}", to_lua_name(var_name), value)
        }

        "std.set" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let var_name = args[0].as_str().ok_or_else(|| {
                CompileError::InvalidArgument("set variable must be string".into())
            })?;
            let value = compile_value(&args[1], false)?;
            format!("{} = {}", to_lua_name(var_name), value)
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
            format!("{}{}", prefix, to_lua_name(var_name))
        }

        "std.arg" => {
            if args.len() != 1 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: args.len(),
                });
            }
            let index = compile_value(&args[0], false)?;
            // Lua arrays are 1-indexed, but std.arg uses 0-indexed
            format!("{}(__args[{} + 1])", prefix, index)
        }

        "std.args" => {
            if !args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 0,
                    got: args.len(),
                });
            }
            format!("{}__args", prefix)
        }

        "std.this" => {
            if !args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 0,
                    got: args.len(),
                });
            }
            format!("{}__this", prefix)
        }

        "std.caller" => {
            if !args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 0,
                    got: args.len(),
                });
            }
            format!("{}__caller", prefix)
        }

        "std.break" => "break".to_string(),

        "std.continue" => {
            // Lua doesn't have continue, use goto
            "goto continue_label".to_string()
        }

        "std.return" => {
            let value = if args.is_empty() {
                "nil".to_string()
            } else {
                compile_value(&args[0], false)?
            };
            format!("return {}", value)
        }

        "std.apply" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let func = compile_value(&args[0], false)?;
            let call_args: Result<Vec<_>, _> =
                args[1..].iter().map(|a| compile_value(a, false)).collect();
            format!("{}({})({})", prefix, func, call_args?.join(", "))
        }

        "std.lambda" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let params = args[0].as_list().ok_or_else(|| {
                CompileError::InvalidArgument("lambda params must be list".into())
            })?;
            let param_names: Result<Vec<_>, _> = params
                .iter()
                .map(|p| {
                    p.as_str()
                        .map(to_lua_name)
                        .ok_or_else(|| CompileError::InvalidArgument("param must be string".into()))
                })
                .collect();
            let body = compile_value(&args[1], true)?;
            format!(
                "{}function({})\n{}\nend",
                prefix,
                param_names?.join(", "),
                body
            )
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
            sexpr_to_lua_table(&args[0], prefix)?
        }

        "std.typeof" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let value = compile_value(&args[0], false)?;
            // Map Lua types to JS-like types: table -> "object"/"array", function -> "function", etc.
            // Check for null sentinel (userdata) and use __is_array helper function set up in runtime
            format!(
                "{}(function(v) if v == null then return 'null' end; local t = type(v); if t == 'table' then return __is_array(v) and 'array' or 'object' elseif t == 'nil' then return 'null' else return t end end)({})",
                prefix, value
            )
        }

        "std.string" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let value = compile_value(&args[0], false)?;
            // Convert to string (like JavaScript String() coercion)
            format!(
                "{}(function(v) if v == nil or v == null then return 'null' elseif type(v) == 'boolean' then return v and 'true' or 'false' else return tostring(v) end end)({})",
                prefix, value
            )
        }

        "std.number" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let value = compile_value(&args[0], false)?;
            // Convert to number (like JavaScript Number() coercion)
            format!("{}tonumber({})", prefix, value)
        }

        "std.boolean" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let value = compile_value(&args[0], false)?;
            // Convert to boolean - JS semantics: null/undefined are falsy, everything else is truthy
            // Note: In JS, 0, "", NaN are also falsy but in our VM we follow Lua's simpler model
            // where only nil/null are falsy (matching our guard operator semantics)
            format!(
                "{}(function(v) return v ~= nil and v ~= null end)({})",
                prefix, value
            )
        }

        "std.throw" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let message = compile_value(&args[0], false)?;
            // Use Lua's error() function
            format!("error({})", message)
        }

        "std.log" => {
            // Log to stdout (like console.log in JS)
            let values: Result<Vec<_>, _> = args.iter().map(|a| compile_value(a, false)).collect();
            format!("print({})", values?.join(", "))
        }

        "std.warn" => {
            // Log to stderr (like console.warn in JS)
            let values: Result<Vec<_>, _> = args.iter().map(|a| compile_value(a, false)).collect();
            format!(
                "io.stderr:write({} .. \"\\n\")",
                values?.join(" .. \" \" .. ")
            )
        }

        "std.try" => {
            // std.try takes a body and optional catch handler
            // Returns { ok: true, value } on success, { ok: false, error } on failure
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let body = compile_value(&args[0], true)?;
            let has_catch = args.len() > 1;
            if has_catch {
                let catch_handler = compile_value(&args[1], false)?;
                // Call catch handler with error if body fails
                format!(
                    "{}(function() local ok, result = pcall(function() {} end); if ok then return result else return ({})(result) end end)()",
                    prefix, body, catch_handler
                )
            } else {
                // Just return result or nil on error
                format!(
                    "{}(function() local ok, result = pcall(function() {} end); if ok then return result else return nil end end)()",
                    prefix, body
                )
            }
        }

        _ => return Ok(None),
    };

    Ok(Some(result))
}

#[cfg(test)]
mod tests {
    use super::super::compile;
    use lotus_ir::SExpr;

    #[test]
    fn test_let() {
        let expr = SExpr::call(
            "std.let",
            vec![
                SExpr::string("x").erase_type(),
                SExpr::number(10).erase_type(),
            ],
        );
        assert_eq!(compile(&expr).unwrap(), "local x = 10");
    }

    #[test]
    fn test_var() {
        let expr = SExpr::call("std.var", vec![SExpr::string("x").erase_type()]);
        assert_eq!(compile(&expr).unwrap(), "return x");
    }

    #[test]
    fn test_seq() {
        let expr = SExpr::call(
            "std.seq",
            vec![
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("x").erase_type(),
                        SExpr::number(10).erase_type(),
                    ],
                ),
                SExpr::call("std.var", vec![SExpr::string("x").erase_type()]),
            ],
        );
        let code = compile(&expr).unwrap();
        assert!(code.contains("local x = 10"));
        assert!(code.contains("return x"));
    }

    #[test]
    fn test_if() {
        let expr = SExpr::call(
            "std.if",
            vec![
                SExpr::bool(true).erase_type(),
                SExpr::number(1).erase_type(),
                SExpr::number(2).erase_type(),
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
    fn test_while() {
        let expr = SExpr::call(
            "std.while",
            vec![
                SExpr::bool(true).erase_type(),
                SExpr::call("std.break", vec![]),
            ],
        );
        let code = compile(&expr).unwrap();
        assert!(code.contains("while true do"));
        assert!(code.contains("break"));
        assert!(code.contains("end"));
    }

    #[test]
    fn test_for() {
        let expr = SExpr::call(
            "std.for",
            vec![
                SExpr::string("item").erase_type(),
                SExpr::call(
                    "list.new",
                    vec![SExpr::number(1).erase_type(), SExpr::number(2).erase_type()],
                ),
                SExpr::call("std.var", vec![SExpr::string("item").erase_type()]),
            ],
        );
        let code = compile(&expr).unwrap();
        assert!(code.contains("for _, item in ipairs"));
        assert!(code.contains("end"));
    }

    #[test]
    fn test_lambda() {
        let expr = SExpr::call(
            "std.lambda",
            vec![
                SExpr::list(vec![
                    SExpr::string("a").erase_type(),
                    SExpr::string("b").erase_type(),
                ])
                .erase_type(),
                SExpr::call(
                    "+",
                    vec![
                        SExpr::call("std.var", vec![SExpr::string("a").erase_type()]),
                        SExpr::call("std.var", vec![SExpr::string("b").erase_type()]),
                    ],
                ),
            ],
        );
        let code = compile(&expr).unwrap();
        assert!(code.contains("function(a, b)"));
        assert!(code.contains("return (a + b)"));
    }

    #[test]
    fn test_keyword_escaping() {
        let expr = SExpr::call(
            "std.let",
            vec![
                SExpr::string("end").erase_type(),
                SExpr::number(1).erase_type(),
            ],
        );
        assert_eq!(compile(&expr).unwrap(), "local _end = 1");

        let expr = SExpr::call(
            "std.let",
            vec![
                SExpr::string("local").erase_type(),
                SExpr::number(2).erase_type(),
            ],
        );
        assert_eq!(compile(&expr).unwrap(), "local _local = 2");
    }

    #[test]
    fn test_apply() {
        // Apply lambda directly: (x => x + 1)(5)
        let lambda = SExpr::call(
            "std.lambda",
            vec![
                SExpr::list(vec![SExpr::string("x").erase_type()]).erase_type(),
                SExpr::call(
                    "+",
                    vec![
                        SExpr::call("std.var", vec![SExpr::string("x").erase_type()]),
                        SExpr::number(1).erase_type(),
                    ],
                ),
            ],
        );
        let expr = SExpr::call("std.apply", vec![lambda, SExpr::number(5).erase_type()]);
        let code = compile(&expr).unwrap();
        assert!(code.contains("(function(x)"));
        assert!(code.contains(")(5)"));
    }

    #[test]
    fn test_apply_var() {
        // Apply a variable containing a lambda: f(5)
        let expr = SExpr::call(
            "std.apply",
            vec![
                SExpr::call("std.var", vec![SExpr::string("f").erase_type()]),
                SExpr::number(5).erase_type(),
            ],
        );
        assert_eq!(compile(&expr).unwrap(), "return (f)(5)");
    }
}
