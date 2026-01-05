//! Generate type-safe SExpr builders from opcode schema.
//!
//! Usage:
//!   cargo run --bin generate-builders > src/builders.rs

use viwo_ir::{codegen, schema::OpcodeSchema};

fn main() {
    let schema = OpcodeSchema::load_default().expect("Failed to load schema");
    let code = codegen::generate_builders(&schema).expect("Failed to generate code");
    println!("{}", code);
}
