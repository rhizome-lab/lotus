//! LuaJIT runtime for Viwo.
//!
//! Compiles S-expressions to Lua and executes via LuaJIT.

mod codegen;

pub use codegen::{compile, CompileError};

use mlua::{Lua, LuaSerdeExt, Result as LuaResult};
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

/// Execute an S-expression using LuaJIT and return the result as JSON.
pub fn execute(expr: &SExpr) -> Result<serde_json::Value, ExecutionError> {
    let lua = Lua::new();
    let code = compile(expr)?;
    let result: mlua::Value = lua.load(&code).eval()?;
    let json = lua.from_value(result)?;
    Ok(json)
}

/// Runtime holds a Lua state and can execute S-expressions.
pub struct Runtime {
    lua: Lua,
}

impl Runtime {
    /// Create a new runtime.
    pub fn new() -> LuaResult<Self> {
        let lua = Lua::new();
        // TODO: load viwo stdlib
        Ok(Self { lua })
    }

    /// Execute an S-expression and return the result as JSON.
    pub fn execute(&self, expr: &SExpr) -> Result<serde_json::Value, ExecutionError> {
        let code = compile(expr)?;
        let result: mlua::Value = self.lua.load(&code).eval()?;
        let json = self.lua.from_value(result)?;
        Ok(json)
    }

    /// Execute raw Lua code and return the result as JSON.
    pub fn execute_lua(&self, code: &str) -> Result<serde_json::Value, ExecutionError> {
        let result: mlua::Value = self.lua.load(code).eval()?;
        let json = self.lua.from_value(result)?;
        Ok(json)
    }
}

impl Default for Runtime {
    fn default() -> Self {
        Self::new().expect("failed to create Lua runtime")
    }
}

#[cfg(test)]
mod tests;
