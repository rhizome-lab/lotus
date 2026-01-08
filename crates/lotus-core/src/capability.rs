//! Capability-based authorization.

use crate::entity::EntityId;
use serde::{Deserialize, Serialize};

/// A capability token granting specific permissions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Capability {
    /// Unique identifier for this capability.
    pub id: String,
    /// Entity that owns this capability.
    pub owner_id: EntityId,
    /// Type of capability (e.g., "entity.control", "fs.read").
    pub cap_type: String,
    /// Parameters for the capability (e.g., {"target_id": 42}).
    pub params: serde_json::Value,
}

impl Capability {
    /// Check if this capability grants access for a given type and params.
    pub fn permits(&self, cap_type: &str, required_params: &serde_json::Value) -> bool {
        if self.cap_type != cap_type {
            return false;
        }

        // Check that all required params are present and match
        match (required_params, &self.params) {
            (serde_json::Value::Object(required), serde_json::Value::Object(granted)) => {
                for (key, required_value) in required {
                    match granted.get(key) {
                        Some(granted_value) if granted_value == required_value => continue,
                        _ => return false,
                    }
                }
                true
            }
            _ => self.params == *required_params,
        }
    }
}

/// Common capability types.
pub mod cap_types {
    /// Control an entity (move, modify props).
    pub const ENTITY_CONTROL: &str = "entity.control";
    /// Read filesystem.
    pub const FS_READ: &str = "fs.read";
    /// Write filesystem.
    pub const FS_WRITE: &str = "fs.write";
    /// Make network requests.
    pub const NET_REQUEST: &str = "net.request";
    /// Execute arbitrary system commands.
    pub const SYSTEM_EXEC: &str = "system.exec";
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_capability_permits_matching_type() {
        let cap = Capability {
            id: "test-cap".to_string(),
            owner_id: 1,
            cap_type: "entity.control".to_string(),
            params: json!({"target_id": 42}),
        };

        assert!(cap.permits("entity.control", &json!({"target_id": 42})));
        assert!(!cap.permits("entity.control", &json!({"target_id": 99})));
        assert!(!cap.permits("other.type", &json!({"target_id": 42})));
    }

    #[test]
    fn test_capability_permits_subset_params() {
        let cap = Capability {
            id: "test-cap".to_string(),
            owner_id: 1,
            cap_type: "fs.read".to_string(),
            params: json!({"path": "/home/user", "recursive": true}),
        };

        // Subset of params should match
        assert!(cap.permits("fs.read", &json!({"path": "/home/user"})));
        // But extra required params should fail
        assert!(!cap.permits("fs.read", &json!({"path": "/home/user", "execute": true})));
    }
}
