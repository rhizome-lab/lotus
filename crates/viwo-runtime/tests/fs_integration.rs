//! Tests for filesystem plugin integration with the runtime.

use serde_json::json;
use viwo_core::WorldStorage;
use viwo_ir::SExpr;
use viwo_runtime::ViwoRuntime;

#[test]
fn test_fs_write_and_read() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = ViwoRuntime::new(storage);

    // Create a test directory
    let temp_dir = tempfile::tempdir().unwrap();
    let temp_path = temp_dir.path().to_str().unwrap();

    // Create an entity with an fs.write capability
    let entity_id = {
        let mut storage = runtime.storage().lock().unwrap();
        let eid = storage
            .create_entity(json!({"name": "FileWriter"}), None)
            .unwrap();

        // Create capability for the temp directory
        let cap_id = storage
            .create_capability(eid, "fs.write", json!({"path": temp_path}))
            .unwrap();

        // Store capability in entity props for easy access
        storage
            .update_entity(eid, json!({"write_cap_id": cap_id}))
            .unwrap();

        eid
    };

    // Create a verb that writes a file
    let file_path = temp_dir.path().join("test.txt");
    let file_path_str = file_path.to_str().unwrap();

    let write_verb = SExpr::call(
        "fs.write",
        vec![
            // Get capability by ID
            SExpr::call(
                "capability",
                vec![
                    SExpr::call(
                        "obj.get",
                        vec![SExpr::String("__this".to_string()), SExpr::String("write_cap_id".to_string())],
                    ),
                ],
            ),
            SExpr::String(file_path_str.to_string()),
            SExpr::String("Hello, Viwo!".to_string()),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(entity_id, "write_file", &write_verb).unwrap();
    }

    // Execute the write verb
    runtime
        .execute_verb(entity_id, "write_file", vec![], None)
        .unwrap();

    // Verify file was written
    assert!(file_path.exists());
    assert_eq!(std::fs::read_to_string(&file_path).unwrap(), "Hello, Viwo!");

    // Now create a read capability and read the file
    {
        let mut storage = runtime.storage().lock().unwrap();
        let cap_id = storage
            .create_capability(entity_id, "fs.read", json!({"path": temp_path}))
            .unwrap();
        storage
            .update_entity(entity_id, json!({"read_cap_id": cap_id}))
            .unwrap();
    }

    let read_verb = SExpr::call(
        "fs.read",
        vec![
            SExpr::call(
                "capability",
                vec![
                    SExpr::call(
                        "obj.get",
                        vec![SExpr::String("__this".to_string()), SExpr::String("read_cap_id".to_string())],
                    ),
                ],
            ),
            SExpr::String(file_path_str.to_string()),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(entity_id, "read_file", &read_verb).unwrap();
    }

    let result = runtime
        .execute_verb(entity_id, "read_file", vec![], None)
        .unwrap();

    assert_eq!(result.as_str().unwrap(), "Hello, Viwo!");
}

#[test]
fn test_fs_list() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = ViwoRuntime::new(storage);

    let temp_dir = tempfile::tempdir().unwrap();
    let temp_path = temp_dir.path().to_str().unwrap();

    // Create some test files
    std::fs::write(temp_dir.path().join("file1.txt"), "test1").unwrap();
    std::fs::write(temp_dir.path().join("file2.txt"), "test2").unwrap();

    let entity_id = {
        let mut storage = runtime.storage().lock().unwrap();
        let eid = storage.create_entity(json!({"name": "DirLister"}), None).unwrap();
        let cap_id = storage
            .create_capability(eid, "fs.read", json!({"path": temp_path}))
            .unwrap();
        storage
            .update_entity(eid, json!({"read_cap_id": cap_id}))
            .unwrap();
        eid
    };

    let list_verb = SExpr::call(
        "fs.list",
        vec![
            SExpr::call(
                "capability",
                vec![
                    SExpr::call(
                        "obj.get",
                        vec![SExpr::String("__this".to_string()), SExpr::String("read_cap_id".to_string())],
                    ),
                ],
            ),
            SExpr::String(temp_path.to_string()),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(entity_id, "list_dir", &list_verb).unwrap();
    }

    let result = runtime
        .execute_verb(entity_id, "list_dir", vec![], None)
        .unwrap();

    let files = result.as_array().unwrap();
    assert_eq!(files.len(), 2);

    let file_names: Vec<&str> = files.iter().map(|f| f.as_str().unwrap()).collect();
    assert!(file_names.contains(&"file1.txt"));
    assert!(file_names.contains(&"file2.txt"));
}

#[test]
fn test_fs_stat() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = ViwoRuntime::new(storage);

    let temp_dir = tempfile::tempdir().unwrap();
    let temp_path = temp_dir.path().to_str().unwrap();
    let file_path = temp_dir.path().join("test.txt");

    std::fs::write(&file_path, "Hello!").unwrap();

    let entity_id = {
        let mut storage = runtime.storage().lock().unwrap();
        let eid = storage.create_entity(json!({"name": "FileStat"}), None).unwrap();
        let cap_id = storage
            .create_capability(eid, "fs.read", json!({"path": temp_path}))
            .unwrap();
        storage
            .update_entity(eid, json!({"read_cap_id": cap_id}))
            .unwrap();
        eid
    };

    let stat_verb = SExpr::call(
        "fs.stat",
        vec![
            SExpr::call(
                "capability",
                vec![
                    SExpr::call(
                        "obj.get",
                        vec![SExpr::String("__this".to_string()), SExpr::String("read_cap_id".to_string())],
                    ),
                ],
            ),
            SExpr::String(file_path.to_str().unwrap().to_string()),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(entity_id, "stat_file", &stat_verb).unwrap();
    }

    let result = runtime
        .execute_verb(entity_id, "stat_file", vec![], None)
        .unwrap();

    assert_eq!(result["size"], 6);
    assert_eq!(result["isFile"], true);
    assert_eq!(result["isDirectory"], false);
}

#[test]
fn test_fs_capability_validation() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = ViwoRuntime::new(storage);

    let temp_dir = tempfile::tempdir().unwrap();
    let restricted_dir = tempfile::tempdir().unwrap();

    let temp_path = temp_dir.path().to_str().unwrap();
    let restricted_path = restricted_dir.path().to_str().unwrap();

    // Create file in restricted directory
    let restricted_file = restricted_dir.path().join("secret.txt");
    std::fs::write(&restricted_file, "secret").unwrap();

    let entity_id = {
        let mut storage = runtime.storage().lock().unwrap();
        let eid = storage.create_entity(json!({"name": "Reader"}), None).unwrap();
        // Capability only grants access to temp_dir, not restricted_dir
        let cap_id = storage
            .create_capability(eid, "fs.read", json!({"path": temp_path}))
            .unwrap();
        storage
            .update_entity(eid, json!({"read_cap_id": cap_id}))
            .unwrap();
        eid
    };

    // Try to read from restricted directory
    let read_verb = SExpr::call(
        "fs.read",
        vec![
            SExpr::call(
                "capability",
                vec![
                    SExpr::call(
                        "obj.get",
                        vec![SExpr::String("__this".to_string()), SExpr::String("read_cap_id".to_string())],
                    ),
                ],
            ),
            SExpr::String(restricted_file.to_str().unwrap().to_string()),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(entity_id, "read_restricted", &read_verb).unwrap();
    }

    // This should fail because capability doesn't grant access
    let result = runtime.execute_verb(entity_id, "read_restricted", vec![], None);
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("not allowed"));
}

#[test]
fn test_fs_mkdir_and_remove() {
    let storage = WorldStorage::in_memory().unwrap();
    let runtime = ViwoRuntime::new(storage);

    let temp_dir = tempfile::tempdir().unwrap();
    let temp_path = temp_dir.path().to_str().unwrap();
    let new_dir = temp_dir.path().join("subdir");

    let entity_id = {
        let mut storage = runtime.storage().lock().unwrap();
        let eid = storage.create_entity(json!({"name": "DirManager"}), None).unwrap();
        let cap_id = storage
            .create_capability(eid, "fs.write", json!({"path": temp_path}))
            .unwrap();
        storage
            .update_entity(eid, json!({"write_cap_id": cap_id}))
            .unwrap();
        eid
    };

    // Create directory
    let mkdir_verb = SExpr::call(
        "fs.mkdir",
        vec![
            SExpr::call(
                "capability",
                vec![
                    SExpr::call(
                        "obj.get",
                        vec![SExpr::String("__this".to_string()), SExpr::String("write_cap_id".to_string())],
                    ),
                ],
            ),
            SExpr::String(new_dir.to_str().unwrap().to_string()),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(entity_id, "make_dir", &mkdir_verb).unwrap();
    }

    runtime
        .execute_verb(entity_id, "make_dir", vec![], None)
        .unwrap();

    assert!(new_dir.exists());
    assert!(new_dir.is_dir());

    // Remove directory
    let remove_verb = SExpr::call(
        "fs.remove",
        vec![
            SExpr::call(
                "capability",
                vec![
                    SExpr::call(
                        "obj.get",
                        vec![SExpr::String("__this".to_string()), SExpr::String("write_cap_id".to_string())],
                    ),
                ],
            ),
            SExpr::String(new_dir.to_str().unwrap().to_string()),
        ],
    );

    {
        let storage = runtime.storage().lock().unwrap();
        storage.add_verb(entity_id, "remove_dir", &remove_verb).unwrap();
    }

    runtime
        .execute_verb(entity_id, "remove_dir", vec![], None)
        .unwrap();

    assert!(!new_dir.exists());
}
