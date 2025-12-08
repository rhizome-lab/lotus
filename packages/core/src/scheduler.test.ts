import * as KernelLib from "./runtime/lib/kernel";
import { CoreLib, db } from ".";
import { MathLib, ObjectLib, StdLib } from "@viwo/scripting";
import { addVerb, createCapability, createEntity, getEntity } from "./repo";
import { beforeAll, describe, expect, it } from "bun:test";
import { GameOpcodes } from "./runtime/opcodes";
import { scheduler } from "./scheduler";

describe("Scheduler Verification", () => {
  // Start Scheduler
  scheduler.setOpcodes(GameOpcodes);
  scheduler.setSendFactory(() => (msg) => console.log("[Scheduler System Message]:", msg));

  setInterval(() => {
    scheduler.process();
  }, 1000);

  let entityId: number;

  beforeAll(() => {
    // Create a test entity
    entityId = createEntity({ count: 0, name: "SchedulerTestEntity" });
    createCapability(entityId, "entity.control", { target_id: entityId });

    // Add a verb that increments the count
    addVerb(
      entityId,
      "increment",
      StdLib.seq(
        StdLib.let(
          "cap",
          KernelLib.getCapability(
            "entity.control",
            ObjectLib.objNew(["target_id", ObjectLib.objGet(StdLib.this(), "id")]),
          ),
        ),
        CoreLib.setEntity(
          StdLib.var("cap"),
          StdLib.this(),
          ObjectLib.objNew(["count", MathLib.add(ObjectLib.objGet(StdLib.this(), "count"), 1)]),
        ),
      ),
    );
  });

  it("should schedule a task", () => {
    scheduler.schedule(entityId, "increment", [], 100);

    const task = db.query("SELECT * FROM scheduled_tasks WHERE entity_id = ?").get(entityId) as any;
    expect(task).toBeDefined();
    expect(task.verb).toBe("increment");
  });

  it("should process due tasks", async () => {
    // Wait for task to be due
    await new Promise((resolve) => setTimeout(resolve, 150));

    await scheduler.process();

    // Task should be gone
    const task = db.query("SELECT * FROM scheduled_tasks WHERE entity_id = ?").get(entityId);
    expect(task).toBeNull();

    // Let's check the entity state.
    const entity = getEntity(entityId);
    expect(entity?.["count"]).toBe(1);
  });
});
