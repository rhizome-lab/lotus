//! Opcode definitions and registry.

/// Core opcode libraries that are always available.
pub const CORE_LIBRARIES: &[&str] = &[
    "std",  // Control flow, variables, functions
    "list", // List/array operations
    "obj",  // Object/map operations
    "str",  // String operations
    "math", // Math operations
    "time", // Time operations
    "bool", // Boolean operations
];

/// Returns true if the opcode belongs to a core library.
pub fn is_core_opcode(opcode: &str) -> bool {
    if let Some(library) = opcode.split('.').next() {
        CORE_LIBRARIES.contains(&library)
    } else {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_core_opcode() {
        assert!(is_core_opcode("std.let"));
        assert!(is_core_opcode("std.if"));
        assert!(is_core_opcode("math.add"));
        assert!(is_core_opcode("list.map"));
        assert!(!is_core_opcode("fs.read"));
        assert!(!is_core_opcode("ai.generate"));
        assert!(!is_core_opcode("custom.opcode"));
    }
}
