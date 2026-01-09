//! Codegen for SQLite opcodes.

use crate::CompileError;
use crate::codegen::compile_value;
use rhizome_lotus_ir::SExpr;

/// Compile sqlite.* opcodes to Lua calls
pub fn compile_sqlite(
    op: &str,
    args: &[SExpr],
    prefix: &str,
) -> Result<Option<String>, CompileError> {
    let result = match op {
        "sqlite.query" => {
            if args.len() != 4 {
                return Err(CompileError::InvalidArguments(format!(
                    "sqlite.query expects 4 arguments (capability, db_path, query, params), got {}",
                    args.len()
                )));
            }
            let cap = compile_value(&args[0], false)?;
            let db_path = compile_value(&args[1], false)?;
            let query = compile_value(&args[2], false)?;
            let params = compile_value(&args[3], false)?;
            format!(
                "{}__lotus_sqlite_query({}, {}, {}, {})",
                prefix, cap, db_path, query, params
            )
        }
        "sqlite.execute" => {
            if args.len() != 4 {
                return Err(CompileError::InvalidArguments(format!(
                    "sqlite.execute expects 4 arguments (capability, db_path, query, params), got {}",
                    args.len()
                )));
            }
            let cap = compile_value(&args[0], false)?;
            let db_path = compile_value(&args[1], false)?;
            let query = compile_value(&args[2], false)?;
            let params = compile_value(&args[3], false)?;
            format!(
                "{}__lotus_sqlite_execute({}, {}, {}, {})",
                prefix, cap, db_path, query, params
            )
        }
        _ => return Ok(None), // Not a sqlite opcode
    };

    Ok(Some(result))
}
