//! Parse entity definitions from TypeScript class files.

use crate::TranspileError;
use rhizome_lotus_ir::SExpr;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use tree_sitter::{Node, Parser};

/// Entity definition extracted from TypeScript class.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntityDefinition {
    /// Entity properties (as JSON object)
    pub props: HashMap<String, Value>,
    /// Verbs as map of name -> S-expression
    pub verbs: HashMap<String, SExpr>,
}

/// Parse an entity definition from TypeScript source.
///
/// # Arguments
/// * `source` - TypeScript source code
/// * `class_name` - Name of the class to extract (e.g., "EntityBase")
/// * `replacements` - Optional string replacements to apply to verb code
pub fn parse_entity_definition(
    source: &str,
    class_name: &str,
    replacements: Option<&HashMap<String, String>>,
) -> Result<EntityDefinition, TranspileError> {
    let mut parser = Parser::new();
    let language = tree_sitter_typescript::LANGUAGE_TYPESCRIPT;
    parser
        .set_language(&language.into())
        .map_err(|err| TranspileError::Parse(err.to_string()))?;

    let tree = parser
        .parse(source, None)
        .ok_or_else(|| TranspileError::Parse("failed to parse".into()))?;

    let root = tree.root_node();
    if root.has_error() {
        return Err(TranspileError::Parse("syntax error in source".into()));
    }

    // Find the class declaration
    let class_node = find_class_declaration(&root, source, class_name)?;

    let ctx = EntityDefContext::new(source, replacements);
    ctx.extract_entity_definition(class_node)
}

/// Find a class declaration by name.
fn find_class_declaration<'a>(
    root: &Node<'a>,
    source: &str,
    class_name: &str,
) -> Result<Node<'a>, TranspileError> {
    let mut cursor = root.walk();
    for child in root.children(&mut cursor) {
        if child.kind() == "class_declaration" {
            if let Some(name_node) = child.child_by_field_name("name") {
                let name = name_node.utf8_text(source.as_bytes()).unwrap_or("");
                if name == class_name {
                    return Ok(child);
                }
            }
        } else if child.kind() == "export_statement" {
            // Handle: export class Foo { ... }
            if let Some(declaration) = child.child_by_field_name("declaration") {
                if declaration.kind() == "class_declaration" {
                    if let Some(name_node) = declaration.child_by_field_name("name") {
                        let name = name_node.utf8_text(source.as_bytes()).unwrap_or("");
                        if name == class_name {
                            return Ok(declaration);
                        }
                    }
                }
            }
        }
    }

    Err(TranspileError::Parse(format!(
        "class '{}' not found",
        class_name
    )))
}

struct EntityDefContext<'a> {
    source: &'a str,
    replacements: Option<&'a HashMap<String, String>>,
}

impl<'a> EntityDefContext<'a> {
    fn new(source: &'a str, replacements: Option<&'a HashMap<String, String>>) -> Self {
        Self {
            source,
            replacements,
        }
    }

    fn node_text(&self, node: Node) -> &str {
        node.utf8_text(self.source.as_bytes()).unwrap_or("")
    }

    fn extract_entity_definition(
        &self,
        class_node: Node,
    ) -> Result<EntityDefinition, TranspileError> {
        let mut props = HashMap::new();
        let mut verbs = HashMap::new();

        // Find class body
        let body = class_node
            .child_by_field_name("body")
            .ok_or_else(|| TranspileError::Parse("class missing body".into()))?;

        let mut cursor = body.walk();
        for member in body.children(&mut cursor) {
            match member.kind() {
                "public_field_definition" | "field_definition" => {
                    // Property declaration
                    if let Some((name, value)) = self.extract_property(member)? {
                        props.insert(name, value);
                    }
                }
                "method_definition" => {
                    // Method declaration (verb)
                    if let Some((name, sexpr)) = self.extract_method(member)? {
                        verbs.insert(name, sexpr);
                    }
                }
                _ => {}
            }
        }

        Ok(EntityDefinition { props, verbs })
    }

    fn extract_property(&self, node: Node) -> Result<Option<(String, Value)>, TranspileError> {
        let name_node = node
            .child_by_field_name("name")
            .ok_or_else(|| TranspileError::Parse("field_definition missing name".into()))?;
        let name = self.node_text(name_node).to_string();

        // Get initializer value if present
        if let Some(value_node) = node.child_by_field_name("value") {
            let value = self.extract_literal(value_node)?;
            if value != Value::Null {
                return Ok(Some((name, value)));
            }
        }

        Ok(None)
    }

    fn extract_method(&self, node: Node) -> Result<Option<(String, SExpr)>, TranspileError> {
        let name_node = node
            .child_by_field_name("name")
            .ok_or_else(|| TranspileError::Parse("method_definition missing name".into()))?;
        let name = self.node_text(name_node).to_string();

        // Get body - this is a statement_block
        let body_node = node
            .child_by_field_name("body")
            .ok_or_else(|| TranspileError::Parse("method_definition missing body".into()))?;

        // Apply replacements to the body text
        let mut body_text = self.node_text(body_node).to_string();
        if let Some(replacements) = self.replacements {
            for (key, val) in replacements {
                body_text = body_text.replace(key, val);
            }
        }

        // Transpile the body directly (it's a statement_block which the transpiler supports)
        let sexpr = crate::transpile(&body_text)?;

        Ok(Some((name, sexpr)))
    }

    fn extract_literal(&self, node: Node) -> Result<Value, TranspileError> {
        match node.kind() {
            "string" => {
                let text = self.node_text(node);
                // Remove quotes
                let inner = if text.starts_with('"') || text.starts_with('\'') {
                    &text[1..text.len() - 1]
                } else if text.starts_with('`') {
                    &text[1..text.len() - 1]
                } else {
                    text
                };
                // Basic escape handling
                let unescaped = inner
                    .replace("\\n", "\n")
                    .replace("\\t", "\t")
                    .replace("\\r", "\r")
                    .replace("\\\"", "\"")
                    .replace("\\'", "'")
                    .replace("\\\\", "\\");
                Ok(Value::String(unescaped))
            }
            "number" => {
                let text = self.node_text(node);
                // Strip numeric separators (e.g., 10_000 -> 10000)
                let clean_text = text.replace('_', "");
                let num: f64 = clean_text
                    .parse()
                    .map_err(|_| TranspileError::Parse(format!("invalid number: {}", text)))?;
                Ok(serde_json::Number::from_f64(num)
                    .map(Value::Number)
                    .unwrap_or(Value::Null))
            }
            "true" => Ok(Value::Bool(true)),
            "false" => Ok(Value::Bool(false)),
            "null" | "undefined" => Ok(Value::Null),
            "array" => {
                let mut elements = Vec::new();
                let mut cursor = node.walk();
                for child in node.children(&mut cursor) {
                    if child.is_named() {
                        elements.push(self.extract_literal(child)?);
                    }
                }
                Ok(Value::Array(elements))
            }
            "object" => {
                let mut map = serde_json::Map::new();
                let mut cursor = node.walk();
                for child in node.children(&mut cursor) {
                    if child.kind() == "pair" {
                        let key = child
                            .child_by_field_name("key")
                            .ok_or_else(|| TranspileError::Parse("pair missing key".into()))?;
                        let value = child
                            .child_by_field_name("value")
                            .ok_or_else(|| TranspileError::Parse("pair missing value".into()))?;

                        let key_str = match key.kind() {
                            "property_identifier" | "identifier" => self.node_text(key).to_string(),
                            "string" => {
                                let text = self.node_text(key);
                                text[1..text.len() - 1].to_string()
                            }
                            _ => continue,
                        };

                        map.insert(key_str, self.extract_literal(value)?);
                    }
                }
                Ok(Value::Object(map))
            }
            _ => {
                // For complex expressions, return null
                Ok(Value::Null)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_entity() {
        let source = r#"
export class SimpleEntity {
    name = "Test Entity";
    count = 42;
    active = true;

    greet(visitor: string) {
        return "Hello, " + visitor;
    }
}
"#;

        let def = parse_entity_definition(source, "SimpleEntity", None).unwrap();

        assert_eq!(
            def.props.get("name"),
            Some(&Value::String("Test Entity".to_string()))
        );
        // serde_json Number uses f64 internally, so 42 becomes 42.0
        assert_eq!(def.props.get("count").and_then(|v| v.as_f64()), Some(42.0));
        assert_eq!(def.props.get("active"), Some(&Value::Bool(true)));
        assert!(def.verbs.contains_key("greet"));
    }

    #[test]
    fn test_parse_with_replacements() {
        let source = r#"
export class TestEntity {
    test() {
        return PLACEHOLDER;
    }
}
"#;

        let mut replacements = HashMap::new();
        replacements.insert("PLACEHOLDER".to_string(), "42".to_string());

        let def = parse_entity_definition(source, "TestEntity", Some(&replacements)).unwrap();
        assert!(def.verbs.contains_key("test"));
    }

    #[test]
    fn test_class_not_found() {
        let source = r#"
export class SomeClass {
    name = "test";
}
"#;

        let result = parse_entity_definition(source, "NonExistent", None);
        assert!(result.is_err());
        assert!(
            result
                .unwrap_err()
                .to_string()
                .contains("class 'NonExistent' not found")
        );
    }
}
