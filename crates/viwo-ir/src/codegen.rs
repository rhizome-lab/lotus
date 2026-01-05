//! Code generation from opcode schema.
//!
//! This module generates type-safe Rust builder functions from the opcode schema.
//! Each opcode gets a builder function that returns a properly typed SExpr.

use crate::schema::{Opcode, OpcodeSchema, RuntimeType};
use std::fmt::Write as FmtWrite;

/// Generate Rust builder module from schema.
pub fn generate_builders(schema: &OpcodeSchema) -> Result<String, std::fmt::Error> {
    let mut output = String::new();

    // Module header
    writeln!(&mut output, "//! Type-safe S-expression builders generated from schema.")?;
    writeln!(&mut output, "//!")?;
    writeln!(&mut output, "//! This module is auto-generated from opcodes.toml.")?;
    writeln!(&mut output, "//! Do not edit manually.")?;
    writeln!(&mut output)?;
    writeln!(&mut output, "use crate::{{SExpr, Any, Str, Num, Bool, Obj, Arr, Null}};")?;
    writeln!(&mut output)?;

    // Group opcodes by library
    let by_library = schema.by_library();
    let mut libraries: Vec<_> = by_library.keys().collect();
    libraries.sort();

    for library in libraries {
        let opcodes = &by_library[library];

        writeln!(&mut output, "// ============================================================================")?;
        writeln!(&mut output, "// {} library", library)?;
        writeln!(&mut output, "// ============================================================================")?;
        writeln!(&mut output)?;

        for opcode in opcodes {
            generate_builder_function(&mut output, opcode)?;
            writeln!(&mut output)?;
        }
    }

    Ok(output)
}

/// Generate a single builder function for an opcode.
fn generate_builder_function(output: &mut String, opcode: &Opcode) -> Result<(), std::fmt::Error> {
    // Documentation comment
    writeln!(output, "/// {}", opcode.description)?;
    writeln!(output, "///")?;
    writeln!(output, "/// Opcode: `{}`", opcode.name)?;

    if !opcode.generics.is_empty() {
        writeln!(output, "///")?;
        writeln!(output, "/// Generic parameters: `{}`", opcode.generics.join(", "))?;
    }

    if opcode.lazy {
        writeln!(output, "///")?;
        writeln!(output, "/// Note: This opcode is lazy (defers evaluation of arguments)")?;
    }

    // Function signature
    write!(output, "pub fn {}(", opcode.builder_name())?;

    if opcode.variadic {
        // Variadic function takes a Vec
        if let Some(param) = opcode.params.first() {
            let rust_type = runtime_type_to_builder_type(&param.type_runtime);
            write!(output, "args: Vec<SExpr<{}>>", rust_type)?;
        } else {
            write!(output, "args: Vec<SExpr>")?;
        }
    } else {
        // Regular parameters
        for (idx, param) in opcode.params.iter().enumerate() {
            if idx > 0 {
                write!(output, ", ")?;
            }
            let rust_type = runtime_type_to_builder_type(&param.type_runtime);
            write!(output, "{}: SExpr<{}>", escape_param_name(&param.name), rust_type)?;
        }
    }

    // Return type
    let return_type = runtime_type_to_builder_type(&opcode.return_type_runtime);
    writeln!(output, ") -> SExpr<{}> {{", return_type)?;

    // Function body
    let needs_cast = return_type != "Any";

    if opcode.variadic {
        // Variadic: convert Vec to vec![] with erase_type()
        if needs_cast {
            writeln!(output, "    SExpr::call(")?;
            writeln!(output, "        \"{}\",", opcode.name)?;
            writeln!(output, "        args.into_iter().map(|a| a.erase_type()).collect(),")?;
            writeln!(output, "    ).cast_type()")?;
        } else {
            writeln!(output, "    SExpr::call(")?;
            writeln!(output, "        \"{}\",", opcode.name)?;
            writeln!(output, "        args.into_iter().map(|a| a.erase_type()).collect(),")?;
            writeln!(output, "    )")?;
        }
    } else if opcode.params.is_empty() {
        // No parameters
        if needs_cast {
            writeln!(output, "    SExpr::call(\"{}\", vec![]).cast_type()", opcode.name)?;
        } else {
            writeln!(output, "    SExpr::call(\"{}\", vec![])", opcode.name)?;
        }
    } else {
        // Regular parameters
        if needs_cast {
            writeln!(output, "    SExpr::call(")?;
            writeln!(output, "        \"{}\",", opcode.name)?;
            write!(output, "        vec![")?;

            for (idx, param) in opcode.params.iter().enumerate() {
                if idx > 0 {
                    write!(output, ", ")?;
                }
                write!(output, "{}.erase_type()", escape_param_name(&param.name))?;
            }

            writeln!(output, "],")?;
            writeln!(output, "    ).cast_type()")?;
        } else {
            writeln!(output, "    SExpr::call(")?;
            writeln!(output, "        \"{}\",", opcode.name)?;
            write!(output, "        vec![")?;

            for (idx, param) in opcode.params.iter().enumerate() {
                if idx > 0 {
                    write!(output, ", ")?;
                }
                write!(output, "{}.erase_type()", escape_param_name(&param.name))?;
            }

            writeln!(output, "],")?;
            writeln!(output, "    )")?;
        }
    }

    writeln!(output, "}}")?;

    Ok(())
}

/// Convert runtime type to builder type marker.
fn runtime_type_to_builder_type(runtime_type: &RuntimeType) -> &'static str {
    match runtime_type {
        RuntimeType::String => "Str",
        RuntimeType::Number => "Num",
        RuntimeType::Bool => "Bool",
        RuntimeType::Object => "Obj",
        RuntimeType::Array => "Arr",
        RuntimeType::Null => "Null",
        RuntimeType::Any => "Any",
    }
}

/// Escape parameter name if it's a Rust keyword.
fn escape_param_name(name: &str) -> String {
    let cleaned = name.replace("...", "");
    match cleaned.as_str() {
        // Rust keywords that need escaping
        "as" | "break" | "const" | "continue" | "crate" | "else" | "enum" | "extern"
        | "false" | "fn" | "for" | "if" | "impl" | "in" | "let" | "loop" | "match" | "mod"
        | "move" | "mut" | "pub" | "ref" | "return" | "self" | "Self" | "static" | "struct"
        | "super" | "trait" | "true" | "type" | "unsafe" | "use" | "where" | "while"
        | "async" | "await" | "dyn" => format!("r#{}", cleaned),
        _ => cleaned,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_builders() {
        let schema = OpcodeSchema::load_default().unwrap();
        let code = generate_builders(&schema).expect("Failed to generate builders");

        // Check that generated code contains expected functions
        assert!(code.contains("pub fn std_this("), "Should have std_this function");
        assert!(code.contains("pub fn math_add("), "Should have math_add function");
        assert!(code.contains("pub fn obj_get("), "Should have obj_get function");

        // Check that variadic functions are handled
        assert!(code.contains("args: Vec<SExpr"), "Should have variadic args parameter");

        // Check documentation is included
        assert!(code.contains("/// Current entity"), "Should include documentation");

        // Verify it's valid Rust syntax (basic check)
        assert!(code.contains("use crate::"), "Should have use statements");
        assert!(code.contains("SExpr::call"), "Should call SExpr::call");
    }

    #[test]
    fn test_runtime_type_mapping() {
        assert_eq!(runtime_type_to_builder_type(&RuntimeType::String), "Str");
        assert_eq!(runtime_type_to_builder_type(&RuntimeType::Number), "Num");
        assert_eq!(runtime_type_to_builder_type(&RuntimeType::Bool), "Bool");
        assert_eq!(runtime_type_to_builder_type(&RuntimeType::Object), "Obj");
        assert_eq!(runtime_type_to_builder_type(&RuntimeType::Array), "Arr");
        assert_eq!(runtime_type_to_builder_type(&RuntimeType::Null), "Null");
        assert_eq!(runtime_type_to_builder_type(&RuntimeType::Any), "Any");
    }
}
