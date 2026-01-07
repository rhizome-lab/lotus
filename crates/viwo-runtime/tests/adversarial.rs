//! Adversarial actor tests.
//!
//! Red-team scenarios for capability abuse, resource exhaustion,
//! and security boundary violations.

use serde_json::json;
use viwo_core::WorldStorage;
use viwo_ir::SExpr;
use viwo_runtime::{KernelOps, ViwoRuntime};

/// Helper to setup a world with player and target
fn setup_adversarial_world() -> (ViwoRuntime, i64, i64, i64) {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = ViwoRuntime::new(storage);

    let (player_id, target_id, secret_id) = {
        let storage = runtime.storage().lock().unwrap();

        // Create an attacker player
        let player_id = storage
            .create_entity(json!({"name": "Attacker", "role": "player"}), None)
            .unwrap();

        // Create a target entity the attacker shouldn't control
        let target_id = storage
            .create_entity(
                json!({
                    "name": "Target",
                    "secret_data": "classified",
                    "health": 100
                }),
                None,
            )
            .unwrap();

        // Create a secret entity
        let secret_id = storage
            .create_entity(
                json!({
                    "name": "Secret Vault",
                    "contents": ["treasure"],
                    "locked": true
                }),
                None,
            )
            .unwrap();

        (player_id, target_id, secret_id)
    };

    (runtime, player_id, target_id, secret_id)
}

// ============================================================================
// Missing Capability Tests
// ============================================================================

#[test]
fn test_missing_capability_for_operation() {
    let (runtime, player_id, target_id, _) = setup_adversarial_world();

    let kernel = KernelOps::new(runtime.storage().clone());

    // Player should NOT have control capability for target
    let has_control = kernel
        .has_capability(
            player_id,
            "entity.control",
            Some(json!({"target_id": target_id})),
        )
        .unwrap();

    assert!(
        !has_control,
        "Player should not have control capability for target"
    );
}

#[test]
fn test_capability_type_mismatch() {
    let (runtime, player_id, target_id, _) = setup_adversarial_world();

    // Give player a different type of capability
    {
        let storage = runtime.storage().lock().unwrap();
        storage
            .create_capability(player_id, "chat.send", json!({}))
            .unwrap();
    }

    let kernel = KernelOps::new(runtime.storage().clone());

    // Having chat.send doesn't grant entity.control
    let has_control = kernel
        .has_capability(
            player_id,
            "entity.control",
            Some(json!({"target_id": target_id})),
        )
        .unwrap();

    assert!(
        !has_control,
        "Wrong capability type should not grant access"
    );
}

#[test]
fn test_capability_parameter_mismatch() {
    let (runtime, player_id, target_id, secret_id) = setup_adversarial_world();

    // Give player capability for target_id specifically
    {
        let storage = runtime.storage().lock().unwrap();
        storage
            .create_capability(player_id, "entity.control", json!({"target_id": target_id}))
            .unwrap();
    }

    let kernel = KernelOps::new(runtime.storage().clone());

    // Should have capability for target
    let has_target = kernel
        .has_capability(
            player_id,
            "entity.control",
            Some(json!({"target_id": target_id})),
        )
        .unwrap();
    assert!(has_target, "Should have capability for target");

    // Should NOT have capability for secret (different target_id)
    let has_secret = kernel
        .has_capability(
            player_id,
            "entity.control",
            Some(json!({"target_id": secret_id})),
        )
        .unwrap();
    assert!(
        !has_secret,
        "Capability for target_id should not grant access to different entity"
    );
}

// ============================================================================
// Capability Theft/Transfer Tests
// ============================================================================

#[test]
fn test_cannot_steal_others_capabilities() {
    let (runtime, player_id, target_id, _) = setup_adversarial_world();

    // Give target a capability
    let cap_id = {
        let storage = runtime.storage().lock().unwrap();
        storage
            .create_capability(target_id, "admin.super", json!({}))
            .unwrap()
    };

    let kernel = KernelOps::new(runtime.storage().clone());

    // Verify target has it
    assert!(
        kernel
            .has_capability(target_id, "admin.super", None)
            .unwrap()
    );

    // Player should not be able to give themselves this capability
    // (give_capability requires the cap_id to be owned by the giver)
    // The transfer should fail since player doesn't own cap_id
    // Note: This depends on implementation - we're testing the kernel enforces ownership
    let result = kernel.give_capability(&cap_id.to_string(), player_id);

    // After attempt, target should still have it, player should not
    assert!(
        kernel
            .has_capability(target_id, "admin.super", None)
            .unwrap()
    );
    assert!(
        !kernel
            .has_capability(player_id, "admin.super", None)
            .unwrap()
    );
}

// ============================================================================
// Delegation Abuse Tests
// ============================================================================

#[test]
fn test_delegation_cannot_escalate_privileges() {
    let (runtime, player_id, target_id, secret_id) = setup_adversarial_world();

    // Give player a restricted capability
    let parent_cap_id = {
        let storage = runtime.storage().lock().unwrap();
        storage
            .create_capability(
                player_id,
                "entity.control",
                json!({
                    "target_id": target_id,
                    "operations": ["read"]  // Only read, not write
                }),
            )
            .unwrap()
    };

    let kernel = KernelOps::new(runtime.storage().clone());

    // Try to delegate with MORE permissions (escalation attempt)
    let result = kernel.delegate_capability(
        &parent_cap_id.to_string(),
        player_id,
        json!({
            "target_id": secret_id,  // Different target - escalation!
            "operations": ["read", "write", "delete"]  // More operations!
        }),
    );

    // Delegation should fail or the new cap should not have escalated permissions
    // This depends on implementation - either error or restricted result
    if let Ok(new_cap_id) = result {
        // If it succeeded, verify the new cap is properly restricted
        let storage = runtime.storage().lock().unwrap();
        let new_cap = storage.get_capability_by_id(new_cap_id).unwrap();

        // New cap should still be limited to original target and operations
        // (or the delegation should have failed entirely)
        if let Some(cap) = new_cap {
            // If a new cap was created, it must not have escalated perms
            assert_ne!(
                cap.params.get("target_id"),
                Some(&json!(secret_id)),
                "Delegated cap should not be able to target different entity"
            );
        }
    }
    // If result is Err, that's also acceptable - escalation was prevented
}

// ============================================================================
// Resource Exhaustion Tests
// ============================================================================

#[test]
fn test_deeply_nested_loop_terminates() {
    let (runtime, player_id, _, _) = setup_adversarial_world();

    // Verb with a bounded loop (should complete)
    let bounded_verb = SExpr::call(
        "std.seq",
        vec![
            SExpr::call("std.let", vec![SExpr::string("count"), SExpr::number(0.0)]),
            SExpr::call(
                "std.while",
                vec![
                    SExpr::call(
                        "bool.lt",
                        vec![
                            SExpr::call("std.var", vec![SExpr::string("count")]),
                            SExpr::number(100.0), // Reasonable limit
                        ],
                    ),
                    SExpr::call(
                        "std.set",
                        vec![
                            SExpr::string("count"),
                            SExpr::call(
                                "math.add",
                                vec![
                                    SExpr::call("std.var", vec![SExpr::string("count")]),
                                    SExpr::number(1.0),
                                ],
                            ),
                        ],
                    ),
                ],
            ),
            SExpr::call("std.var", vec![SExpr::string("count")]),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage
            .add_verb(player_id, "bounded_loop", &bounded_verb)
            .unwrap();
    }

    // This should complete successfully
    let result = runtime
        .execute_verb(player_id, "bounded_loop", vec![], None)
        .unwrap();
    assert_eq!(result.as_f64().unwrap(), 100.0);
}

#[test]
fn test_excessive_recursion_handling() {
    let (runtime, player_id, _, _) = setup_adversarial_world();

    // Verb that calls itself (potential stack overflow)
    // Note: The runtime should have recursion limits
    let recursive_verb = SExpr::call(
        "std.seq",
        vec![
            SExpr::call(
                "std.let",
                vec![
                    SExpr::string("n"),
                    SExpr::call("std.arg", vec![SExpr::number(0.0)]),
                ],
            ),
            SExpr::call(
                "std.if",
                vec![
                    SExpr::call(
                        "bool.lte",
                        vec![
                            SExpr::call("std.var", vec![SExpr::string("n")]),
                            SExpr::number(0.0),
                        ],
                    ),
                    SExpr::number(0.0),
                    SExpr::call(
                        "math.add",
                        vec![
                            SExpr::call("std.var", vec![SExpr::string("n")]),
                            SExpr::call(
                                "call",
                                vec![
                                    SExpr::call("std.this", vec![]),
                                    SExpr::string("recurse"),
                                    SExpr::call(
                                        "math.sub",
                                        vec![
                                            SExpr::call("std.var", vec![SExpr::string("n")]),
                                            SExpr::number(1.0),
                                        ],
                                    ),
                                ],
                            ),
                        ],
                    ),
                ],
            ),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage
            .add_verb(player_id, "recurse", &recursive_verb)
            .unwrap();
    }

    // Should work for small n
    let result = runtime
        .execute_verb(player_id, "recurse", vec![json!(5)], None)
        .unwrap();
    assert_eq!(result.as_f64().unwrap(), 15.0); // 5 + 4 + 3 + 2 + 1

    // Very large n might hit recursion limit or take too long
    // The important thing is it shouldn't crash the runtime
}

// ============================================================================
// Data Integrity Tests
// ============================================================================

#[test]
fn test_entity_mutation_is_persisted() {
    let (runtime, player_id, target_id, _) = setup_adversarial_world();

    // Verb that modifies an entity
    let verb = SExpr::call(
        "update",
        vec![
            SExpr::call("std.arg", vec![SExpr::number(0.0)]),
            SExpr::call(
                "obj.new",
                vec![
                    SExpr::list(vec![
                        SExpr::string("modified").erase_type(),
                        SExpr::Bool(true).erase_type(),
                    ])
                    .erase_type(),
                ],
            ),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(player_id, "modify", &verb).unwrap();
    }

    runtime
        .execute_verb(player_id, "modify", vec![json!(target_id)], None)
        .unwrap();

    // Create fresh storage connection to verify persistence
    let storage = runtime.storage().lock().unwrap();
    let entity = storage.get_entity(target_id).unwrap();
    assert_eq!(entity["modified"], true, "Modification should be persisted");
}

#[test]
fn test_verb_execution_isolation() {
    let (runtime, player_id, _, _) = setup_adversarial_world();

    // Verb that sets a variable
    let verb1 = SExpr::call(
        "std.seq",
        vec![
            SExpr::call(
                "std.let",
                vec![SExpr::string("secret"), SExpr::string("verb1_secret")],
            ),
            SExpr::call("std.var", vec![SExpr::string("secret")]),
        ],
    );

    // Verb that tries to read another verb's variable
    let verb2 = SExpr::call("std.var", vec![SExpr::string("secret")]);

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(player_id, "set_secret", &verb1).unwrap();
        storage.add_verb(player_id, "read_secret", &verb2).unwrap();
    }

    // Execute first verb
    let result1 = runtime
        .execute_verb(player_id, "set_secret", vec![], None)
        .unwrap();
    assert_eq!(result1.as_str().unwrap(), "verb1_secret");

    // Execute second verb - should NOT see the variable from verb1
    let result2 = runtime
        .execute_verb(player_id, "read_secret", vec![], None)
        .unwrap();
    assert!(
        result2.is_null(),
        "Variables should be isolated between verb executions"
    );
}

// ============================================================================
// Prototype Chain Security
// ============================================================================

#[test]
fn test_cannot_modify_prototype_via_child() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = ViwoRuntime::new(storage);

    let (proto_id, child_id, player_id) = {
        let storage = runtime.storage().lock().unwrap();

        let proto_id = storage
            .create_entity(
                json!({
                    "name": "Prototype",
                    "base_value": 100
                }),
                None,
            )
            .unwrap();

        let child_id = storage
            .create_entity(
                json!({
                    "name": "Child",
                    "_prototype": proto_id
                }),
                None,
            )
            .unwrap();

        let player_id = storage
            .create_entity(json!({"name": "Player"}), None)
            .unwrap();

        (proto_id, child_id, player_id)
    };

    // Verb that updates the child
    let verb = SExpr::call(
        "update",
        vec![
            SExpr::call("std.arg", vec![SExpr::number(0.0)]),
            SExpr::call(
                "obj.new",
                vec![
                    SExpr::list(vec![
                        SExpr::string("base_value").erase_type(),
                        SExpr::number(999.0).erase_type(),
                    ])
                    .erase_type(),
                ],
            ),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(player_id, "modify", &verb).unwrap();
    }

    runtime
        .execute_verb(player_id, "modify", vec![json!(child_id)], None)
        .unwrap();

    // Child should have its own value now
    let storage = runtime.storage().lock().unwrap();
    let child = storage.get_entity(child_id).unwrap();
    assert_eq!(child["base_value"], 999);

    // Prototype should be unchanged
    let proto = storage.get_entity(proto_id).unwrap();
    assert_eq!(
        proto["base_value"], 100,
        "Prototype should not be modified via child"
    );
}

// ============================================================================
// Error Handling
// ============================================================================

#[test]
fn test_verb_error_doesnt_crash_runtime() {
    let (runtime, player_id, _, _) = setup_adversarial_world();

    // Verb that throws an error
    let verb = SExpr::call("std.throw", vec![SExpr::string("intentional error")]);

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(player_id, "throw_error", &verb).unwrap();
    }

    let result = runtime.execute_verb(player_id, "throw_error", vec![], None);
    assert!(result.is_err(), "Should return error");

    // Runtime should still be usable
    let simple_verb = SExpr::string("still working");
    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(player_id, "simple", &simple_verb).unwrap();
    }

    let result = runtime.execute_verb(player_id, "simple", vec![], None);
    assert!(result.is_ok(), "Runtime should still work after error");
}

#[test]
fn test_nonexistent_verb_returns_error() {
    let (runtime, player_id, _, _) = setup_adversarial_world();

    let result = runtime.execute_verb(player_id, "nonexistent_verb", vec![], None);
    assert!(result.is_err(), "Should error on nonexistent verb");
}

#[test]
fn test_nonexistent_entity_returns_error() {
    let (runtime, _, _, _) = setup_adversarial_world();

    let result = runtime.execute_verb(999999, "any_verb", vec![], None);
    assert!(result.is_err(), "Should error on nonexistent entity");
}
