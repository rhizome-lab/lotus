//! bool.* opcode compilation.

use super::{CompileError, compile_infix_op, compile_value};
use lotus_ir::SExpr;

/// Compile bool.* opcodes. Returns None if opcode doesn't match.
pub fn compile_bool(
    op: &str,
    args: &[SExpr],
    prefix: &str,
) -> Result<Option<String>, CompileError> {
    let result = match op {
        // Comparison operators
        "==" | "bool.eq" => compile_infix_op("==", args, prefix)?,
        "!=" | "bool.neq" => compile_infix_op("~=", args, prefix)?,
        "<" | "bool.lt" => compile_infix_op("<", args, prefix)?,
        "<=" | "bool.lte" => compile_infix_op("<=", args, prefix)?,
        ">" | "bool.gt" => compile_infix_op(">", args, prefix)?,
        ">=" | "bool.gte" => compile_infix_op(">=", args, prefix)?,

        // Logical operators
        "&&" | "bool.and" => compile_infix_op("and", args, prefix)?,
        "||" | "bool.or" => compile_infix_op("or", args, prefix)?,

        // Nullish coalescing: returns left if not nil/null, else right
        "??" | "bool.nullish" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let left = compile_value(&args[0], false)?;
            let right = compile_value(&args[1], false)?;
            // Check for both nil (Lua) and null (our JSON sentinel)
            format!(
                "{}(function(l, r) if l ~= nil and l ~= null then return l else return r end end)({}, {})",
                prefix, left, right
            )
        }

        // Guard: like && but only null/undefined are falsy (not false)
        // Differs from Lua's `and` which treats false as falsy
        // Returns right if left is NOT nullish, else returns left (short-circuits)
        "bool.guard" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let left = compile_value(&args[0], false)?;
            let right = compile_value(&args[1], false)?;
            // If left is nullish, return right (the default), else return left
            format!(
                "{}(function(l, r) if l == nil or l == null then return r else return l end end)({}, {})",
                prefix, left, right
            )
        }

        "!" | "bool.not" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let arg = compile_value(&args[0], false)?;
            format!("{}not {}", prefix, arg)
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
    fn test_eq() {
        let expr = SExpr::call(
            "==",
            vec![SExpr::number(1).erase_type(), SExpr::number(1).erase_type()],
        );
        assert_eq!(compile(&expr).unwrap(), "return (1 == 1)");
    }

    #[test]
    fn test_neq() {
        let expr = SExpr::call(
            "!=",
            vec![SExpr::number(1).erase_type(), SExpr::number(2).erase_type()],
        );
        assert_eq!(compile(&expr).unwrap(), "return (1 ~= 2)");
    }

    #[test]
    fn test_and() {
        let expr = SExpr::call(
            "&&",
            vec![
                SExpr::bool(true).erase_type(),
                SExpr::bool(false).erase_type(),
            ],
        );
        assert_eq!(compile(&expr).unwrap(), "return (true and false)");
    }

    #[test]
    fn test_or() {
        let expr = SExpr::call(
            "||",
            vec![
                SExpr::bool(true).erase_type(),
                SExpr::bool(false).erase_type(),
            ],
        );
        assert_eq!(compile(&expr).unwrap(), "return (true or false)");
    }

    #[test]
    fn test_not() {
        let expr = SExpr::call("!", vec![SExpr::bool(true).erase_type()]);
        assert_eq!(compile(&expr).unwrap(), "return not true");
    }

    #[test]
    fn test_comparisons() {
        let expr = SExpr::call(
            "<",
            vec![SExpr::number(1).erase_type(), SExpr::number(2).erase_type()],
        );
        assert_eq!(compile(&expr).unwrap(), "return (1 < 2)");

        let expr = SExpr::call(
            "<=",
            vec![SExpr::number(1).erase_type(), SExpr::number(2).erase_type()],
        );
        assert_eq!(compile(&expr).unwrap(), "return (1 <= 2)");

        let expr = SExpr::call(
            ">",
            vec![SExpr::number(2).erase_type(), SExpr::number(1).erase_type()],
        );
        assert_eq!(compile(&expr).unwrap(), "return (2 > 1)");

        let expr = SExpr::call(
            ">=",
            vec![SExpr::number(2).erase_type(), SExpr::number(1).erase_type()],
        );
        assert_eq!(compile(&expr).unwrap(), "return (2 >= 1)");
    }

    #[test]
    fn test_nullish() {
        let expr = SExpr::call(
            "??",
            vec![SExpr::number(1).erase_type(), SExpr::number(2).erase_type()],
        );
        let code = compile(&expr).unwrap();
        assert!(code.contains("l ~= nil and l ~= null"));
    }

    #[test]
    fn test_guard() {
        let expr = SExpr::call(
            "bool.guard",
            vec![SExpr::number(1).erase_type(), SExpr::number(2).erase_type()],
        );
        let code = compile(&expr).unwrap();
        assert!(code.contains("l == nil or l == null"));
    }
}
