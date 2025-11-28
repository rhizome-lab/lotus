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
import {
  createEntity,
  addVerb,
  getEntity,
  updateEntity,
  deleteEntity,
  getAllEntities,
  getContents,
  getVerbs,
} from "./repo";
import { registerLibrary } from "./scripting/interpreter";
import { ObjectLibrary } from "./scripting/lib/object";
import { CoreLibrary } from "./scripting/lib/core";

describe("Scheduler Verification", () => {
  // Register libraries
  registerLibrary(CoreLibrary);
  registerLibrary(ObjectLibrary);

  // Start Scheduler
  scheduler.setContextFactory(() => ({
    move: (id, dest) => updateEntity(id, { location_id: dest }),
    create: createEntity,
    send: (msg) => console.log("[Scheduler System Message]:", msg),
    destroy: deleteEntity,
    getAllEntities,
    schedule: scheduler.schedule.bind(scheduler),
    broadcast: () => {},
    give: (entityId, destId, newOwnerId) => {
      updateEntity(entityId, { location_id: destId, owner_id: newOwnerId });
    },
    call: async () => null, // Scheduler doesn't support call yet? Or we can implement it.
    triggerEvent: async () => {}, // Scheduler doesn't support triggerEvent yet?
    getContents: async (id) => getContents(id),
    getVerbs: async (id) => getVerbs(id),
    getEntity: async (id) => getEntity(id),
  }));

  setInterval(() => {
    scheduler.process();
  }, 1000);

  let entityId: number;

  beforeAll(() => {
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
    expect(entity?.props["count"]).toBe(1);
  });
});
