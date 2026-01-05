//! Procgen library compilation (procedural generation).

use crate::codegen::{compile_value, CompileError};
use viwo_ir::SExpr;

pub fn compile_procgen(op: &str, args: &[SExpr], prefix: &str) -> Result<Option<String>, CompileError> {
    let result = match op {
        "procgen.seed" => {
            if args.len() != 1 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: args.len(),
                });
            }
            let seed = compile_value(&args[0], false)?;
            format!("{}__viwo_procgen_seed({})", prefix, seed)
        }

        "procgen.noise" => {
            if args.len() != 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let x = compile_value(&args[0], false)?;
            let y = compile_value(&args[1], false)?;
            format!("{}__viwo_procgen_noise({}, {})", prefix, x, y)
        }

        "procgen.random" => {
            if args.is_empty() {
                // random() - no args
                format!("{}__viwo_procgen_random()", prefix)
            } else if args.len() == 1 {
                // random(max) - use random_range(0, max)
                let max = compile_value(&args[0], false)?;
                format!("{}__viwo_procgen_random_range(0, {})", prefix, max)
            } else if args.len() == 2 {
                // random(min, max)
                let min = compile_value(&args[0], false)?;
                let max = compile_value(&args[1], false)?;
                format!("{}__viwo_procgen_random_range({}, {})", prefix, min, max)
            } else {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
        }

        "procgen.between" => {
            if args.len() != 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let min = compile_value(&args[0], false)?;
            let max = compile_value(&args[1], false)?;
            format!("{}__viwo_procgen_between({}, {})", prefix, min, max)
        }

        _ => return Ok(None),
    };

    Ok(Some(result))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compile;
    use viwo_ir::SExpr;

    #[test]
    fn test_procgen_seed() {
        let expr = SExpr::call("procgen.seed", vec![SExpr::number(42).erase_type()]);
        let lua = compile(&expr).unwrap();
        assert_eq!(lua, "return __viwo_procgen_seed(42)");
    }

    #[test]
    fn test_procgen_noise() {
        let expr = SExpr::call("procgen.noise", vec![SExpr::number(1.0).erase_type(), SExpr::number(2.0).erase_type()]);
        let lua = compile(&expr).unwrap();
        assert_eq!(lua, "return __viwo_procgen_noise(1, 2)");
    }

    #[test]
    fn test_procgen_random() {
        let expr = SExpr::call("procgen.random", vec![]);
        let lua = compile(&expr).unwrap();
        assert_eq!(lua, "return __viwo_procgen_random()");
    }

    #[test]
    fn test_procgen_random_range() {
        let expr = SExpr::call("procgen.random", vec![SExpr::number(0).erase_type(), SExpr::number(10).erase_type()]);
        let lua = compile(&expr).unwrap();
        assert_eq!(lua, "return __viwo_procgen_random_range(0, 10)");
    }

    #[test]
    fn test_procgen_between() {
        let expr = SExpr::call("procgen.between", vec![SExpr::number(1).erase_type(), SExpr::number(10).erase_type()]);
        let lua = compile(&expr).unwrap();
        assert_eq!(lua, "return __viwo_procgen_between(1, 10)");
    }
}
