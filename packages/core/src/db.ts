import { Database } from "bun:sqlite";

export const db = new Database("world.sqlite", { create: true });

// Enable WAL mode for better concurrency
db.query("PRAGMA journal_mode = WAL;").run();

// Initialize Schema
const schema = `
-- 1. The Entity Table (Everything is an Entity)
CREATE TABLE IF NOT EXISTS entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE, 
    name TEXT NOT NULL,
    location_id INTEGER REFERENCES entities(id),
    -- Where exactly in the location? (e.g., 'head', 'main_pocket', 'surface')
    location_detail TEXT,
    prototype_id INTEGER REFERENCES entities(id),
    owner_id INTEGER REFERENCES entities(id),
    kind TEXT CHECK( kind IN ('ZONE', 'ROOM', 'ACTOR', 'ITEM', 'PART', 'EXIT') ) DEFAULT 'ITEM',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. The Data Store (JSON Attributes)
CREATE TABLE IF NOT EXISTS entity_data (
    entity_id INTEGER PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
    state JSON DEFAULT '{}',
    props JSON DEFAULT '{}',
    ai_context JSON DEFAULT '{}'
);

-- 3. The Scripting System (LambdaMOO style verbs)
CREATE TABLE IF NOT EXISTS verbs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id INTEGER REFERENCES entities(id) ON DELETE CASCADE,
    trigger TEXT NOT NULL,
    code TEXT NOT NULL,
    is_public BOOLEAN DEFAULT 0
);
`;

db.run(schema);

console.log("Database initialized with ECS schema (v2)");
