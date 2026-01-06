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

/// Set up JSON interop: array metatable, null sentinel, and cjson module.
fn setup_json_interop(lua: &Lua) -> Result<(), mlua::Error> {
    // Use mlua's array_metatable for JSON serialization
    let array_mt = lua.array_metatable();
    lua.globals().set("__array_mt", array_mt)?;

    // Create __is_array function that checks if a table has the array metatable
    // This is implemented in Rust because we can access the internal metatable
    let is_array = lua.create_function(|lua_ctx, table: mlua::Table| {
        // Get the actual metatable (not affected by __metatable)
        let mt = table.metatable();
        if let Some(mt) = mt {
            // Compare with the array metatable
            let array_mt = lua_ctx.array_metatable();
            // Use raw pointer comparison
            Ok(mt.equals(&array_mt)?)
        } else {
            Ok(false)
        }
    })?;
    lua.globals().set("__is_array", is_array)?;

    // Create a null sentinel that serializes to JSON null
    lua.globals().set("null", lua.null())?;

    // Create json module with encode/decode functions using Rust serde_json
    let json_mod = lua.create_table()?;

    // json.encode: Lua value -> JSON string
    let encode = lua.create_function(|lua_ctx, value: mlua::Value| {
        let json: serde_json::Value = lua_ctx.from_value(value)?;
        Ok(json.to_string())
    })?;
    json_mod.set("encode", encode)?;

    // json.decode: JSON string -> Lua value
    let decode = lua.create_function(|lua_ctx, s: String| {
        let json: serde_json::Value = serde_json::from_str(&s)
            .map_err(|e| mlua::Error::external(e))?;
        lua_ctx.to_value(&json)
    })?;
    json_mod.set("decode", decode)?;

    lua.globals().set("json", json_mod)?;

    Ok(())
}

/// Execute an S-expression using LuaJIT and return the result as JSON.
pub fn execute(expr: &SExpr) -> Result<serde_json::Value, ExecutionError> {
    let lua = Lua::new();
    setup_json_interop(&lua)?;
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
        setup_json_interop(&lua)?;
        // TODO: load viwo stdlib (optional/explicit)
        Ok(Self { lua })
    }

    /// Get a reference to the Lua state.
    pub fn lua(&self) -> &Lua {
        &self.lua
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

    /// Execute a callback with access to the raw lua_State pointer.
    ///
    /// # Safety
    /// The callback must not invalidate any existing Lua references or call lua_close.
    /// The state pointer is only valid during the callback execution.
    ///
    /// Note: This uses unsafe transmute to access mlua's internal state pointer.
    /// This relies on mlua's internal structure which could change between versions.
    pub unsafe fn with_state<F, R>(&self, callback: F) -> R
    where
        F: FnOnce(*mut mlua::ffi::lua_State) -> R,
    {
        // Use mlua's internals via transmute (unsafe but works with mlua 0.10)
        // The Lua struct starts with a pointer to lua_State
        #[repr(C)]
        struct LuaInternals {
            state: *mut mlua::ffi::lua_State,
            // ... other fields we don't care about
        }

        let lua_ptr = &self.lua as *const Lua as *const LuaInternals;
        let state = unsafe { (*lua_ptr).state };
        callback(state)
    }
}

impl Default for Runtime {
    fn default() -> Self {
        Self::new().expect("failed to create Lua runtime")
    }
}

#[cfg(test)]
mod tests;
