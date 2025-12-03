import { Database } from "bun:sqlite";

/**
 * Initializes the database schema.
 * Creates tables for entities, verbs, and scheduled tasks if they don't exist.
 *
 * @param db - The database instance.
 */
export function initSchema(db: Database) {
  db.query(
    `
    CREATE TABLE IF NOT EXISTS entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prototype_id INTEGER,
      props TEXT DEFAULT '{}',
      FOREIGN KEY(prototype_id) REFERENCES entities(id)
    )
  `,
  ).run();

  db.query(
    `
    CREATE TABLE IF NOT EXISTS verbs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      permissions TEXT DEFAULT '{"call":"public"}',
      FOREIGN KEY(entity_id) REFERENCES entities(id) ON DELETE CASCADE,
      UNIQUE(entity_id, name)
    )
  `,
  ).run();

  db.query(
    `
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_id INTEGER NOT NULL,
      verb TEXT NOT NULL,
      args TEXT DEFAULT '[]',
      execute_at INTEGER NOT NULL,
      FOREIGN KEY(entity_id) REFERENCES entities(id) ON DELETE CASCADE
    )
  `,
  ).run();

  db.query(
    `
    CREATE TABLE IF NOT EXISTS capabilities (
      id TEXT PRIMARY KEY,
      owner_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      params TEXT NOT NULL,
      FOREIGN KEY(owner_id) REFERENCES entities(id) ON DELETE CASCADE
    )
  `,
  ).run();

  db.query(
    "CREATE INDEX IF NOT EXISTS idx_capabilities_owner ON capabilities(owner_id)",
  ).run();
}
