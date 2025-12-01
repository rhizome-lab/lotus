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
import { createEntity, addVerb, getEntity } from "./repo";
import { registerLibrary } from "./scripting/interpreter";
import * as Core from "./scripting/lib/core";
import * as Object from "./scripting/lib/object";

describe("Scheduler Verification", () => {
  registerLibrary(Core);
  registerLibrary(Object);

  // Start Scheduler
  // Start Scheduler
  scheduler.setSendFactory(
    () => (msg) => console.log("[Scheduler System Message]:", msg),
  );

  setInterval(() => {
    scheduler.process();
  }, 1000);

  let entityId: number;

  beforeAll(() => {
    // Create a test entity
    entityId = createEntity({ name: "SchedulerTestEntity", count: 0 });

    // Add a verb that increments the count
    addVerb(
      entityId,
      "increment",
      Core["set_entity"](
        Object["obj.set"](
          Core["this"](),
          "count",
          Core["+"](Object["obj.get"](Core["this"](), "count"), 1),
        ),
      ),
    );
  });

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
    const entity = getEntity(entityId);
    expect(entity?.["count"]).toBe(1);
  });
});
