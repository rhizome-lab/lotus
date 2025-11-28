import { Database } from "bun:sqlite";

export function initSchema(db: Database) {
  db.query(
    `
    CREATE TABLE IF NOT EXISTS entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE,
      name TEXT NOT NULL,
      location_id INTEGER,
      location_detail TEXT,
      prototype_id INTEGER,
      owner_id INTEGER,
      kind TEXT DEFAULT 'ITEM',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(location_id) REFERENCES entities(id),
      FOREIGN KEY(prototype_id) REFERENCES entities(id),
      FOREIGN KEY(owner_id) REFERENCES entities(id)
    )
  `,
  ).run();

  db.query(
    `
    CREATE TABLE IF NOT EXISTS entity_data (
      entity_id INTEGER PRIMARY KEY,
      props TEXT DEFAULT '{}',
      FOREIGN KEY(entity_id) REFERENCES entities(id) ON DELETE CASCADE
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
}
