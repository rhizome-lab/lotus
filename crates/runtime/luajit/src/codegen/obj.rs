//! obj.* opcode compilation.

use super::{CompileError, compile_value};
use rhizome_lotus_ir::SExpr;

/// Compile obj.* opcodes. Returns None if opcode doesn't match.
pub fn compile_obj(op: &str, args: &[SExpr], prefix: &str) -> Result<Option<String>, CompileError> {
    let result = match op {
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
            // Support optional third argument as default value
            if args.len() >= 3 {
                let default = compile_value(&args[2], false)?;
                // Use Lua's `or` to provide default when key is missing (nil)
                format!(
                    "{}(({})[{}] ~= nil and ({})[{}] or {})",
                    prefix, obj, key, obj, key, default
                )
            } else {
                // Wrap obj in parens for inline table literals: ({...})["key"]
                format!("{}({})[{}]", prefix, obj, key)
            }
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
            format!("{}[{}] = {}", obj, key, value)
        }

        "obj.new" => {
            // obj.new accepts two formats:
            // 1. Pair lists: ["obj.new", [key1, val1], [key2, val2], ...]
            // 2. Flat pairs: ["obj.new", key1, val1, key2, val2, ...]
            let mut pairs = Vec::new();

            if args.is_empty() {
                // Empty object
            } else if args[0].as_list().is_some() {
                // Format 1: pair lists
                for arg in args {
                    let pair = arg.as_list().ok_or_else(|| {
                        CompileError::InvalidArgument("obj.new arg must be pair".into())
                    })?;
                    if pair.len() < 2 {
                        return Err(CompileError::InvalidArgument(
                            "obj.new pair must have key and value".into(),
                        ));
                    }
                    let key = compile_value(&pair[0], false)?;
                    let val = compile_value(&pair[1], false)?;
                    pairs.push(format!("[{}] = {}", key, val));
                }
            } else {
                // Format 2: flat alternating key-value pairs
                if args.len() % 2 != 0 {
                    return Err(CompileError::InvalidArgument(
                        "obj.new flat format requires even number of arguments".into(),
                    ));
                }
                for chunk in args.chunks(2) {
                    let key = compile_value(&chunk[0], false)?;
                    let val = compile_value(&chunk[1], false)?;
                    pairs.push(format!("[{}] = {}", key, val));
                }
            }
            format!("{}{{ {} }}", prefix, pairs.join(", "))
        }

        "obj.keys" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let obj = compile_value(&args[0], false)?;
            format!(
                "{}(function(o) local r = {{}}; for k in pairs(o) do r[#r+1] = k end; return setmetatable(r, __array_mt) end)({})",
                prefix, obj
            )
        }

        "obj.values" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let obj = compile_value(&args[0], false)?;
            format!(
                "{}(function(o) local r = {{}}; for _, v in pairs(o) do r[#r+1] = v end; return setmetatable(r, __array_mt) end)({})",
                prefix, obj
            )
        }

        "obj.has" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let obj = compile_value(&args[0], false)?;
            let key = compile_value(&args[1], false)?;
            // Wrap obj in parens for inline table literals
            format!("{}(({})[{}] ~= nil)", prefix, obj, key)
        }

        "obj.delete" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let obj = compile_value(&args[0], false)?;
            let key = compile_value(&args[1], false)?;
            format!("{}[{}] = nil", obj, key)
        }

        "obj.merge" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let obj1 = compile_value(&args[0], false)?;
            let obj2 = compile_value(&args[1], false)?;
            format!(
                "{}(function(a, b) local r = {{}}; for k, v in pairs(a) do r[k] = v end; for k, v in pairs(b) do r[k] = v end; return r end)({}, {})",
                prefix, obj1, obj2
            )
        }

        "obj.entries" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let obj = compile_value(&args[0], false)?;
            format!(
                "{}(function(o) local r = {{}}; for k, v in pairs(o) do r[#r+1] = setmetatable({{k, v}}, __array_mt) end; return setmetatable(r, __array_mt) end)({})",
                prefix, obj
            )
        }

        "obj.del" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let obj = compile_value(&args[0], false)?;
            let key = compile_value(&args[1], false)?;
            // Returns true if key existed, false otherwise
            format!(
                "{}(function(o, k) local had = o[k] ~= nil; o[k] = nil; return had end)({}, {})",
                prefix, obj, key
            )
        }

        "obj.map" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let obj = compile_value(&args[0], false)?;
            let func = compile_value(&args[1], false)?;
            // fn(value, key) -> new_value
            format!(
                "{}(function(o, fn) local r = {{}}; for k, v in pairs(o) do r[k] = fn(v, k) end; return r end)({}, {})",
                prefix, obj, func
            )
        }

        "obj.filter" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let obj = compile_value(&args[0], false)?;
            let func = compile_value(&args[1], false)?;
            // fn(value, key) -> boolean
            format!(
                "{}(function(o, fn) local r = {{}}; for k, v in pairs(o) do if fn(v, k) then r[k] = v end end; return r end)({}, {})",
                prefix, obj, func
            )
        }

        "obj.reduce" => {
            if args.len() < 3 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 3,
                    got: args.len(),
                });
            }
            let obj = compile_value(&args[0], false)?;
            let func = compile_value(&args[1], false)?;
            let init = compile_value(&args[2], false)?;
            // fn(acc, value, key) -> new_acc
            format!(
                "{}(function(o, fn, acc) for k, v in pairs(o) do acc = fn(acc, v, k) end; return acc end)({}, {}, {})",
                prefix, obj, func, init
            )
        }

        "obj.flatMap" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let obj = compile_value(&args[0], false)?;
            let func = compile_value(&args[1], false)?;
            // fn(value, key) -> object, results merged
            format!(
                "{}(function(o, fn) local r = {{}}; for k, v in pairs(o) do local res = fn(v, k); if type(res) == 'table' then for rk, rv in pairs(res) do r[rk] = rv end end end; return r end)({}, {})",
                prefix, obj, func
            )
        }

        _ => return Ok(None),
    };

    Ok(Some(result))
}

#[cfg(test)]
mod tests {
    use super::super::compile;
    use rhizome_lotus_ir::SExpr;

    #[test]
    fn test_get() {
        let expr = SExpr::call(
            "obj.get",
            vec![
                SExpr::call("std.var", vec![SExpr::string("o").erase_type()]),
                SExpr::string("key").erase_type(),
            ],
        );
        assert_eq!(compile(&expr).unwrap(), "return (o)[\"key\"]");
    }

    #[test]
    fn test_get_with_default() {
        let expr = SExpr::call(
            "obj.get",
            vec![
                SExpr::call("std.var", vec![SExpr::string("o").erase_type()]),
                SExpr::string("key").erase_type(),
                SExpr::string("default").erase_type(),
            ],
        );
        // Should use nil check with default value
        assert_eq!(
            compile(&expr).unwrap(),
            "return ((o)[\"key\"] ~= nil and (o)[\"key\"] or \"default\")"
        );
    }

    #[test]
    fn test_new() {
        let expr = SExpr::call(
            "obj.new",
            vec![
                SExpr::list(vec![
                    SExpr::string("a").erase_type(),
                    SExpr::number(1).erase_type(),
                ])
                .erase_type(),
                SExpr::list(vec![
                    SExpr::string("b").erase_type(),
                    SExpr::number(2).erase_type(),
                ])
                .erase_type(),
            ],
        );
        let code = compile(&expr).unwrap();
        assert!(code.contains("[\"a\"] = 1"));
        assert!(code.contains("[\"b\"] = 2"));
    }

    #[test]
    fn test_keys() {
        let expr = SExpr::call(
            "obj.keys",
            vec![SExpr::call(
                "std.var",
                vec![SExpr::string("o").erase_type()],
            )],
        );
        let code = compile(&expr).unwrap();
        assert!(code.contains("for k in pairs"));
    }

    #[test]
    fn test_values() {
        let expr = SExpr::call(
            "obj.values",
            vec![SExpr::call(
                "std.var",
                vec![SExpr::string("o").erase_type()],
            )],
        );
        let code = compile(&expr).unwrap();
        assert!(code.contains("for _, v in pairs"));
    }

    #[test]
    fn test_has() {
        let expr = SExpr::call(
            "obj.has",
            vec![
                SExpr::call("std.var", vec![SExpr::string("o").erase_type()]),
                SExpr::string("key").erase_type(),
            ],
        );
        let code = compile(&expr).unwrap();
        assert!(code.contains("~= nil"));
    }
}
