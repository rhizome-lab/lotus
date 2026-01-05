//! math.* opcode compilation.

use super::{compile_infix_op, compile_value, CompileError};
use viwo_ir::SExpr;

/// Compile math.* opcodes. Returns None if opcode doesn't match.
pub fn compile_math(
    op: &str,
    args: &[SExpr],
    prefix: &str,
) -> Result<Option<String>, CompileError> {
    let result = match op {
        // Arithmetic operators
        "+" | "math.add" => compile_infix_op("+", args, prefix)?,
        "-" | "math.sub" => compile_infix_op("-", args, prefix)?,
        "*" | "math.mul" => compile_infix_op("*", args, prefix)?,
        "/" | "math.div" => compile_infix_op("/", args, prefix)?,
        "%" | "math.mod" => compile_infix_op("%", args, prefix)?,
        "^" | "math.pow" => compile_infix_op("^", args, prefix)?,

        "math.neg" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let arg = compile_value(&args[0], false)?;
            // Wrap in parens to handle negative numbers: -((-3)) not (--3)
            format!("{}(-({}))", prefix, arg)
        }

        "math.abs" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let arg = compile_value(&args[0], false)?;
            format!("{}math.abs({})", prefix, arg)
        }

        "math.floor" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let arg = compile_value(&args[0], false)?;
            format!("{}math.floor({})", prefix, arg)
        }

        "math.ceil" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let arg = compile_value(&args[0], false)?;
            format!("{}math.ceil({})", prefix, arg)
        }

        "math.sqrt" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let arg = compile_value(&args[0], false)?;
            format!("{}math.sqrt({})", prefix, arg)
        }

        "math.min" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let compiled: Result<Vec<_>, _> =
                args.iter().map(|a| compile_value(a, false)).collect();
            format!("{}math.min({})", prefix, compiled?.join(", "))
        }

        "math.max" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let compiled: Result<Vec<_>, _> =
                args.iter().map(|a| compile_value(a, false)).collect();
            format!("{}math.max({})", prefix, compiled?.join(", "))
        }

        // Rounding
        "math.trunc" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let arg = compile_value(&args[0], false)?;
            // math.modf returns integer part first
            format!("{}(math.modf({}))", prefix, arg)
        }

        "math.round" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let arg = compile_value(&args[0], false)?;
            format!("{}math.floor({} + 0.5)", prefix, arg)
        }

        // Trigonometry
        "math.sin" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let arg = compile_value(&args[0], false)?;
            format!("{}math.sin({})", prefix, arg)
        }

        "math.cos" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let arg = compile_value(&args[0], false)?;
            format!("{}math.cos({})", prefix, arg)
        }

        "math.tan" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let arg = compile_value(&args[0], false)?;
            format!("{}math.tan({})", prefix, arg)
        }

        "math.asin" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let arg = compile_value(&args[0], false)?;
            format!("{}math.asin({})", prefix, arg)
        }

        "math.acos" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let arg = compile_value(&args[0], false)?;
            format!("{}math.acos({})", prefix, arg)
        }

        "math.atan" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let arg = compile_value(&args[0], false)?;
            format!("{}math.atan({})", prefix, arg)
        }

        "math.atan2" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let y = compile_value(&args[0], false)?;
            let x = compile_value(&args[1], false)?;
            format!("{}math.atan2({}, {})", prefix, y, x)
        }

        // Logarithms and exponentials
        "math.log" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let arg = compile_value(&args[0], false)?;
            format!("{}math.log({})", prefix, arg)
        }

        "math.log2" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let arg = compile_value(&args[0], false)?;
            // log2(x) = log(x) / log(2)
            format!("{}(math.log({}) / math.log(2))", prefix, arg)
        }

        "math.log10" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let arg = compile_value(&args[0], false)?;
            format!("{}math.log10({})", prefix, arg)
        }

        "math.exp" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let arg = compile_value(&args[0], false)?;
            format!("{}math.exp({})", prefix, arg)
        }

        // Utilities
        "math.clamp" => {
            if args.len() < 3 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 3,
                    got: args.len(),
                });
            }
            let val = compile_value(&args[0], false)?;
            let min_val = compile_value(&args[1], false)?;
            let max_val = compile_value(&args[2], false)?;
            format!(
                "{}math.min(math.max({}, {}), {})",
                prefix, val, min_val, max_val
            )
        }

        "math.sign" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let arg = compile_value(&args[0], false)?;
            format!(
                "{}(function(x) return x > 0 and 1 or (x < 0 and -1 or 0) end)({})",
                prefix, arg
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
    fn test_add() {
        let expr = SExpr::call("+", vec![SExpr::number(1).erase_type(), SExpr::number(2).erase_type()]);
        assert_eq!(compile(&expr).unwrap(), "return (1 + 2)");
    }

    #[test]
    fn test_mul() {
        let expr = SExpr::call("*", vec![SExpr::number(3).erase_type(), SExpr::number(4).erase_type()]);
        assert_eq!(compile(&expr).unwrap(), "return (3 * 4)");
    }

    #[test]
    fn test_neg() {
        let expr = SExpr::call("math.neg", vec![SExpr::number(5).erase_type()]);
        assert_eq!(compile(&expr).unwrap(), "return (-(5))");
    }

    #[test]
    fn test_abs() {
        let expr = SExpr::call("math.abs", vec![SExpr::number(-5).erase_type()]);
        assert_eq!(compile(&expr).unwrap(), "return math.abs(-5)");
    }

    #[test]
    fn test_floor() {
        let expr = SExpr::call("math.floor", vec![SExpr::number(3.7).erase_type()]);
        assert_eq!(compile(&expr).unwrap(), "return math.floor(3.7)");
    }

    #[test]
    fn test_ceil() {
        let expr = SExpr::call("math.ceil", vec![SExpr::number(3.2).erase_type()]);
        assert_eq!(compile(&expr).unwrap(), "return math.ceil(3.2)");
    }

    #[test]
    fn test_sqrt() {
        let expr = SExpr::call("math.sqrt", vec![SExpr::number(9).erase_type()]);
        assert_eq!(compile(&expr).unwrap(), "return math.sqrt(9)");
    }

    #[test]
    fn test_min_max() {
        let expr = SExpr::call("math.min", vec![SExpr::number(1).erase_type(), SExpr::number(2).erase_type()]);
        assert_eq!(compile(&expr).unwrap(), "return math.min(1, 2)");

        let expr = SExpr::call("math.max", vec![SExpr::number(1).erase_type(), SExpr::number(2).erase_type()]);
        assert_eq!(compile(&expr).unwrap(), "return math.max(1, 2)");
    }

    #[test]
    fn test_trunc() {
        let expr = SExpr::call("math.trunc", vec![SExpr::number(1.7).erase_type()]);
        assert!(compile(&expr).unwrap().contains("math.modf"));
    }

    #[test]
    fn test_round() {
        let expr = SExpr::call("math.round", vec![SExpr::number(1.5).erase_type()]);
        assert!(compile(&expr).unwrap().contains("+ 0.5"));
    }

    #[test]
    fn test_trig() {
        let expr = SExpr::call("math.sin", vec![SExpr::number(0).erase_type()]);
        assert_eq!(compile(&expr).unwrap(), "return math.sin(0)");

        let expr = SExpr::call("math.cos", vec![SExpr::number(0).erase_type()]);
        assert_eq!(compile(&expr).unwrap(), "return math.cos(0)");
    }

    #[test]
    fn test_log_exp() {
        let expr = SExpr::call("math.log", vec![SExpr::number(1).erase_type()]);
        assert_eq!(compile(&expr).unwrap(), "return math.log(1)");

        let expr = SExpr::call("math.exp", vec![SExpr::number(0).erase_type()]);
        assert_eq!(compile(&expr).unwrap(), "return math.exp(0)");
    }

    #[test]
    fn test_clamp() {
        let expr = SExpr::call(
            "math.clamp",
            vec![SExpr::number(5).erase_type(), SExpr::number(0).erase_type(), SExpr::number(10).erase_type()],
        );
        assert!(compile(&expr).unwrap().contains("math.min(math.max"));
    }

    #[test]
    fn test_sign() {
        let expr = SExpr::call("math.sign", vec![SExpr::number(5).erase_type()]);
        assert!(compile(&expr).unwrap().contains("x > 0"));
    }
}
