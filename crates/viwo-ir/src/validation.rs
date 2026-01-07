//! S-expression validation.

use crate::SExpr;
use thiserror::Error;

/// Errors that can occur during validation.
#[derive(Debug, Error)]
pub enum ValidationError {
    #[error("unknown opcode: {0}")]
    UnknownOpcode(String),

    #[error("invalid argument count for {opcode}: expected {expected}, got {got}")]
    InvalidArgCount {
        opcode: String,
        expected: usize,
        got: usize,
    },

    #[error("invalid argument type for {opcode} at position {position}: expected {expected}")]
    InvalidArgType {
        opcode: String,
        position: usize,
        expected: String,
    },

    #[error("empty opcode call")]
    EmptyCall,

    #[error("opcode name must be a string")]
    InvalidOpcodeName,
}

/// Validate an S-expression for structural correctness.
///
/// This performs basic validation:
/// - Opcode calls must have a string as the first element
/// - Recursively validates nested expressions
///
/// Note: This does NOT validate that opcodes exist or have correct arity.
/// That requires an opcode registry and is done at runtime.
pub fn validate(expr: &SExpr) -> Result<(), ValidationError> {
    // Check if it's an object
    if let Some(map) = expr.as_object() {
        for value in map.values() {
            validate(value)?;
        }
        return Ok(());
    }

    // Check if it's a list
    if let Some(items) = expr.as_list() {
        if items.is_empty() {
            // Empty list is valid (represents empty array)
            return Ok(());
        }

        // If first element is a string, treat as opcode call
        if items[0].as_str().is_some() {
            // Validate arguments recursively
            for arg in &items[1..] {
                validate(arg)?;
            }
        } else {
            // Not an opcode call, validate all elements
            for item in items {
                validate(item)?;
            }
        }

        return Ok(());
    }

    // All other types (Null, Bool, Number, String) are valid
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_literals() {
        assert!(validate(&SExpr::null().erase_type()).is_ok());
        assert!(validate(&SExpr::bool(true).erase_type()).is_ok());
        assert!(validate(&SExpr::number(42.0).erase_type()).is_ok());
        assert!(validate(&SExpr::string("hello").erase_type()).is_ok());
    }

    #[test]
    fn test_validate_opcode_call() {
        let expr = SExpr::call(
            "std.let",
            vec![
                SExpr::string("x").erase_type(),
                SExpr::number(10).erase_type(),
            ],
        );
        assert!(validate(&expr).is_ok());
    }

    #[test]
    fn test_validate_nested() {
        let expr = SExpr::call(
            "std.seq",
            vec![
                SExpr::call(
                    "std.let",
                    vec![
                        SExpr::string("x").erase_type(),
                        SExpr::number(10).erase_type(),
                    ],
                ),
                SExpr::call(
                    "math.add",
                    vec![
                        SExpr::call("std.var", vec![SExpr::string("x").erase_type()]),
                        SExpr::number(5).erase_type(),
                    ],
                ),
            ],
        );
        assert!(validate(&expr).is_ok());
    }
}
