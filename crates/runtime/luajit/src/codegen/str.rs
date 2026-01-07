//! str.* opcode compilation.

use super::{CompileError, compile_value};
use viwo_ir::SExpr;

/// Compile str.* opcodes. Returns None if opcode doesn't match.
pub fn compile_str(op: &str, args: &[SExpr], prefix: &str) -> Result<Option<String>, CompileError> {
    let result = match op {
        "str.concat" => {
            let compiled: Result<Vec<_>, _> =
                args.iter().map(|a| compile_value(a, false)).collect();
            format!("{}{}", prefix, compiled?.join(" .. "))
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
            format!("{}#{}", prefix, arg)
        }

        "str.lower" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let arg = compile_value(&args[0], false)?;
            format!("{}string.lower({})", prefix, arg)
        }

        "str.upper" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let arg = compile_value(&args[0], false)?;
            format!("{}string.upper({})", prefix, arg)
        }

        "str.sub" => {
            if args.len() < 3 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 3,
                    got: args.len(),
                });
            }
            let str_arg = compile_value(&args[0], false)?;
            let start = compile_value(&args[1], false)?;
            let end = compile_value(&args[2], false)?;
            // Lua string.sub is 1-indexed, adjust from 0-indexed
            format!("{}string.sub({}, {} + 1, {})", prefix, str_arg, start, end)
        }

        "str.split" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let str_arg = compile_value(&args[0], false)?;
            let sep = compile_value(&args[1], false)?;
            // Lua doesn't have built-in split, need helper function
            format!(
                "{}(function(s, sep) local t = {{}}; for m in string.gmatch(s, \"([^\"..sep..\"]+)\") do t[#t+1] = m end; return setmetatable(t, __array_mt) end)({}, {})",
                prefix, str_arg, sep
            )
        }

        "str.trim" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let arg = compile_value(&args[0], false)?;
            format!("{}string.match({}, \"^%s*(.-)%s*$\")", prefix, arg)
        }

        "str.indexOf" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let str_arg = compile_value(&args[0], false)?;
            let substr = compile_value(&args[1], false)?;
            // string.find returns 1-indexed, convert to 0-indexed (-1 if not found)
            format!(
                "{}(function(s, p) local i = string.find(s, p, 1, true); return i and (i - 1) or -1 end)({}, {})",
                prefix, str_arg, substr
            )
        }

        "str.includes" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let str_arg = compile_value(&args[0], false)?;
            let substr = compile_value(&args[1], false)?;
            format!(
                "{}(string.find({}, {}, 1, true) ~= nil)",
                prefix, str_arg, substr
            )
        }

        "str.replace" => {
            if args.len() < 3 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 3,
                    got: args.len(),
                });
            }
            let str_arg = compile_value(&args[0], false)?;
            let pattern = compile_value(&args[1], false)?;
            let replacement = compile_value(&args[2], false)?;
            // gsub replaces all, but we use 1 to replace first only (like JS)
            format!(
                "{}(string.gsub({}, {}, {}, 1))",
                prefix, str_arg, pattern, replacement
            )
        }

        "str.slice" => {
            // str.slice(str, start) or str.slice(str, start, end)
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: 0,
                });
            }
            let str_arg = compile_value(&args[0], false)?;
            if args.len() == 2 {
                let start = compile_value(&args[1], false)?;
                // Lua string.sub is 1-indexed
                format!("{}string.sub({}, {} + 1)", prefix, str_arg, start)
            } else {
                let start = compile_value(&args[1], false)?;
                let end = compile_value(&args[2], false)?;
                format!("{}string.sub({}, {} + 1, {})", prefix, str_arg, start, end)
            }
        }

        "str.join" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let list = compile_value(&args[0], false)?;
            let sep = compile_value(&args[1], false)?;
            format!("{}table.concat({}, {})", prefix, list, sep)
        }

        "str.startsWith" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let str_arg = compile_value(&args[0], false)?;
            let prefix_str = compile_value(&args[1], false)?;
            format!(
                "{}(string.sub({}, 1, #({})) == {})",
                prefix, str_arg, prefix_str, prefix_str
            )
        }

        "str.endsWith" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let str_arg = compile_value(&args[0], false)?;
            let suffix = compile_value(&args[1], false)?;
            format!(
                "{}(string.sub({}, -#({})) == {})",
                prefix, str_arg, suffix, suffix
            )
        }

        "str.repeat" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let str_arg = compile_value(&args[0], false)?;
            let count = compile_value(&args[1], false)?;
            format!("{}string.rep({}, {})", prefix, str_arg, count)
        }

        _ => return Ok(None),
    };

    Ok(Some(result))
}

#[cfg(test)]
mod tests {
    use super::super::compile;
    use viwo_ir::SExpr;

    #[test]
    fn test_concat() {
        let expr = SExpr::call(
            "str.concat",
            vec![
                SExpr::string("hello").erase_type(),
                SExpr::string(" ").erase_type(),
                SExpr::string("world").erase_type(),
            ],
        );
        assert_eq!(
            compile(&expr).unwrap(),
            "return \"hello\" .. \" \" .. \"world\""
        );
    }

    #[test]
    fn test_len() {
        let expr = SExpr::call("str.len", vec![SExpr::string("test").erase_type()]);
        assert_eq!(compile(&expr).unwrap(), "return #\"test\"");
    }

    #[test]
    fn test_lower() {
        let expr = SExpr::call("str.lower", vec![SExpr::string("HELLO").erase_type()]);
        assert_eq!(compile(&expr).unwrap(), "return string.lower(\"HELLO\")");
    }

    #[test]
    fn test_upper() {
        let expr = SExpr::call("str.upper", vec![SExpr::string("hello").erase_type()]);
        assert_eq!(compile(&expr).unwrap(), "return string.upper(\"hello\")");
    }

    #[test]
    fn test_trim() {
        let expr = SExpr::call("str.trim", vec![SExpr::string("  hi  ").erase_type()]);
        assert!(compile(&expr).unwrap().contains("string.match"));
    }
}
