//! LuaJIT runtime for Viwo.
//!
//! Compiles S-expressions to Lua and executes via LuaJIT.

mod codegen;

pub use codegen::{compile, CompileError};

use mlua::{Lua, Result as LuaResult, Value};
use thiserror::Error;
use viwo_ir::SExpr;

/// Errors that can occur during execution.
#[derive(Debug, Error)]
pub enum ExecutionError {
    #[error("lua error: {0}")]
    Lua(#[from] mlua::Error),

    #[error("compilation error: {0}")]
    Compile(#[from] CompileError),
}

/// Execute an S-expression using LuaJIT.
pub fn execute(expr: &SExpr) -> Result<Value, ExecutionError> {
    let lua = Lua::new();
    let code = compile(expr)?;
    let result = lua.load(&code).eval()?;
    Ok(result)
}

/// Create a new Lua runtime with Viwo stdlib loaded.
pub fn create_runtime() -> LuaResult<Lua> {
    let lua = Lua::new();
    // TODO: load viwo stdlib
    Ok(lua)
}

#[cfg(test)]
mod tests;
