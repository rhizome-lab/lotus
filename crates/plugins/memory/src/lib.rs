//! Memory plugin for Viwo - RAG with vector search and AI embeddings.

use rusqlite::Connection;
use std::collections::HashMap;
use std::sync::Mutex;

/// Global connection pool indexed by database path
static CONNECTIONS: Mutex<Option<HashMap<String, Connection>>> = Mutex::new(None);

/// Initialize the connection pool
fn init_connections() {
    let mut conns = CONNECTIONS.lock().unwrap();
    if conns.is_none() {
        *conns = Some(HashMap::new());
    }
}

/// Validate that capabilities grant access
fn validate_capabilities(
    db_capability: &serde_json::Value,
    ai_capability: &serde_json::Value,
    current_entity_id: i64,
) -> Result<(), String> {
    // Check ownership of database capability
    let db_owner_id = db_capability["owner_id"]
        .as_i64()
        .ok_or("memory: db_capability missing owner_id")?;
    if db_owner_id != current_entity_id {
        return Err("memory: db_capability does not belong to current entity".to_string());
    }

    // Check ownership of AI capability
    let ai_owner_id = ai_capability["owner_id"]
        .as_i64()
        .ok_or("memory: ai_capability missing owner_id")?;
    if ai_owner_id != current_entity_id {
        return Err("memory: ai_capability does not belong to current entity".to_string());
    }

    Ok(())
}

/// Get or create a connection to a database and initialize tables
fn get_connection(db_path: &str) -> Result<&'static mut Connection, String> {
    init_connections();

    let mut conns_lock = CONNECTIONS.lock().unwrap();
    let conns = conns_lock.as_mut().unwrap();

    if !conns.contains_key(db_path) {
        let conn = Connection::open(db_path)
            .map_err(|e| format!("memory: failed to open database: {}", e))?;

        // Initialize tables
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             CREATE TABLE IF NOT EXISTS memories_content (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 content TEXT NOT NULL,
                 metadata TEXT,
                 created_at INTEGER DEFAULT (unixepoch())
             );
             CREATE TABLE IF NOT EXISTS memories_vec (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 rowid INTEGER NOT NULL,
                 embedding BLOB NOT NULL,
                 FOREIGN KEY(rowid) REFERENCES memories_content(id)
             );
             CREATE INDEX IF NOT EXISTS idx_memories_vec_rowid ON memories_vec(rowid);",
        )
        .map_err(|e| format!("memory: failed to initialize tables: {}", e))?;

        conns.insert(db_path.to_string(), conn);
    }

    // SAFETY: We hold the mutex lock, so we have exclusive access
    let conn_ptr = conns.get_mut(db_path).unwrap() as *mut Connection;
    unsafe { Ok(&mut *conn_ptr) }
}

/// Add a memory with embedding
pub async fn memory_add(
    db_capability: &serde_json::Value,
    ai_capability: &serde_json::Value,
    entity_id: i64,
    db_path: &str,
    provider: &str,
    model: &str,
    content: &str,
    metadata: &serde_json::Value,
) -> Result<i64, String> {
    validate_capabilities(db_capability, ai_capability, entity_id)?;

    // 1. Generate embedding using AI plugin
    let embedding = viwo_plugin_ai::ai_embed(ai_capability, entity_id, provider, model, content)
        .await
        .map_err(|e| format!("memory.add: failed to generate embedding: {}", e))?;

    // 2. Insert content into memories_content table
    let conn = get_connection(db_path)?;

    let metadata_str = serde_json::to_string(metadata)
        .map_err(|e| format!("memory.add: failed to serialize metadata: {}", e))?;

    conn.execute(
        "INSERT INTO memories_content (content, metadata) VALUES (?, ?)",
        rusqlite::params![content, &metadata_str],
    )
    .map_err(|e| format!("memory.add: failed to insert content: {}", e))?;

    let content_id = conn.last_insert_rowid();

    // 3. Convert f64 embedding to f32 for storage
    let embedding_f32: Vec<f32> = embedding.iter().map(|&x| x as f32).collect();

    // 4. Insert vector into memories_vec table
    let embedding_bytes: Vec<u8> = embedding_f32
        .iter()
        .flat_map(|f| f.to_le_bytes())
        .collect();

    conn.execute(
        "INSERT INTO memories_vec (rowid, embedding) VALUES (?, ?)",
        rusqlite::params![content_id, &embedding_bytes],
    )
    .map_err(|e| format!("memory.add: failed to insert vector: {}", e))?;

    Ok(content_id)
}

/// Search memories by query embedding
pub async fn memory_search(
    db_capability: &serde_json::Value,
    ai_capability: &serde_json::Value,
    entity_id: i64,
    db_path: &str,
    provider: &str,
    model: &str,
    query: &str,
    options: &serde_json::Value,
) -> Result<Vec<serde_json::Value>, String> {
    validate_capabilities(db_capability, ai_capability, entity_id)?;

    // 1. Generate embedding for query
    let query_embedding = viwo_plugin_ai::ai_embed(ai_capability, entity_id, provider, model, query)
        .await
        .map_err(|e| format!("memory.search: failed to generate query embedding: {}", e))?;

    // Convert to f32 for comparison
    let query_embedding_f32: Vec<f32> = query_embedding.iter().map(|&x| x as f32).collect();

    // 2. Get all vectors and compute similarity
    let conn = get_connection(db_path)?;

    let limit = options["limit"].as_u64().unwrap_or(5) as usize;
    let filter = options.get("filter").cloned().unwrap_or(serde_json::Value::Object(Default::default()));

    let mut stmt = conn
        .prepare("SELECT rowid, embedding FROM memories_vec")
        .map_err(|e| format!("memory.search: failed to prepare vector query: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            let rowid: i64 = row.get(0)?;
            let embedding_bytes: Vec<u8> = row.get(1)?;

            // Convert bytes back to f32 array
            let embedding: Vec<f32> = embedding_bytes
                .chunks_exact(4)
                .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
                .collect();

            // Compute cosine similarity
            let similarity = cosine_similarity(&query_embedding_f32, &embedding);

            Ok((rowid, similarity))
        })
        .map_err(|e| format!("memory.search: vector query failed: {}", e))?;

    let mut results: Vec<(i64, f32)> = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("memory.search: failed to collect vectors: {}", e))?;

    // Sort by similarity (descending)
    results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    // 3. Retrieve content and apply filter
    let mut memories = Vec::new();
    for (rowid, similarity) in results.iter().take(limit * 10) {
        // Fetch more candidates for filtering
        if memories.len() >= limit {
            break;
        }

        let row_result = conn.query_row(
            "SELECT id, content, metadata, created_at FROM memories_content WHERE id = ?",
            rusqlite::params![rowid],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            },
        );

        match row_result {
            Ok((id, content, metadata_str, created_at)) => {
                let metadata: serde_json::Value = metadata_str
                    .as_ref()
                    .and_then(|s| serde_json::from_str(s).ok())
                    .unwrap_or(serde_json::Value::Object(Default::default()));

                // Apply filter
                if !filter.is_null() && filter.is_object() {
                    let filter_obj = filter.as_object().unwrap();
                    let metadata_obj = metadata.as_object();

                    let mut matches = true;
                    for (key, value) in filter_obj {
                        if metadata_obj.map_or(true, |m| m.get(key) != Some(value)) {
                            matches = false;
                            break;
                        }
                    }

                    if !matches {
                        continue;
                    }
                }

                memories.push(serde_json::json!({
                    "id": id,
                    "content": content,
                    "metadata": metadata,
                    "created_at": created_at,
                    "similarity": similarity,
                }));
            }
            Err(_) => continue, // Skip if content not found
        }
    }

    Ok(memories)
}

/// Compute cosine similarity between two vectors
fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() {
        return 0.0;
    }

    let dot_product: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let magnitude_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let magnitude_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();

    if magnitude_a == 0.0 || magnitude_b == 0.0 {
        return 0.0;
    }

    dot_product / (magnitude_a * magnitude_b)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_similarity() {
        assert!((cosine_similarity(&[1.0, 0.0], &[1.0, 0.0]) - 1.0).abs() < 0.001);
        assert!((cosine_similarity(&[1.0, 0.0], &[0.0, 1.0]) - 0.0).abs() < 0.001);
        assert!(cosine_similarity(&[1.0, 1.0], &[1.0, 1.0]) > 0.99);
    }

    fn create_test_db_capability(owner_id: i64, path: &str) -> serde_json::Value {
        serde_json::json!({
            "owner_id": owner_id,
            "params": {
                "path": path
            }
        })
    }

    fn create_test_ai_capability(owner_id: i64, api_key: &str) -> serde_json::Value {
        serde_json::json!({
            "owner_id": owner_id,
            "params": {
                "api_key": api_key
            }
        })
    }

    #[test]
    fn test_capability_validation() {
        let db_cap = create_test_db_capability(1, "/tmp/test.db");
        let ai_cap = create_test_ai_capability(1, "test-key");

        // Valid capabilities
        assert!(validate_capabilities(&db_cap, &ai_cap, 1).is_ok());

        // Wrong entity ID for db capability
        assert!(validate_capabilities(&db_cap, &ai_cap, 2).is_err());

        // Wrong entity ID for ai capability
        let ai_cap_wrong = create_test_ai_capability(2, "test-key");
        assert!(validate_capabilities(&db_cap, &ai_cap_wrong, 1).is_err());
    }
}
