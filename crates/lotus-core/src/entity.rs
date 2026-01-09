//! Entity types and prototype chain.

use rhizome_lotus_ir::SExpr;
use serde::{Deserialize, Serialize};

/// Entity ID.
pub type EntityId = i64;

/// An entity in the world.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entity {
    pub id: EntityId,
    pub prototype_id: Option<EntityId>,
    /// Properties as a JSON object. Can include name, description, location, etc.
    pub props: serde_json::Value,
}

impl Entity {
    /// Get a property value by key.
    pub fn get_prop(&self, key: &str) -> Option<&serde_json::Value> {
        self.props.get(key)
    }

    /// Get name property if it exists.
    pub fn name(&self) -> Option<&str> {
        self.get_prop("name").and_then(|v| v.as_str())
    }

    /// Get description property if it exists.
    pub fn description(&self) -> Option<&str> {
        self.get_prop("description").and_then(|v| v.as_str())
    }

    /// Get location (container entity ID) if it exists.
    pub fn location(&self) -> Option<EntityId> {
        self.get_prop("location").and_then(|v| v.as_i64())
    }
}

/// A verb (scriptable action) attached to an entity.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Verb {
    pub id: i64,
    pub entity_id: EntityId,
    pub name: String,
    pub code: SExpr,
    /// Optional capability type required to call this verb.
    /// If set, caller must hold a capability of this type to execute the verb.
    pub required_capability: Option<String>,
}
