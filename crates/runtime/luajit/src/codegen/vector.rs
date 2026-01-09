//! Codegen for vector embedding opcodes.

use crate::CompileError;
use crate::codegen::compile_value;
use rhizome_lotus_ir::SExpr;

/// Compile vector.* opcodes to Lua calls
pub fn compile_vector(
    op: &str,
    args: &[SExpr],
    prefix: &str,
) -> Result<Option<String>, CompileError> {
    let result = match op {
        "vector.insert" => {
            if args.len() != 5 {
                return Err(CompileError::InvalidArguments(format!(
                    "vector.insert expects 5 arguments (capability, db_path, key, embedding, metadata), got {}",
                    args.len()
                )));
            }
            let cap = compile_value(&args[0], false)?;
            let db_path = compile_value(&args[1], false)?;
            let key = compile_value(&args[2], false)?;
            let embedding = compile_value(&args[3], false)?;
            let metadata = compile_value(&args[4], false)?;
            format!(
                "{}__bloom_vector_insert({}, {}, {}, {}, {})",
                prefix, cap, db_path, key, embedding, metadata
            )
        }
        "vector.search" => {
            if args.len() != 4 {
                return Err(CompileError::InvalidArguments(format!(
                    "vector.search expects 4 arguments (capability, db_path, query_embedding, limit), got {}",
                    args.len()
                )));
            }
            let cap = compile_value(&args[0], false)?;
            let db_path = compile_value(&args[1], false)?;
            let query_embedding = compile_value(&args[2], false)?;
            let limit = compile_value(&args[3], false)?;
            format!(
                "{}__bloom_vector_search({}, {}, {}, {})",
                prefix, cap, db_path, query_embedding, limit
            )
        }
        "vector.delete" => {
            if args.len() != 3 {
                return Err(CompileError::InvalidArguments(format!(
                    "vector.delete expects 3 arguments (capability, db_path, key), got {}",
                    args.len()
                )));
            }
            let cap = compile_value(&args[0], false)?;
            let db_path = compile_value(&args[1], false)?;
            let key = compile_value(&args[2], false)?;
            format!(
                "{}__bloom_vector_delete({}, {}, {})",
                prefix, cap, db_path, key
            )
        }
        _ => return Ok(None), // Not a vector opcode
    };

    Ok(Some(result))
}
