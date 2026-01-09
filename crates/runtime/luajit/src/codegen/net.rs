//! Codegen for network opcodes.

use crate::CompileError;
use crate::codegen::compile_value;
use rhizome_lotus_ir::SExpr;

/// Compile net.* opcodes to Lua calls
pub fn compile_net(op: &str, args: &[SExpr], prefix: &str) -> Result<Option<String>, CompileError> {
    let result = match op {
        "net.get" => {
            if args.len() != 3 {
                return Err(CompileError::InvalidArguments(format!(
                    "net.get expects 3 arguments (capability, url, headers), got {}",
                    args.len()
                )));
            }
            let cap = compile_value(&args[0], false)?;
            let url = compile_value(&args[1], false)?;
            let headers = compile_value(&args[2], false)?;
            format!("{}__bloom_net_get({}, {}, {})", prefix, cap, url, headers)
        }
        "net.post" => {
            if args.len() != 4 {
                return Err(CompileError::InvalidArguments(format!(
                    "net.post expects 4 arguments (capability, url, headers, body), got {}",
                    args.len()
                )));
            }
            let cap = compile_value(&args[0], false)?;
            let url = compile_value(&args[1], false)?;
            let headers = compile_value(&args[2], false)?;
            let body = compile_value(&args[3], false)?;
            format!(
                "{}__bloom_net_post({}, {}, {}, {})",
                prefix, cap, url, headers, body
            )
        }
        _ => return Ok(None), // Not a net opcode
    };

    Ok(Some(result))
}
