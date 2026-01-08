//! Codegen for AI/LLM opcodes.

use crate::CompileError;
use crate::codegen::compile_value;
use lotus_ir::SExpr;

/// Compile ai.* opcodes to Lua calls
pub fn compile_ai(op: &str, args: &[SExpr], prefix: &str) -> Result<Option<String>, CompileError> {
    let result = match op {
        "ai.generate_text" => {
            if args.len() != 5 {
                return Err(CompileError::InvalidArguments(format!(
                    "ai.generate_text expects 5 arguments (capability, provider, model, prompt, options), got {}",
                    args.len()
                )));
            }
            let cap = compile_value(&args[0], false)?;
            let provider = compile_value(&args[1], false)?;
            let model = compile_value(&args[2], false)?;
            let prompt = compile_value(&args[3], false)?;
            let options = compile_value(&args[4], false)?;
            format!(
                "{}__bloom_ai_generate_text({}, {}, {}, {}, {})",
                prefix, cap, provider, model, prompt, options
            )
        }
        "ai.embed" => {
            if args.len() != 4 {
                return Err(CompileError::InvalidArguments(format!(
                    "ai.embed expects 4 arguments (capability, provider, model, text), got {}",
                    args.len()
                )));
            }
            let cap = compile_value(&args[0], false)?;
            let provider = compile_value(&args[1], false)?;
            let model = compile_value(&args[2], false)?;
            let text = compile_value(&args[3], false)?;
            format!(
                "{}__bloom_ai_embed({}, {}, {}, {})",
                prefix, cap, provider, model, text
            )
        }
        "ai.chat" => {
            if args.len() != 5 {
                return Err(CompileError::InvalidArguments(format!(
                    "ai.chat expects 5 arguments (capability, provider, model, messages, options), got {}",
                    args.len()
                )));
            }
            let cap = compile_value(&args[0], false)?;
            let provider = compile_value(&args[1], false)?;
            let model = compile_value(&args[2], false)?;
            let messages = compile_value(&args[3], false)?;
            let options = compile_value(&args[4], false)?;
            format!(
                "{}__bloom_ai_chat({}, {}, {}, {}, {})",
                prefix, cap, provider, model, messages, options
            )
        }
        _ => return Ok(None), // Not an ai opcode
    };

    Ok(Some(result))
}
