//! TypeScript to S-expression transpiler.
//!
//! Uses tree-sitter for parsing TypeScript, then transforms
//! the CST into Viwo S-expressions.

pub mod entity_definition;
mod transpiler;

pub use entity_definition::{EntityDefinition, parse_entity_definition};
pub use transpiler::{TranspileError, transpile};

#[cfg(test)]
mod tests;
