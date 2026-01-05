//! TypeScript to S-expression transpiler.
//!
//! Uses tree-sitter for parsing TypeScript, then transforms
//! the CST into Viwo S-expressions.

mod transpiler;
pub mod entity_definition;

pub use transpiler::{transpile, TranspileError};
pub use entity_definition::{parse_entity_definition, EntityDefinition};

#[cfg(test)]
mod tests;
