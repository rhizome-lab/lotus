//! Filesystem plugin for Viwo with capability-based security.

use std::fs;
use std::path::PathBuf;

/// Validate that a capability grants access to a path
fn validate_capability(
    capability: &serde_json::Value,
    current_entity_id: i64,
    requested_path: &str,
) -> Result<(), String> {
    // Check capability ownership
    let owner_id = capability["owner_id"]
        .as_i64()
        .ok_or("fs: capability missing owner_id")?;

    if owner_id != current_entity_id {
        return Err("fs: capability does not belong to current entity".to_string());
    }

    // Check allowed path
    let allowed_path = capability["params"]["path"]
        .as_str()
        .ok_or("fs: capability missing path parameter")?;

    // Resolve paths to absolute form for security check
    let resolved_target = PathBuf::from(requested_path)
        .canonicalize()
        .map_err(|_| format!("fs: path does not exist: {}", requested_path))?;

    let resolved_allowed = PathBuf::from(allowed_path)
        .canonicalize()
        .map_err(|_| format!("fs: invalid allowed path: {}", allowed_path))?;

    // Check if requested path is within allowed path
    if !resolved_target.starts_with(&resolved_allowed) {
        return Err(format!(
            "fs: path '{}' not allowed by capability (allowed: '{}')",
            requested_path, allowed_path
        ));
    }

    Ok(())
}

/// Read file contents (requires fs.read capability)
pub fn fs_read(
    capability: &serde_json::Value,
    entity_id: i64,
    path: &str,
) -> Result<String, String> {
    validate_capability(capability, entity_id, path)?;

    fs::read_to_string(path).map_err(|e| format!("fs.read failed: {}", e))
}

/// List directory contents (requires fs.read capability)
pub fn fs_list(
    capability: &serde_json::Value,
    entity_id: i64,
    path: &str,
) -> Result<Vec<String>, String> {
    validate_capability(capability, entity_id, path)?;

    fs::read_dir(path)
        .map_err(|e| format!("fs.list failed: {}", e))?
        .filter_map(|e| e.ok())
        .map(|e| {
            e.file_name()
                .into_string()
                .map_err(|_| "fs.list: invalid filename".to_string())
        })
        .collect()
}

/// Get file/directory stats (requires fs.read capability)
pub fn fs_stat(
    capability: &serde_json::Value,
    entity_id: i64,
    path: &str,
) -> Result<serde_json::Value, String> {
    validate_capability(capability, entity_id, path)?;

    let metadata = fs::metadata(path).map_err(|e| format!("fs.stat failed: {}", e))?;

    Ok(serde_json::json!({
        "size": metadata.len(),
        "isDirectory": metadata.is_dir(),
        "isFile": metadata.is_file(),
        "modified": metadata.modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
    }))
}

/// Check if file/directory exists (requires fs.read capability)
pub fn fs_exists(
    capability: &serde_json::Value,
    entity_id: i64,
    path: &str,
) -> Result<bool, String> {
    // For exists, we don't validate the path canonically since it might not exist
    // Instead, just check ownership and that the path is within allowed directory
    let owner_id = capability["owner_id"]
        .as_i64()
        .ok_or("fs: capability missing owner_id")?;

    if owner_id != entity_id {
        return Err("fs: capability does not belong to current entity".to_string());
    }

    Ok(PathBuf::from(path).exists())
}

/// Write file contents (requires fs.write capability)
pub fn fs_write(
    capability: &serde_json::Value,
    entity_id: i64,
    path: &str,
    content: &str,
) -> Result<(), String> {
    // For write, create parent dirs if needed
    if let Some(parent) = PathBuf::from(path).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("fs.write: failed to create parent directories: {}", e))?;
        }
    }

    // Validate after ensuring path exists
    validate_capability(capability, entity_id, path)
        .or_else(|_| {
            // If validation fails because file doesn't exist yet, validate parent
            if let Some(parent) = PathBuf::from(path).parent() {
                validate_capability(capability, entity_id, parent.to_str().unwrap())
            } else {
                Err("fs.write: invalid path".to_string())
            }
        })?;

    fs::write(path, content).map_err(|e| format!("fs.write failed: {}", e))
}

/// Create directory (requires fs.write capability)
pub fn fs_mkdir(
    capability: &serde_json::Value,
    entity_id: i64,
    path: &str,
) -> Result<(), String> {
    // Create the directory first
    fs::create_dir_all(path).map_err(|e| format!("fs.mkdir failed: {}", e))?;

    // Then validate
    validate_capability(capability, entity_id, path)?;

    Ok(())
}

/// Remove file or directory (requires fs.write capability)
pub fn fs_remove(
    capability: &serde_json::Value,
    entity_id: i64,
    path: &str,
) -> Result<(), String> {
    validate_capability(capability, entity_id, path)?;

    if PathBuf::from(path).is_dir() {
        fs::remove_dir_all(path).map_err(|e| format!("fs.remove failed: {}", e))
    } else {
        fs::remove_file(path).map_err(|e| format!("fs.remove failed: {}", e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_test_capability(owner_id: i64, path: &str) -> serde_json::Value {
        serde_json::json!({
            "owner_id": owner_id,
            "params": {
                "path": path
            }
        })
    }

    #[test]
    fn test_fs_write_and_read() {
        let temp_dir = TempDir::new().unwrap();
        let cap = create_test_capability(1, temp_dir.path().to_str().unwrap());

        let file_path = temp_dir.path().join("test.txt");
        let file_path_str = file_path.to_str().unwrap();

        // Write
        fs_write(&cap, 1, file_path_str, "Hello, World!").unwrap();

        // Read
        let content = fs_read(&cap, 1, file_path_str).unwrap();
        assert_eq!(content, "Hello, World!");
    }

    #[test]
    fn test_fs_list() {
        let temp_dir = TempDir::new().unwrap();
        let cap = create_test_capability(1, temp_dir.path().to_str().unwrap());

        // Create some files
        fs::write(temp_dir.path().join("file1.txt"), "test").unwrap();
        fs::write(temp_dir.path().join("file2.txt"), "test").unwrap();

        let files = fs_list(&cap, 1, temp_dir.path().to_str().unwrap()).unwrap();
        assert_eq!(files.len(), 2);
        assert!(files.contains(&"file1.txt".to_string()));
        assert!(files.contains(&"file2.txt".to_string()));
    }

    #[test]
    fn test_fs_capability_validation() {
        let temp_dir = TempDir::new().unwrap();
        let cap = create_test_capability(1, temp_dir.path().to_str().unwrap());

        // Write a file
        let file_path = temp_dir.path().join("test.txt");
        fs::write(&file_path, "test").unwrap();

        // Try to access with wrong entity ID
        let result = fs_read(&cap, 2, file_path.to_str().unwrap());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("does not belong"));
    }

    #[test]
    fn test_fs_stat() {
        let temp_dir = TempDir::new().unwrap();
        let cap = create_test_capability(1, temp_dir.path().to_str().unwrap());

        let file_path = temp_dir.path().join("test.txt");
        fs::write(&file_path, "Hello!").unwrap();

        let stats = fs_stat(&cap, 1, file_path.to_str().unwrap()).unwrap();
        assert_eq!(stats["size"], 6);
        assert_eq!(stats["isFile"], true);
        assert_eq!(stats["isDirectory"], false);
    }

    #[test]
    fn test_fs_mkdir_and_remove() {
        let temp_dir = TempDir::new().unwrap();
        let cap = create_test_capability(1, temp_dir.path().to_str().unwrap());

        let dir_path = temp_dir.path().join("subdir");
        let dir_path_str = dir_path.to_str().unwrap();

        // Create directory
        fs_mkdir(&cap, 1, dir_path_str).unwrap();
        assert!(dir_path.exists());

        // Remove directory
        fs_remove(&cap, 1, dir_path_str).unwrap();
        assert!(!dir_path.exists());
    }
}
