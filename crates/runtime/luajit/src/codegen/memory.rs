//! Codegen for memory/RAG opcodes.

use viwo_ir::SExpr;
use crate::codegen::compile_value;
use crate::CompileError;

/// Compile memory.* opcodes to Lua calls
pub fn compile_memory(op: &str, args: &[SExpr], prefix: &str) -> Result<Option<String>, CompileError> {
    let result = match op {
        "memory.add" => {
            if args.len() != 7 {
                return Err(CompileError::InvalidArguments(
                    format!("memory.add expects 7 arguments (db_capability, ai_capability, db_path, provider, model, content, metadata), got {}", args.len())
                ));
            }
            let db_cap = compile_value(&args[0], false)?;
            let ai_cap = compile_value(&args[1], false)?;
            let db_path = compile_value(&args[2], false)?;
            let provider = compile_value(&args[3], false)?;
            let model = compile_value(&args[4], false)?;
            let content = compile_value(&args[5], false)?;
            let metadata = compile_value(&args[6], false)?;
            format!("{}__viwo_memory_add({}, {}, {}, {}, {}, {}, {})", prefix, db_cap, ai_cap, db_path, provider, model, content, metadata)
        }
        "memory.search" => {
            if args.len() != 7 {
                return Err(CompileError::InvalidArguments(
                    format!("memory.search expects 7 arguments (db_capability, ai_capability, db_path, provider, model, query, options), got {}", args.len())
                ));
            }
            let db_cap = compile_value(&args[0], false)?;
            let ai_cap = compile_value(&args[1], false)?;
            let db_path = compile_value(&args[2], false)?;
            let provider = compile_value(&args[3], false)?;
            let model = compile_value(&args[4], false)?;
            let query = compile_value(&args[5], false)?;
            let options = compile_value(&args[6], false)?;
            format!("{}__viwo_memory_search({}, {}, {}, {}, {}, {}, {})", prefix, db_cap, ai_cap, db_path, provider, model, query, options)
        }
        _ => return Ok(None), // Not a memory opcode
    };

    Ok(Some(result))
}
