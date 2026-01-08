//! Opcode schema definitions for code generation.
//!
//! This module defines the schema format for opcodes, which is used to generate:
//! - Type-safe Rust builders
//! - TypeScript type definitions
//! - Codegen modules
//!
//! The schema uses a dual-type system:
//! - `type_ts`: TypeScript compile-time types (can include generics, mapped types, etc.)
//! - `type_runtime`: Rust runtime types (String, Number, Bool, Object, Array, Null, Any)

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

/// Runtime type system for Rust code generation and validation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum RuntimeType {
    /// String type
    String,
    /// Numeric type (f64)
    Number,
    /// Boolean type
    Bool,
    /// Object/map type
    Object,
    /// Array/list type
    Array,
    /// Null type
    Null,
    /// Any type (no compile-time constraints)
    Any,
}

/// Parameter definition for an opcode.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpcodeParam {
    /// Parameter name
    pub name: String,
    /// TypeScript type (can include generics)
    pub type_ts: String,
    /// Runtime type for Rust
    pub type_runtime: RuntimeType,
    /// Parameter description
    pub description: String,
    /// Whether the parameter is optional
    #[serde(default)]
    pub optional: bool,
}

/// Slot definition for visual programming.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpcodeSlot {
    /// Slot name
    pub name: String,
    /// Slot type (e.g., "block", "value")
    #[serde(rename = "type")]
    pub slot_type: String,
}

/// Complete opcode definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Opcode {
    /// Opcode name (e.g., "std.let", "math.add")
    pub name: String,
    /// Category (e.g., "control_flow", "math", "string")
    pub category: String,
    /// Human-readable description
    pub description: String,
    /// Short label for UI
    pub label: String,
    /// Generic type parameters (TypeScript)
    #[serde(default)]
    pub generics: Vec<String>,
    /// Parameters
    #[serde(default)]
    pub params: Vec<OpcodeParam>,
    /// Return type (TypeScript)
    pub return_type_ts: String,
    /// Return type (Rust runtime)
    pub return_type_runtime: RuntimeType,
    /// Whether the opcode is lazy (defers evaluation of arguments)
    #[serde(default)]
    pub lazy: bool,
    /// Whether the opcode is variadic (accepts variable number of arguments)
    #[serde(default)]
    pub variadic: bool,
    /// Visual programming slots
    #[serde(default)]
    pub slot: Vec<OpcodeSlot>,
}

impl Opcode {
    /// Returns the library name (prefix before the dot).
    pub fn library(&self) -> &str {
        self.name.split('.').next().unwrap_or(&self.name)
    }

    /// Returns the function name (suffix after the dot).
    pub fn function_name(&self) -> &str {
        self.name.split('.').nth(1).unwrap_or(&self.name)
    }

    /// Returns a Rust-safe function name (replacing dots with underscores).
    pub fn rust_name(&self) -> String {
        self.name.replace('.', "_")
    }

    /// Returns the builder function name (e.g., "std_let" for "std.let").
    pub fn builder_name(&self) -> String {
        self.rust_name()
    }
}

/// Root schema containing all opcode definitions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpcodeSchema {
    /// All opcode definitions
    pub opcode: Vec<Opcode>,
}

impl OpcodeSchema {
    /// Load schema from a TOML file.
    pub fn from_file<P: AsRef<Path>>(path: P) -> Result<Self, Box<dyn std::error::Error>> {
        let contents = fs::read_to_string(path)?;
        let schema: OpcodeSchema = toml::from_str(&contents)?;
        Ok(schema)
    }

    /// Load the default schema from opcodes.toml.
    pub fn load_default() -> Result<Self, Box<dyn std::error::Error>> {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("opcodes.toml");
        Self::from_file(path)
    }

    /// Get all opcodes grouped by library.
    pub fn by_library(&self) -> std::collections::HashMap<String, Vec<&Opcode>> {
        let mut map = std::collections::HashMap::new();
        for opcode in &self.opcode {
            map.entry(opcode.library().to_string())
                .or_insert_with(Vec::new)
                .push(opcode);
        }
        map
    }

    /// Find an opcode by name.
    pub fn find(&self, name: &str) -> Option<&Opcode> {
        self.opcode.iter().find(|op| op.name == name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_schema() {
        let schema = OpcodeSchema::load_default().expect("Failed to load schema");
        assert!(!schema.opcode.is_empty(), "Schema should have opcodes");
    }

    #[test]
    fn test_opcode_names() {
        let schema = OpcodeSchema::load_default().unwrap();

        // Test std.this opcode
        let this_op = schema.find("std.this").expect("std.this not found");
        assert_eq!(this_op.library(), "std");
        assert_eq!(this_op.function_name(), "this");
        assert_eq!(this_op.rust_name(), "std_this");
        assert_eq!(this_op.builder_name(), "std_this");
    }

    #[test]
    fn test_by_library() {
        let schema = OpcodeSchema::load_default().unwrap();
        let by_lib = schema.by_library();

        assert!(by_lib.contains_key("std"), "Should have std library");
        assert!(by_lib.contains_key("math"), "Should have math library");
        assert!(by_lib.contains_key("str"), "Should have str library");
    }

    #[test]
    fn test_opcode_params() {
        let schema = OpcodeSchema::load_default().unwrap();

        // Test obj.get which has generic parameters
        let obj_get = schema.find("obj.get").expect("obj.get not found");
        assert_eq!(obj_get.params.len(), 2);
        assert_eq!(obj_get.params[0].name, "object");
        assert_eq!(obj_get.params[1].name, "key");
        assert_eq!(obj_get.return_type_runtime, RuntimeType::Any);
    }

    #[test]
    fn test_variadic_opcodes() {
        let schema = OpcodeSchema::load_default().unwrap();

        // Test math.add which is variadic
        let math_add = schema.find("math.add").expect("math.add not found");
        assert!(math_add.variadic, "math.add should be variadic");
    }

    #[test]
    fn test_lazy_opcodes() {
        let schema = OpcodeSchema::load_default().unwrap();

        // Test std.if which is lazy
        let std_if = schema.find("std.if").expect("std.if not found");
        assert!(std_if.lazy, "std.if should be lazy");
    }
}
