//! Seed system for loading entity definitions from TypeScript files.
//!
//! This module provides functionality to load entity definitions written in
//! TypeScript and create entities with properties and verbs. The TypeScript
//! format provides LSP support and type checking during authoring.

use crate::WorldStorage;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use thiserror::Error;
use viwo_syntax_typescript::{EntityDefinition as TsEntityDef, parse_entity_definition};

#[derive(Debug, Error)]
pub enum SeedError {
    #[error("Failed to load entity definition: {0}")]
    LoadError(String),

    #[error("Failed to parse entity definition: {0}")]
    ParseError(String),

    #[error("Failed to create entity: {0}")]
    EntityCreationError(String),

    #[error("Failed to add verb: {0}")]
    VerbError(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Storage error: {0}")]
    StorageError(String),
}

/// Seed configuration and helper.
pub struct SeedSystem {
    /// Path to the TypeScript seed definitions directory
    definitions_path: PathBuf,
}

impl SeedSystem {
    /// Create a new seed system with path to TypeScript definitions.
    ///
    /// # Arguments
    /// * `definitions_path` - Path to directory containing entity definition `.ts` files
    pub fn new(definitions_path: impl Into<PathBuf>) -> Self {
        Self {
            definitions_path: definitions_path.into(),
        }
    }

    /// Load an entity definition from a TypeScript file.
    ///
    /// Parses the TypeScript file using tree-sitter and extracts properties and verbs.
    ///
    /// # Arguments
    /// * `file_name` - Name of the TypeScript file (e.g., "EntityBase.ts")
    /// * `class_name` - Name of the class to load (e.g., "EntityBase")
    /// * `replacements` - Optional string replacements to apply to verb code
    pub fn load_definition(
        &self,
        file_name: &str,
        class_name: &str,
        replacements: Option<&HashMap<String, String>>,
    ) -> Result<TsEntityDef, SeedError> {
        let file_path = self.definitions_path.join(file_name);

        // Read TypeScript source
        let source = fs::read_to_string(&file_path).map_err(|e| {
            SeedError::LoadError(format!("Failed to read {}: {}", file_path.display(), e))
        })?;

        // Parse entity definition
        let definition = parse_entity_definition(&source, class_name, replacements)
            .map_err(|e| SeedError::ParseError(e.to_string()))?;

        Ok(definition)
    }

    /// Create an entity from a definition and add its verbs.
    ///
    /// Returns the ID of the created entity.
    pub fn create_entity(
        &self,
        storage: &WorldStorage,
        definition: &TsEntityDef,
        prototype_id: Option<i64>,
    ) -> Result<i64, SeedError> {
        // Convert props HashMap to JSON Value
        let props = serde_json::to_value(&definition.props)
            .map_err(|e| SeedError::EntityCreationError(e.to_string()))?;

        // Create entity with properties
        let entity_id = storage
            .create_entity(props, prototype_id)
            .map_err(|e| SeedError::EntityCreationError(e.to_string()))?;

        // Add verbs
        for (verb_name, verb_sexpr) in &definition.verbs {
            storage
                .add_verb(entity_id, verb_name, verb_sexpr)
                .map_err(|e| SeedError::VerbError(e.to_string()))?;
        }

        Ok(entity_id)
    }
}

/// Convenience function to seed a basic world.
///
/// This creates the foundational entities: The Void, EntityBase, System.
/// Returns a map of entity names to IDs.
pub fn seed_basic_world(
    storage: &WorldStorage,
    seed_system: &SeedSystem,
) -> Result<HashMap<String, i64>, SeedError> {
    let mut entity_ids = HashMap::new();

    // 1. Create The Void (Root Zone)
    let void_id = storage
        .create_entity(
            serde_json::json!({
                "name": "The Void",
                "description": "An endless expanse of nothingness."
            }),
            None,
        )
        .map_err(|e| SeedError::EntityCreationError(e.to_string()))?;
    entity_ids.insert("void".to_string(), void_id);

    // 2. Create EntityBase
    let mut entity_base_def = seed_system.load_definition("EntityBase.ts", "EntityBase", None)?;
    entity_base_def.props.insert(
        "location".to_string(),
        serde_json::to_value(void_id).unwrap(),
    );

    let entity_base_id = seed_system.create_entity(storage, &entity_base_def, None)?;
    entity_ids.insert("entity_base".to_string(), entity_base_id);

    // Set Void prototype to EntityBase
    storage
        .update_entity(
            void_id,
            serde_json::json!({ "prototype_id": entity_base_id }),
        )
        .map_err(|e| SeedError::StorageError(e.to_string()))?;

    // 3. Create System Entity
    let mut system_def = seed_system.load_definition("System.ts", "System", None)?;
    system_def.props.insert(
        "location".to_string(),
        serde_json::to_value(void_id).unwrap(),
    );

    let system_id = seed_system.create_entity(storage, &system_def, None)?;
    entity_ids.insert("system".to_string(), system_id);

    // Grant System capabilities
    storage
        .create_capability(
            system_id,
            "sys.mint",
            serde_json::json!({ "namespace": "*" }),
        )
        .map_err(|e| SeedError::StorageError(e.to_string()))?;

    storage
        .create_capability(system_id, "sys.create", serde_json::json!({}))
        .map_err(|e| SeedError::StorageError(e.to_string()))?;

    storage
        .create_capability(system_id, "sys.sudo", serde_json::json!({}))
        .map_err(|e| SeedError::StorageError(e.to_string()))?;

    storage
        .create_capability(
            system_id,
            "entity.control",
            serde_json::json!({ "*": true }),
        )
        .map_err(|e| SeedError::StorageError(e.to_string()))?;

    Ok(entity_ids)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_seed_system_creation() {
        let seed_system = SeedSystem::new("/path/to/definitions");

        assert_eq!(
            seed_system.definitions_path,
            PathBuf::from("/path/to/definitions")
        );
    }

    #[test]
    fn test_parse_simple_definition() {
        // Simple test entity definition
        let source = r#"
            export class TestEntity {
                name = "Test Entity";
                description = "A simple test entity";
                count = 42;

                greet(visitor: string) {
                    return "Hello, " + visitor;
                }
            }
        "#;

        let def = parse_entity_definition(source, "TestEntity", None).unwrap();

        // Check properties
        assert_eq!(
            def.props.get("name"),
            Some(&serde_json::Value::String("Test Entity".to_string()))
        );
        assert_eq!(
            def.props.get("description"),
            Some(&serde_json::Value::String(
                "A simple test entity".to_string()
            ))
        );
        assert_eq!(def.props.get("count").and_then(|v| v.as_f64()), Some(42.0));

        // Check verbs
        assert!(def.verbs.contains_key("greet"));
    }

    // Note: More comprehensive tests with actual database integration
    // are in the integration tests.
}
