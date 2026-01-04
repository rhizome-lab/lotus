//! Codegen for filesystem opcodes.

use viwo_ir::SExpr;
use crate::codegen::compile_value;
use crate::CompileError;

/// Compile fs.* opcodes to Lua calls
pub fn compile_fs(op: &str, args: &[SExpr], prefix: &str) -> Result<Option<String>, CompileError> {
    let result = match op {
        "fs.read" => {
            if args.len() != 2 {
                return Err(CompileError::InvalidArguments(
                    format!("fs.read expects 2 arguments (capability, path), got {}", args.len())
                ));
            }
            let cap = compile_value(&args[0], false)?;
            let path = compile_value(&args[1], false)?;
            format!("{}__viwo_fs_read({}, {})", prefix, cap, path)
        }
        "fs.write" => {
            if args.len() != 3 {
                return Err(CompileError::InvalidArguments(
                    format!("fs.write expects 3 arguments (capability, path, content), got {}", args.len())
                ));
            }
            let cap = compile_value(&args[0], false)?;
            let path = compile_value(&args[1], false)?;
            let content = compile_value(&args[2], false)?;
            format!("{}__viwo_fs_write({}, {}, {})", prefix, cap, path, content)
        }
        "fs.list" => {
            if args.len() != 2 {
                return Err(CompileError::InvalidArguments(
                    format!("fs.list expects 2 arguments (capability, path), got {}", args.len())
                ));
            }
            let cap = compile_value(&args[0], false)?;
            let path = compile_value(&args[1], false)?;
            format!("{}__viwo_fs_list({}, {})", prefix, cap, path)
        }
        "fs.stat" => {
            if args.len() != 2 {
                return Err(CompileError::InvalidArguments(
                    format!("fs.stat expects 2 arguments (capability, path), got {}", args.len())
                ));
            }
            let cap = compile_value(&args[0], false)?;
            let path = compile_value(&args[1], false)?;
            format!("{}__viwo_fs_stat({}, {})", prefix, cap, path)
        }
        "fs.exists" => {
            if args.len() != 2 {
                return Err(CompileError::InvalidArguments(
                    format!("fs.exists expects 2 arguments (capability, path), got {}", args.len())
                ));
            }
            let cap = compile_value(&args[0], false)?;
            let path = compile_value(&args[1], false)?;
            format!("{}__viwo_fs_exists({}, {})", prefix, cap, path)
        }
        "fs.mkdir" => {
            if args.len() != 2 {
                return Err(CompileError::InvalidArguments(
                    format!("fs.mkdir expects 2 arguments (capability, path), got {}", args.len())
                ));
            }
            let cap = compile_value(&args[0], false)?;
            let path = compile_value(&args[1], false)?;
            format!("{}__viwo_fs_mkdir({}, {})", prefix, cap, path)
        }
        "fs.remove" => {
            if args.len() != 2 {
                return Err(CompileError::InvalidArguments(
                    format!("fs.remove expects 2 arguments (capability, path), got {}", args.len())
                ));
            }
            let cap = compile_value(&args[0], false)?;
            let path = compile_value(&args[1], false)?;
            format!("{}__viwo_fs_remove({}, {})", prefix, cap, path)
        }
        _ => return Ok(None), // Not an fs opcode
    };

    Ok(Some(result))
}
