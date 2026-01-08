//! Capability restriction validation logic.
//!
//! Validates that delegated capabilities are strictly more restrictive than their parents.

use serde_json::Value;

/// Validates that a child value is a valid restriction of a parent value.
/// Returns true if child is equal to or more restrictive than parent.
///
/// Restriction semantics are determined by key name conventions:
/// - "*": wildcard - parent can have it, child can remove it
/// - "path": child must be a subpath of parent
/// - "domain": child must be subdomain or equal
/// - "namespace": child must be more specific prefix
/// - Arrays: child must be subset of parent
/// - Numbers: must match exactly
/// - Booleans: can only make MORE restrictive (false -> true OK, true -> false NOT)
/// - Other types: require exact match
pub fn is_valid_restriction(parent_value: &Value, child_value: &Value, key: &str) -> bool {
    // Same value is always valid
    if parent_value == child_value {
        return true;
    }

    // Wildcard: parent "*" allows anything, but child can't add "*" if parent lacks it
    if key == "*" {
        match (parent_value, child_value) {
            (Value::Bool(true), Value::Bool(_)) => true, // Parent has wildcard - child can keep or remove
            (Value::Bool(false), Value::Bool(false)) => true, // Neither has wildcard
            _ => false, // Child cannot add wildcard if parent lacks it
        }
    } else if let (Value::Array(parent_arr), Value::Array(child_arr)) = (parent_value, child_value)
    {
        // Arrays: child must be subset of parent
        child_arr.iter().all(|item| parent_arr.contains(item))
    } else if key == "path" {
        // Path-like strings: child path must be under parent path
        match (parent_value.as_str(), child_value.as_str()) {
            (Some(parent_str), Some(child_str)) => {
                let normalized_parent = if parent_str.ends_with('/') {
                    parent_str.to_string()
                } else {
                    format!("{}/", parent_str)
                };
                let normalized_child = if child_str.ends_with('/') {
                    child_str.to_string()
                } else {
                    format!("{}/", child_str)
                };
                normalized_child.starts_with(&normalized_parent) || child_str == parent_str
            }
            _ => false,
        }
    } else if key == "domain" {
        // Domain strings: child must be subdomain or equal
        match (parent_value.as_str(), child_value.as_str()) {
            (Some(parent_str), Some(child_str)) => {
                child_str == parent_str || child_str.ends_with(&format!(".{}", parent_str))
            }
            _ => false,
        }
    } else if key == "namespace" {
        // Namespace strings: child namespace must be equal or more specific prefix
        match (parent_value.as_str(), child_value.as_str()) {
            (Some("*"), Some(_)) => true, // Parent allows all namespaces
            (Some(parent_str), Some(child_str)) => child_str.starts_with(parent_str),
            _ => false,
        }
    } else if let (Value::Number(parent_num), Value::Number(child_num)) =
        (parent_value, child_value)
    {
        // Numbers (like target_id): must match exactly
        parent_num == child_num
    } else if let (Value::Bool(parent_bool), Value::Bool(child_bool)) = (parent_value, child_value)
    {
        // Booleans: for restrictive flags, can only make MORE restrictive
        // If parent is restrictive (true), child cannot be less restrictive (false)
        // If parent is permissive (false), child can be either
        !parent_bool || *child_bool
    } else {
        // Unknown types: require exact match for safety
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_exact_match() {
        assert!(is_valid_restriction(&json!("foo"), &json!("foo"), "any"));
        assert!(!is_valid_restriction(&json!("foo"), &json!("bar"), "any"));
    }

    #[test]
    fn test_wildcard() {
        // Parent has wildcard - child can keep or remove
        assert!(is_valid_restriction(&json!(true), &json!(true), "*"));
        assert!(is_valid_restriction(&json!(true), &json!(false), "*"));
        // Child cannot add wildcard
        assert!(!is_valid_restriction(&json!(false), &json!(true), "*"));
    }

    #[test]
    fn test_array_subset() {
        assert!(is_valid_restriction(
            &json!(["GET", "POST", "PUT"]),
            &json!(["GET", "POST"]),
            "methods"
        ));
        assert!(!is_valid_restriction(
            &json!(["GET", "POST"]),
            &json!(["GET", "DELETE"]),
            "methods"
        ));
    }

    #[test]
    fn test_path_restriction() {
        assert!(is_valid_restriction(
            &json!("/home/user"),
            &json!("/home/user/docs"),
            "path"
        ));
        assert!(!is_valid_restriction(
            &json!("/home/user"),
            &json!("/home/other"),
            "path"
        ));
    }

    #[test]
    fn test_domain_restriction() {
        assert!(is_valid_restriction(
            &json!("example.com"),
            &json!("api.example.com"),
            "domain"
        ));
        assert!(!is_valid_restriction(
            &json!("example.com"),
            &json!("other.com"),
            "domain"
        ));
    }

    #[test]
    fn test_namespace_restriction() {
        assert!(is_valid_restriction(
            &json!("*"),
            &json!("user.123"),
            "namespace"
        ));
        assert!(is_valid_restriction(
            &json!("user"),
            &json!("user.123"),
            "namespace"
        ));
        assert!(!is_valid_restriction(
            &json!("user.123"),
            &json!("admin"),
            "namespace"
        ));
    }

    #[test]
    fn test_boolean_restriction() {
        // Can make more restrictive
        assert!(is_valid_restriction(
            &json!(false),
            &json!(true),
            "readonly"
        ));
        // Cannot make less restrictive
        assert!(!is_valid_restriction(
            &json!(true),
            &json!(false),
            "readonly"
        ));
    }
}
