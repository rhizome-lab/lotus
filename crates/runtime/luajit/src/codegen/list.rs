//! list.* opcode compilation.

use super::{CompileError, compile_value};
use viwo_ir::SExpr;

/// Compile list.* opcodes. Returns None if opcode doesn't match.
pub fn compile_list(
    op: &str,
    args: &[SExpr],
    prefix: &str,
) -> Result<Option<String>, CompileError> {
    let result = match op {
        "list.new" => {
            if args.is_empty() {
                // Empty array needs metatable to serialize as [] not {}
                format!("{}setmetatable({{}}, __array_mt)", prefix)
            } else {
                let elements: Result<Vec<_>, _> =
                    args.iter().map(|a| compile_value(a, false)).collect();
                format!(
                    "{}setmetatable({{ {} }}, __array_mt)",
                    prefix,
                    elements?.join(", ")
                )
            }
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
            format!("{}#{}", prefix, arg)
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
            // Support optional third argument as default value
            if args.len() >= 3 {
                let default = compile_value(&args[2], false)?;
                // Lua is 1-indexed, so add 1 to the index
                // Use `~= nil and ... or default` pattern for safe default
                format!(
                    "{}({}[{} + 1] ~= nil and {}[{} + 1] or {})",
                    prefix, list, index, list, index, default
                )
            } else {
                // Lua is 1-indexed, so add 1 to the index
                format!("{}{}[{} + 1]", prefix, list, index)
            }
        }

        "list.set" => {
            if args.len() < 3 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 3,
                    got: args.len(),
                });
            }
            let list = compile_value(&args[0], false)?;
            let index = compile_value(&args[1], false)?;
            let value = compile_value(&args[2], false)?;
            // Lua is 1-indexed
            format!("{}[{} + 1] = {}", list, index, value)
        }

        "list.push" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let list = compile_value(&args[0], false)?;
            let value = compile_value(&args[1], false)?;
            format!("{}table.insert({}, {})", prefix, list, value)
        }

        "list.pop" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let list = compile_value(&args[0], false)?;
            format!("{}table.remove({})", prefix, list)
        }

        "list.map" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let list = compile_value(&args[0], false)?;
            let func = compile_value(&args[1], false)?;
            format!(
                "{}(function(arr, fn) local r = {{}}; for i, v in ipairs(arr) do r[i] = fn(v, i - 1) end; return setmetatable(r, __array_mt) end)({}, {})",
                prefix, list, func
            )
        }

        "list.filter" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let list = compile_value(&args[0], false)?;
            let func = compile_value(&args[1], false)?;
            format!(
                "{}(function(arr, fn) local r = {{}}; for i, v in ipairs(arr) do if fn(v, i - 1) then r[#r+1] = v end end; return setmetatable(r, __array_mt) end)({}, {})",
                prefix, list, func
            )
        }

        "list.reduce" => {
            if args.len() < 3 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 3,
                    got: args.len(),
                });
            }
            let list = compile_value(&args[0], false)?;
            let func = compile_value(&args[1], false)?;
            let init = compile_value(&args[2], false)?;
            format!(
                "{}(function(arr, fn, acc) for i, v in ipairs(arr) do acc = fn(acc, v, i - 1) end; return acc end)({}, {}, {})",
                prefix, list, func, init
            )
        }

        "list.find" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let list = compile_value(&args[0], false)?;
            let func = compile_value(&args[1], false)?;
            format!(
                "{}(function(arr, fn) for i, v in ipairs(arr) do if fn(v, i - 1) then return v end end; return nil end)({}, {})",
                prefix, list, func
            )
        }

        "list.concat" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let list1 = compile_value(&args[0], false)?;
            let list2 = compile_value(&args[1], false)?;
            format!(
                "{}(function(a, b) local r = {{}}; for _, v in ipairs(a) do r[#r+1] = v end; for _, v in ipairs(b) do r[#r+1] = v end; return setmetatable(r, __array_mt) end)({}, {})",
                prefix, list1, list2
            )
        }

        "list.slice" => {
            if args.len() < 3 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 3,
                    got: args.len(),
                });
            }
            let list = compile_value(&args[0], false)?;
            let start = compile_value(&args[1], false)?;
            let end = compile_value(&args[2], false)?;
            format!(
                "{}(function(arr, s, e) local r = {{}}; for i = s + 1, e do r[#r+1] = arr[i] end; return setmetatable(r, __array_mt) end)({}, {}, {})",
                prefix, list, start, end
            )
        }

        "list.empty" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let list = compile_value(&args[0], false)?;
            format!("{}(#{} == 0)", prefix, list)
        }

        "list.unshift" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let list = compile_value(&args[0], false)?;
            let value = compile_value(&args[1], false)?;
            // table.insert with position 1 adds to front
            format!("{}table.insert({}, 1, {})", prefix, list, value)
        }

        "list.shift" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let list = compile_value(&args[0], false)?;
            // table.remove with position 1 removes from front
            format!("{}table.remove({}, 1)", prefix, list)
        }

        "list.includes" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let list = compile_value(&args[0], false)?;
            let value = compile_value(&args[1], false)?;
            format!(
                "{}(function(arr, val) for _, v in ipairs(arr) do if v == val then return true end end; return false end)({}, {})",
                prefix, list, value
            )
        }

        "list.indexOf" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let list = compile_value(&args[0], false)?;
            let value = compile_value(&args[1], false)?;
            format!(
                "{}(function(arr, val) for i, v in ipairs(arr) do if v == val then return i - 1 end end; return -1 end)({}, {})",
                prefix, list, value
            )
        }

        "list.reverse" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let list = compile_value(&args[0], false)?;
            // Mutates in place and returns the array
            format!(
                "{}(function(arr) local n = #arr; for i = 1, math.floor(n/2) do arr[i], arr[n-i+1] = arr[n-i+1], arr[i] end; return arr end)({})",
                prefix, list
            )
        }

        "list.sort" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let list = compile_value(&args[0], false)?;
            // table.sort mutates in place, return the array
            format!(
                "{}(function(arr) table.sort(arr); return arr end)({})",
                prefix, list
            )
        }

        "list.join" => {
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

        "list.splice" => {
            // list.splice(arr, start, deleteCount, ...items)
            if args.len() < 3 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 3,
                    got: args.len(),
                });
            }
            let list = compile_value(&args[0], false)?;
            let start = compile_value(&args[1], false)?;
            let delete_count = compile_value(&args[2], false)?;
            let items: Result<Vec<_>, _> =
                args[3..].iter().map(|a| compile_value(a, false)).collect();
            let items_str = items?.join(", ");
            // Returns removed elements, modifies array in place
            format!(
                "{}(function(arr, s, d, ...) local r = {{}}; local items = {{...}}; s = s + 1; for i = 1, d do if arr[s] then r[#r+1] = table.remove(arr, s) end end; for i = #items, 1, -1 do table.insert(arr, s, items[i]) end; return setmetatable(r, __array_mt) end)({}, {}, {}{})",
                prefix,
                list,
                start,
                delete_count,
                if items_str.is_empty() {
                    String::new()
                } else {
                    format!(", {}", items_str)
                }
            )
        }

        "list.flatMap" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let list = compile_value(&args[0], false)?;
            let func = compile_value(&args[1], false)?;
            format!(
                "{}(function(arr, fn) local r = {{}}; for i, v in ipairs(arr) do local res = fn(v, i - 1); if type(res) == 'table' then for _, item in ipairs(res) do r[#r+1] = item end else r[#r+1] = res end end; return setmetatable(r, __array_mt) end)({}, {})",
                prefix, list, func
            )
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
    fn test_new() {
        let expr = SExpr::call(
            "list.new",
            vec![
                SExpr::number(1).erase_type(),
                SExpr::number(2).erase_type(),
                SExpr::number(3).erase_type(),
            ],
        );
        assert_eq!(
            compile(&expr).unwrap(),
            "return setmetatable({ 1, 2, 3 }, __array_mt)"
        );
    }

    #[test]
    fn test_new_empty() {
        let expr = SExpr::call("list.new", vec![]);
        assert_eq!(
            compile(&expr).unwrap(),
            "return setmetatable({}, __array_mt)"
        );
    }

    #[test]
    fn test_get() {
        let expr = SExpr::call(
            "list.get",
            vec![
                SExpr::call(
                    "list.new",
                    vec![
                        SExpr::number(10).erase_type(),
                        SExpr::number(20).erase_type(),
                    ],
                ),
                SExpr::number(0).erase_type(),
            ],
        );
        // Lua is 1-indexed, so we add 1
        assert!(compile(&expr).unwrap().contains("[0 + 1]"));
    }

    #[test]
    fn test_get_with_default() {
        let expr = SExpr::call(
            "list.get",
            vec![
                SExpr::call("std.var", vec![SExpr::string("arr").erase_type()]),
                SExpr::number(5).erase_type(),
                SExpr::string("missing").erase_type(),
            ],
        );
        // Should use nil check with default value
        let code = compile(&expr).unwrap();
        assert!(code.contains("[5 + 1] ~= nil"));
        assert!(code.contains("\"missing\""));
    }

    #[test]
    fn test_len() {
        let expr = SExpr::call(
            "list.len",
            vec![SExpr::call(
                "list.new",
                vec![SExpr::number(1).erase_type(), SExpr::number(2).erase_type()],
            )],
        );
        assert!(compile(&expr).unwrap().starts_with("return #"));
    }

    #[test]
    fn test_push() {
        let expr = SExpr::call(
            "list.push",
            vec![
                SExpr::call("std.var", vec![SExpr::string("arr").erase_type()]),
                SExpr::number(5).erase_type(),
            ],
        );
        assert!(compile(&expr).unwrap().contains("table.insert"));
    }
}
