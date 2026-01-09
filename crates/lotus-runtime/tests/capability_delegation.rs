//! Tests for capability minting and delegation with restriction validation.

use rhizome_lotus_core::WorldStorage;
use rhizome_lotus_ir::SExpr;
use rhizome_lotus_runtime::LotusRuntime;
use serde_json::json;

#[test]
fn test_mint_capability() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = LotusRuntime::new(storage);

    // Create entity with sys.mint authority
    let entity_id = {
        let storage = runtime.storage().lock().unwrap();
        storage
            .create_entity(json!({"name": "Admin"}), None)
            .unwrap()
    };

    // Create sys.mint authority for this entity
    let mint_authority_id = {
        let storage = runtime.storage().lock().unwrap();
        storage
            .create_capability(entity_id, "sys.mint", json!({"namespace": "*"}))
            .unwrap()
    };

    // Add a verb that mints a new capability
    let mint_verb = SExpr::call(
        "mint",
        vec![
            SExpr::obj(
                [
                    ("id".to_string(), SExpr::str(&mint_authority_id)),
                    ("type".to_string(), SExpr::str("sys.mint")),
                    (
                        "params".to_string(),
                        SExpr::obj(
                            [("namespace".to_string(), SExpr::str("*"))]
                                .into_iter()
                                .collect(),
                        ),
                    ),
                ]
                .into_iter()
                .collect(),
            ),
            SExpr::str("fs.write"),
            SExpr::obj(
                [("path".to_string(), SExpr::str("/tmp/test"))]
                    .into_iter()
                    .collect(),
            ),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage
            .add_verb(entity_id, "mint_test", &mint_verb)
            .unwrap();
    }

    // Execute mint
    let result = runtime
        .execute_verb(entity_id, "mint_test", vec![], None)
        .unwrap();

    assert_eq!(result["type"], "fs.write");
    assert_eq!(result["params"]["path"], "/tmp/test");

    // Verify capability was created
    let cap_id = result["id"].as_str().unwrap();
    let cap = {
        let storage = runtime.storage().lock().unwrap();
        storage.get_capability(cap_id).unwrap().unwrap()
    };

    assert_eq!(cap.cap_type, "fs.write");
    assert_eq!(cap.owner_id, entity_id);
    assert_eq!(cap.params["path"], "/tmp/test");
}

#[test]
fn test_delegate_capability_valid_restriction() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = LotusRuntime::new(storage);

    // Create entity
    let entity_id = {
        let storage = runtime.storage().lock().unwrap();
        storage
            .create_entity(json!({"name": "User"}), None)
            .unwrap()
    };

    // Create parent capability with broad permissions
    let parent_cap_id = {
        let storage = runtime.storage().lock().unwrap();
        storage
            .create_capability(
                entity_id,
                "fs.write",
                json!({
                    "path": "/home/user",
                    "methods": ["GET", "POST", "PUT", "DELETE"]
                }),
            )
            .unwrap()
    };

    // Add a verb that delegates with more restrictive path
    let delegate_verb = SExpr::call(
        "delegate",
        vec![
            SExpr::obj(
                [
                    ("id".to_string(), SExpr::str(&parent_cap_id)),
                    ("type".to_string(), SExpr::str("fs.write")),
                    (
                        "params".to_string(),
                        SExpr::obj(
                            [
                                ("path".to_string(), SExpr::str("/home/user")),
                                (
                                    "methods".to_string(),
                                    SExpr::call(
                                        "list.new",
                                        vec![
                                            SExpr::str("GET"),
                                            SExpr::str("POST"),
                                            SExpr::str("PUT"),
                                            SExpr::str("DELETE"),
                                        ],
                                    ),
                                ),
                            ]
                            .into_iter()
                            .collect(),
                        ),
                    ),
                ]
                .into_iter()
                .collect(),
            ),
            SExpr::obj(
                [
                    ("path".to_string(), SExpr::str("/home/user/docs")),
                    (
                        "methods".to_string(),
                        SExpr::call("list.new", vec![SExpr::str("GET"), SExpr::str("POST")]),
                    ),
                ]
                .into_iter()
                .collect(),
            ),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage
            .add_verb(entity_id, "delegate_test", &delegate_verb)
            .unwrap();
    }

    // Execute delegate
    let result = runtime
        .execute_verb(entity_id, "delegate_test", vec![], None)
        .unwrap();

    // Verify delegated capability
    assert_eq!(result["type"], "fs.write");
    assert_eq!(result["params"]["path"], "/home/user/docs");
    assert_eq!(result["params"]["methods"], json!(["GET", "POST"]));

    // Verify in storage
    let cap_id = result["id"].as_str().unwrap();
    let cap = {
        let storage = runtime.storage().lock().unwrap();
        storage.get_capability(cap_id).unwrap().unwrap()
    };

    assert_eq!(cap.cap_type, "fs.write");
    assert_eq!(cap.owner_id, entity_id);
    assert_eq!(cap.params["path"], "/home/user/docs");
}

#[test]
fn test_delegate_capability_invalid_path_restriction() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = LotusRuntime::new(storage);

    // Create entity
    let entity_id = {
        let storage = runtime.storage().lock().unwrap();
        storage
            .create_entity(json!({"name": "User"}), None)
            .unwrap()
    };

    // Create parent capability
    let parent_cap_id = {
        let storage = runtime.storage().lock().unwrap();
        storage
            .create_capability(entity_id, "fs.write", json!({"path": "/home/user"}))
            .unwrap()
    };

    // Try to delegate with broader path (should fail)
    let delegate_verb = SExpr::call(
        "delegate",
        vec![
            SExpr::obj(
                [
                    ("id".to_string(), SExpr::str(&parent_cap_id)),
                    ("type".to_string(), SExpr::str("fs.write")),
                    (
                        "params".to_string(),
                        SExpr::obj(
                            [("path".to_string(), SExpr::str("/home/user"))]
                                .into_iter()
                                .collect(),
                        ),
                    ),
                ]
                .into_iter()
                .collect(),
            ),
            SExpr::obj(
                [("path".to_string(), SExpr::str("/home"))]
                    .into_iter()
                    .collect(),
            ),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage
            .add_verb(entity_id, "delegate_invalid", &delegate_verb)
            .unwrap();
    }

    // Execute should fail
    let result = runtime.execute_verb(entity_id, "delegate_invalid", vec![], None);
    assert!(result.is_err());
    assert!(
        result
            .unwrap_err()
            .to_string()
            .contains("invalid restriction")
    );
}

#[test]
fn test_delegate_capability_invalid_array_superset() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = LotusRuntime::new(storage);

    // Create entity
    let entity_id = {
        let storage = runtime.storage().lock().unwrap();
        storage
            .create_entity(json!({"name": "User"}), None)
            .unwrap()
    };

    // Create parent capability with limited methods
    let parent_cap_id = {
        let storage = runtime.storage().lock().unwrap();
        storage
            .create_capability(
                entity_id,
                "http.request",
                json!({"methods": ["GET", "POST"]}),
            )
            .unwrap()
    };

    // Try to delegate with additional method (should fail)
    let delegate_verb = SExpr::call(
        "delegate",
        vec![
            SExpr::obj(
                [
                    ("id".to_string(), SExpr::str(&parent_cap_id)),
                    ("type".to_string(), SExpr::str("http.request")),
                    (
                        "params".to_string(),
                        SExpr::obj(
                            [(
                                "methods".to_string(),
                                SExpr::call(
                                    "list.new",
                                    vec![SExpr::str("GET"), SExpr::str("POST")],
                                ),
                            )]
                            .into_iter()
                            .collect(),
                        ),
                    ),
                ]
                .into_iter()
                .collect(),
            ),
            SExpr::obj(
                [(
                    "methods".to_string(),
                    SExpr::call(
                        "list.new",
                        vec![SExpr::str("GET"), SExpr::str("POST"), SExpr::str("DELETE")],
                    ),
                )]
                .into_iter()
                .collect(),
            ),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage
            .add_verb(entity_id, "delegate_invalid", &delegate_verb)
            .unwrap();
    }

    // Execute should fail
    let result = runtime.execute_verb(entity_id, "delegate_invalid", vec![], None);
    assert!(result.is_err());
    assert!(
        result
            .unwrap_err()
            .to_string()
            .contains("invalid restriction")
    );
}

#[test]
fn test_delegate_namespace_restriction() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = LotusRuntime::new(storage);

    // Create entity
    let entity_id = {
        let storage = runtime.storage().lock().unwrap();
        storage
            .create_entity(json!({"name": "User"}), None)
            .unwrap()
    };

    // Create parent capability with wildcard namespace
    let parent_cap_id = {
        let storage = runtime.storage().lock().unwrap();
        storage
            .create_capability(entity_id, "custom.cap", json!({"namespace": "user"}))
            .unwrap()
    };

    // Delegate with more specific namespace
    let delegate_verb = SExpr::call(
        "delegate",
        vec![
            SExpr::obj(
                [
                    ("id".to_string(), SExpr::str(&parent_cap_id)),
                    ("type".to_string(), SExpr::str("custom.cap")),
                    (
                        "params".to_string(),
                        SExpr::obj(
                            [("namespace".to_string(), SExpr::str("user"))]
                                .into_iter()
                                .collect(),
                        ),
                    ),
                ]
                .into_iter()
                .collect(),
            ),
            SExpr::obj(
                [("namespace".to_string(), SExpr::str("user.admin"))]
                    .into_iter()
                    .collect(),
            ),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage
            .add_verb(entity_id, "delegate_ns", &delegate_verb)
            .unwrap();
    }

    // Execute delegate
    let result = runtime
        .execute_verb(entity_id, "delegate_ns", vec![], None)
        .unwrap();

    assert_eq!(result["params"]["namespace"], "user.admin");
}
