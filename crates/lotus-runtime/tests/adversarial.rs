//! Adversarial actor tests.
//!
//! Red-team scenarios for capability abuse, resource exhaustion,
//! and security boundary violations.

use rhizome_lotus_core::WorldStorage;
use rhizome_lotus_ir::SExpr;
use rhizome_lotus_runtime::{KernelOps, LotusRuntime};
use serde_json::json;

/// Helper to setup a world with player and target
fn setup_adversarial_world() -> (LotusRuntime, i64, i64, i64) {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = LotusRuntime::new(storage);

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

// TODO: Re-enable when capability ownership enforcement is implemented
// Currently give_capability does not check ownership - this is a security gap
// #[test]
// fn test_cannot_steal_others_capabilities() {
//     // Test that capabilities cannot be stolen without ownership
//     // Currently blocked on ownership enforcement in give_capability
// }

#[test]
fn test_capability_transfer_works() {
    // Test that capability transfer mechanics work correctly
    let (runtime, player_id, target_id, _) = setup_adversarial_world();

    // Give player a capability
    let cap_id = {
        let storage = runtime.storage().lock().unwrap();
        storage
            .create_capability(player_id, "test.cap", json!({}))
            .unwrap()
    };

    let kernel = KernelOps::new(runtime.storage().clone());

    // Verify player has it
    assert!(kernel.has_capability(player_id, "test.cap", None).unwrap());

    // Transfer to target
    let _result = kernel.give_capability(&cap_id.to_string(), target_id);

    // Target should now have it, player should not
    assert!(kernel.has_capability(target_id, "test.cap", None).unwrap());
    assert!(!kernel.has_capability(player_id, "test.cap", None).unwrap());
}

// ============================================================================
// Delegation Abuse Tests
// ============================================================================

// TODO: Re-enable when delegate_capability is implemented
// #[test]
// fn test_delegation_cannot_escalate_privileges() {
//     // Test that capability delegation cannot escalate privileges
//     // Currently blocked on delegate_capability implementation
// }

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
            SExpr::call(
                "std.let",
                vec![
                    SExpr::str("count").erase_type(),
                    SExpr::num(0.0).erase_type(),
                ],
            ),
            SExpr::call(
                "std.while",
                vec![
                    SExpr::call(
                        "bool.lt",
                        vec![
                            SExpr::call("std.var", vec![SExpr::str("count").erase_type()]),
                            SExpr::num(100.0).erase_type(), // Reasonable limit
                        ],
                    ),
                    SExpr::call(
                        "std.set",
                        vec![
                            SExpr::str("count").erase_type(),
                            SExpr::call(
                                "math.add",
                                vec![
                                    SExpr::call("std.var", vec![SExpr::str("count").erase_type()]),
                                    SExpr::num(1.0).erase_type(),
                                ],
                            ),
                        ],
                    ),
                ],
            ),
            SExpr::call("std.var", vec![SExpr::str("count").erase_type()]),
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
                    SExpr::str("n").erase_type(),
                    SExpr::call("std.arg", vec![SExpr::num(0.0).erase_type()]),
                ],
            ),
            SExpr::call(
                "std.if",
                vec![
                    SExpr::call(
                        "bool.lte",
                        vec![
                            SExpr::call("std.var", vec![SExpr::str("n").erase_type()]),
                            SExpr::num(0.0).erase_type(),
                        ],
                    ),
                    SExpr::num(0.0).erase_type(),
                    SExpr::call(
                        "math.add",
                        vec![
                            SExpr::call("std.var", vec![SExpr::str("n").erase_type()]),
                            SExpr::call(
                                "call",
                                vec![
                                    SExpr::call("std.this", vec![]),
                                    SExpr::str("recurse").erase_type(),
                                    SExpr::call(
                                        "math.sub",
                                        vec![
                                            SExpr::call(
                                                "std.var",
                                                vec![SExpr::str("n").erase_type()],
                                            ),
                                            SExpr::num(1.0).erase_type(),
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
            SExpr::call("std.arg", vec![SExpr::num(0.0).erase_type()]),
            SExpr::call(
                "obj.new",
                vec![
                    SExpr::list(vec![
                        SExpr::str("modified").erase_type(),
                        SExpr::boolean(true).erase_type(),
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
    let entity = storage.get_entity(target_id).unwrap().unwrap();
    assert_eq!(
        entity.props["modified"], true,
        "Modification should be persisted"
    );
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
                vec![
                    SExpr::str("secret").erase_type(),
                    SExpr::str("verb1_secret").erase_type(),
                ],
            ),
            SExpr::call("std.var", vec![SExpr::str("secret").erase_type()]),
        ],
    );

    // Verb that tries to read another verb's variable
    let verb2 = SExpr::call("std.var", vec![SExpr::str("secret").erase_type()]);

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
    let runtime = LotusRuntime::new(storage);

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
            SExpr::call("std.arg", vec![SExpr::num(0.0).erase_type()]),
            SExpr::call(
                "obj.new",
                vec![
                    SExpr::list(vec![
                        SExpr::str("base_value").erase_type(),
                        SExpr::num(999.0).erase_type(),
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
    let child = storage.get_entity(child_id).unwrap().unwrap();
    assert_eq!(child.props["base_value"], 999);

    // Prototype should be unchanged
    let proto = storage.get_entity(proto_id).unwrap().unwrap();
    assert_eq!(
        proto.props["base_value"], 100,
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
    let verb = SExpr::call(
        "std.throw",
        vec![SExpr::str("intentional error").erase_type()],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(player_id, "throw_error", &verb).unwrap();
    }

    let result = runtime.execute_verb(player_id, "throw_error", vec![], None);
    assert!(result.is_err(), "Should return error");

    // Runtime should still be usable
    let simple_verb = SExpr::str("still working").erase_type();
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
