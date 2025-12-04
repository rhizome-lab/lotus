import { Database } from "bun:sqlite";
import { initSchema } from "./schema";

/**
 * The main SQLite database instance.
 * Initialized with WAL mode for concurrency.
 */
export const db = new Database(
  process.env.NODE_ENV === "test" ? ":memory:" : "world.sqlite",
  {
    create: true,
  },
);

// Enable WAL mode for better concurrency
db.query("PRAGMA journal_mode = WAL;").run();

// Initialize Schema
initSchema(db);

console.log("Database initialized with ECS schema (v2)");
