//! Game world opcode compilation.
//!
//! These opcodes interact with the game world state (entities, verbs, etc).

use super::{compile_value, CompileError};
use viwo_ir::SExpr;

/// Compile game world opcodes. Returns None if opcode doesn't match.
pub fn compile_game(
    op: &str,
    args: &[SExpr],
    prefix: &str,
) -> Result<Option<String>, CompileError> {
    let result = match op {
        // Get entity by ID
        "entity" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let id = compile_value(&args[0], false)?;
            format!("{}__viwo_entity({})", prefix, id)
        }

        // Update entity properties
        "update" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let entity_id = compile_value(&args[0], false)?;
            let updates = compile_value(&args[1], false)?;
            format!("{}__viwo_update({}, {})", prefix, entity_id, updates)
        }

        // Create new entity
        "create" => {
            if args.is_empty() {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 1,
                    got: 0,
                });
            }
            let props = compile_value(&args[0], false)?;
            if args.len() > 1 {
                let prototype_id = compile_value(&args[1], false)?;
                format!("{}__viwo_create({}, {})", prefix, props, prototype_id)
            } else {
                format!("{}__viwo_create({}, nil)", prefix, props)
            }
        }

        // Call verb on entity
        "call" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let target = compile_value(&args[0], false)?;
            let verb = compile_value(&args[1], false)?;

            // Remaining args are passed to the verb
            let call_args: Result<Vec<_>, _> = args[2..].iter().map(|a| compile_value(a, false)).collect();
            let args_list = format!("{{ {} }}", call_args?.join(", "));

            format!("{}__viwo_call({}, {}, {})", prefix, target, verb, args_list)
        }

        // Schedule a verb call for future execution
        "schedule" => {
            if args.len() < 3 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 3,
                    got: args.len(),
                });
            }
            let verb = compile_value(&args[0], false)?;

            // Args can be either a list or individual arguments
            let args_list = if let Some(list) = args[1].as_list() {
                let call_args: Result<Vec<_>, _> = list.iter().map(|a| compile_value(a, false)).collect();
                format!("{{ {} }}", call_args?.join(", "))
            } else {
                compile_value(&args[1], false)?
            };

            let delay = compile_value(&args[2], false)?;

            format!("{}__viwo_schedule({}, {}, {})", prefix, verb, args_list, delay)
        }

        // Mint a new capability
        "mint" => {
            if args.len() < 3 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 3,
                    got: args.len(),
                });
            }
            let authority = compile_value(&args[0], false)?;
            let cap_type = compile_value(&args[1], false)?;
            let params = compile_value(&args[2], false)?;

            format!("{}__viwo_mint({}, {}, {})", prefix, authority, cap_type, params)
        }

        // Delegate a capability with additional restrictions
        "delegate" => {
            if args.len() < 2 {
                return Err(CompileError::InvalidArgCount {
                    opcode: op.to_string(),
                    expected: 2,
                    got: args.len(),
                });
            }
            let parent_cap = compile_value(&args[0], false)?;
            let restrictions = compile_value(&args[1], false)?;

            format!("{}__viwo_delegate({}, {})", prefix, parent_cap, restrictions)
        }

        _ => return Ok(None),
    };

    Ok(Some(result))
}

#[cfg(test)]
mod tests {
    use super::super::compile;
    use std::collections::HashMap;
    use viwo_ir::SExpr;

    #[test]
    fn test_entity() {
        let expr = SExpr::call("entity", vec![SExpr::number(42)]);
        assert_eq!(compile(&expr).unwrap(), "return __viwo_entity(42)");
    }

    #[test]
    fn test_update() {
        let mut props = HashMap::new();
        props.insert("name".to_string(), SExpr::string("Updated"));

        let expr = SExpr::call(
            "update",
            vec![
                SExpr::number(1),
                SExpr::Object(props),
            ],
        );
        let code = compile(&expr).unwrap();
        assert!(code.contains("__viwo_update"));
        assert!(code.contains("1"));
    }

    #[test]
    fn test_create() {
        let mut props = HashMap::new();
        props.insert("name".to_string(), SExpr::string("New Entity"));

        let expr = SExpr::call("create", vec![SExpr::Object(props)]);
        let code = compile(&expr).unwrap();
        assert!(code.contains("__viwo_create"));
        assert!(code.contains("nil")); // No prototype
    }

    #[test]
    fn test_create_with_prototype() {
        let mut props = HashMap::new();
        props.insert("name".to_string(), SExpr::string("New Entity"));

        let expr = SExpr::call(
            "create",
            vec![
                SExpr::Object(props),
                SExpr::number(10),
            ],
        );
        let code = compile(&expr).unwrap();
        assert!(code.contains("__viwo_create"));
        assert!(code.contains("10")); // Has prototype
    }

    #[test]
    fn test_call() {
        let expr = SExpr::call(
            "call",
            vec![
                SExpr::call("std.this", vec![]),
                SExpr::string("helper"),
            ],
        );
        let code = compile(&expr).unwrap();
        assert!(code.contains("__viwo_call"));
        assert!(code.contains("helper"));
    }

    #[test]
    fn test_call_with_args() {
        let expr = SExpr::call(
            "call",
            vec![
                SExpr::call("std.this", vec![]),
                SExpr::string("greet"),
                SExpr::string("Alice"),
                SExpr::number(42),
            ],
        );
        let code = compile(&expr).unwrap();
        assert!(code.contains("__viwo_call"));
        assert!(code.contains("greet"));
        assert!(code.contains("Alice"));
        assert!(code.contains("42"));
    }

    #[test]
    fn test_schedule() {
        let expr = SExpr::call(
            "schedule",
            vec![
                SExpr::string("tick"),
                SExpr::List(vec![SExpr::number(1), SExpr::number(2)]),
                SExpr::number(1000),
            ],
        );
        let code = compile(&expr).unwrap();
        assert!(code.contains("__viwo_schedule"));
        assert!(code.contains("tick"));
        assert!(code.contains("1000"));
    }
}
