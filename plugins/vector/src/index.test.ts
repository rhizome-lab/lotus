import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { VectorDatabase } from "./index";

describe("VectorDatabase", () => {
  let db: Database;
  let vectorDb: VectorDatabase;

  beforeEach(() => {
    db = new Database(":memory:");
    vectorDb = new VectorDatabase(db);
  });

  it("should create a vector table", () => {
    vectorDb.createTable("test_vectors", 4);
    // const tableInfo = db.prepare("PRAGMA table_info(test_vectors)").all();
    // Virtual tables might not show up in table_info the same way, but we can check if it exists
    const result = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='test_vectors'")
      .get();
    expect(result).not.toBeNull();
  });

  it("should insert and search vectors", () => {
    vectorDb.createTable("items", 4);
    vectorDb.insert("items", 1, [0.1, 0.1, 0.1, 0.1]);
    vectorDb.insert("items", 2, [0.9, 0.9, 0.9, 0.9]);

    const results = vectorDb.search("items", [0.1, 0.1, 0.1, 0.1], 1);
    expect(results.length).toBe(1);
    expect(results[0]?.rowid).toBe(1);
    expect(results[0]?.distance).toBeLessThan(0.0001);
  });

  it("should support batch insert", () => {
    vectorDb.createTable("batch_items", 4);
    const items = [
      { rowId: 1, embedding: [0.1, 0.2, 0.3, 0.4] },
      { rowId: 2, embedding: [0.5, 0.6, 0.7, 0.8] },
    ];
    vectorDb.insertBatch("batch_items", items);

    const results = vectorDb.search("batch_items", [0.1, 0.2, 0.3, 0.4], 2);
    expect(results.length).toBe(2);
    expect(results[0]?.rowid).toBe(1);
  });
});
