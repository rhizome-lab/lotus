//! json.* opcode compilation.

use super::{compile_value, CompileError};
use viwo_ir::SExpr;

/// Compile json.* opcodes. Returns None if opcode doesn't match.
pub fn compile_json(
    op: &str,
    args: &[SExpr],
    prefix: &str,
) -> Result<Option<String>, CompileError> {
    let result = match op {
        "json.stringify" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let value = compile_value(&args[0], false)?;
            format!("{}json.encode({})", prefix, value)
        }

        "json.parse" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let value = compile_value(&args[0], false)?;
            format!("{}json.decode({})", prefix, value)
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
    fn test_stringify() {
        let expr = SExpr::call(
            "json.stringify",
            vec![SExpr::call(
                "obj.new",
                vec![SExpr::list(vec![SExpr::string("a").erase_type(), SExpr::number(1).erase_type()]).erase_type()],
            )],
        );
        let code = compile(&expr).unwrap();
        assert!(code.contains("json.encode"));
    }

    #[test]
    fn test_parse() {
        let expr = SExpr::call("json.parse", vec![SExpr::string(r#"{"a":1}"#).erase_type()]);
        let code = compile(&expr).unwrap();
        assert!(code.contains("json.decode"));
    }
}
