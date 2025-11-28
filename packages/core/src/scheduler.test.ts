import { describe, it, expect, beforeAll, mock } from "bun:test";
import { Database } from "bun:sqlite";

import { initSchema } from "./schema";

// Setup in-memory DB
const db = new Database(":memory:");

// Initialize Schema
initSchema(db);

// Mock the db module
mock.module("./db", () => ({ db }));

// Import modules AFTER mocking
import { scheduler } from "./scheduler";
import { createEntity, addVerb } from "./repo";
import { registerLibrary } from "./scripting/interpreter";
import { ObjectLibrary } from "./scripting/lib/object";

describe("Scheduler Verification", () => {
  let entityId: number;

  beforeAll(() => {
    registerLibrary(ObjectLibrary);

    // Create a test entity
    entityId = createEntity({
      name: "SchedulerTestEntity",
      kind: "ITEM",
      props: { count: 0 },
    });

    // Add a verb that increments the count
    addVerb(entityId, "increment", [
      "prop.set",
      "this",
      "count",
      ["+", ["prop", "this", "count"], 1],
    ]);
  });

  // afterAll is no longer needed as the in-memory DB is ephemeral per test run.

  it("should schedule a task", () => {
    scheduler.schedule(entityId, "increment", [], 100);

    const task = db
      .query("SELECT * FROM scheduled_tasks WHERE entity_id = ?")
      .get(entityId) as any;
    expect(task).toBeDefined();
    expect(task.verb).toBe("increment");
  });

  it("should process due tasks", async () => {
    // Wait for task to be due
    await new Promise((resolve) => setTimeout(resolve, 150));

    await scheduler.process();

    // Task should be gone
    const task = db
      .query("SELECT * FROM scheduled_tasks WHERE entity_id = ?")
      .get(entityId);
    expect(task).toBeNull();

    // Let's check the entity state.
    const { getEntity } = await import("./repo");
    const entity = getEntity(entityId);
    expect(entity?.props["count"]).toBe(1);
  });
});
