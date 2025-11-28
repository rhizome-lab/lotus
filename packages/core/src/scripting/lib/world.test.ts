import { describe, test, expect, mock, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../../schema";

// Setup in-memory DB
const db = new Database(":memory:");
initSchema(db);

// Mock the db module
mock.module("../../db", () => ({ db }));

import { evaluate, ScriptContext, registerLibrary } from "../interpreter";
import { CoreLibrary } from "./core";
import { WorldLibrary } from "./world";
import * as permissions from "../../permissions";
import { createEntity, addVerb } from "../../repo";

mock.module("../../permissions", () => ({
  checkPermission: mock(),
}));

describe("World Library", () => {
  let ctx: ScriptContext;

  beforeEach(() => {
    registerLibrary(CoreLibrary);
    registerLibrary(WorldLibrary);
    // Reset DB
    db.query("DELETE FROM entities").run();
    db.query("DELETE FROM entity_data").run();
    db.query("DELETE FROM sqlite_sequence").run();

    (permissions.checkPermission as any).mockReset();

    ctx = {
      caller: { id: 1, kind: "ACTOR", props: {}, location_id: 0 } as any,
      this: { id: 2, kind: "ITEM", props: {}, location_id: 0 } as any,
      args: [],
      gas: 1000,
      warnings: [],
      sys: {
        getAllEntities: mock(() => [1, 2, 3]),
      } as any,
    };
  });

  test("world.entities", async () => {
    const entities = await evaluate(["world.entities"], ctx);
    expect(entities).toEqual([1, 2, 3]);
    expect(ctx.sys?.getAllEntities).toHaveBeenCalled();
  });

  test("entity.contents", async () => {
    const targetId = createEntity({ name: "Container", kind: "ROOM" });
    const item1Id = createEntity({
      name: "Item 1",
      kind: "ITEM",
      location_id: targetId,
    });
    const item2Id = createEntity({
      name: "Item 2",
      kind: "ITEM",
      location_id: targetId,
    });

    (permissions.checkPermission as any).mockReturnValue(true);

    const contents = await evaluate(["entity.contents", targetId], ctx);
    expect(contents).toContain(item1Id);
    expect(contents).toContain(item2Id);
    expect(contents.length).toBe(2);
    expect(permissions.checkPermission).toHaveBeenCalled();
  });

  test("entity.contents permission denied", async () => {
    const targetId = createEntity({ name: "Container", kind: "ROOM" });
    (permissions.checkPermission as any).mockReturnValue(false);

    const contents = await evaluate(["entity.contents", targetId], ctx);
    expect(contents).toEqual([]);
  });

  test("entity.descendants", async () => {
    // Structure: 10 -> [11, 12], 11 -> [13]
    const rootId = createEntity({ name: "Root", kind: "ROOM" });
    const child1Id = createEntity({
      name: "Child 1",
      kind: "ROOM",
      location_id: rootId,
    });
    const child2Id = createEntity({
      name: "Child 2",
      kind: "ROOM",
      location_id: rootId,
    });
    const grandchildId = createEntity({
      name: "Grandchild",
      kind: "ROOM",
      location_id: child1Id,
    });

    (permissions.checkPermission as any).mockReturnValue(true);

    const descendants = await evaluate(["entity.descendants", rootId], ctx);
    expect(descendants).toContain(child1Id);
    expect(descendants).toContain(child2Id);
    expect(descendants).toContain(grandchildId);
    expect(descendants.length).toBe(3);
  });

  test("entity.descendants permission check", async () => {
    // 10 -> 11 -> 12
    const rootId = createEntity({ name: "Root", kind: "ROOM" });
    const childId = createEntity({
      name: "Child",
      kind: "ROOM",
      location_id: rootId,
    });
    createEntity({ name: "Grandchild", kind: "ROOM", location_id: childId });

    (permissions.checkPermission as any).mockImplementation(
      (_: any, target: any) => {
        if (target.id === childId) return false;
        return true;
      },
    );

    const descendants = await evaluate(["entity.descendants", rootId], ctx);
    // Should see 11 because we can view 10. But we cannot view inside 11, so 12 is excluded.
    expect(descendants).toEqual([childId]);
  });

  test("entity.ancestors", async () => {
    // 13 -> 11 -> 10 -> null
    const grandparentId = createEntity({ name: "Grandparent", kind: "ROOM" });
    const parentId = createEntity({
      name: "Parent",
      kind: "ROOM",
      location_id: grandparentId,
    });
    const childId = createEntity({
      name: "Child",
      kind: "ROOM",
      location_id: parentId,
    });

    const ancestors = await evaluate(["entity.ancestors", childId], ctx);
    expect(ancestors).toEqual([parentId, grandparentId]);
  });

  test("entity.verbs", async () => {
    const entityId = createEntity({ name: "Object", kind: "ITEM" });
    addVerb(entityId, "push", ["tell", "me", "pushed"]);
    addVerb(entityId, "pull", ["tell", "me", "pulled"]);

    (permissions.checkPermission as any).mockReturnValue(true);

    const verbs = await evaluate(["entity.verbs", entityId], ctx);
    expect(verbs).toContain("push");
    expect(verbs).toContain("pull");
    expect(verbs.length).toBe(2);
  });

  test("entity.verbs permission denied", async () => {
    const entityId = createEntity({ name: "Object", kind: "ITEM" });
    addVerb(entityId, "secret", []);

    (permissions.checkPermission as any).mockReturnValue(false);

    const verbs = await evaluate(["entity.verbs", entityId], ctx);
    expect(verbs).toEqual([]);
  });

  test("player.verbs", async () => {
    // Setup:
    // Player (has 'jump')
    // Room (has 'look')
    // Item in Inventory (has 'read')
    // Item in Room (has 'take')

    const roomId = createEntity({ name: "Room", kind: "ROOM" });
    addVerb(roomId, "look", []);

    const playerId = createEntity({
      name: "Player",
      kind: "ACTOR",
      location_id: roomId,
    });
    addVerb(playerId, "jump", []);

    const invItemId = createEntity({
      name: "Book",
      kind: "ITEM",
      location_id: playerId,
    });
    addVerb(invItemId, "read", []);

    const roomItemId = createEntity({
      name: "Sword",
      kind: "ITEM",
      location_id: roomId,
    });
    addVerb(roomItemId, "take", []);

    // Update context caller
    ctx.caller = { id: playerId, location_id: roomId } as any;

    (permissions.checkPermission as any).mockReturnValue(true);

    const verbs = await evaluate(["player.verbs"], ctx);

    // Check for presence of all verbs
    const verbNames = verbs.map((v: any) => v.name);
    expect(verbNames).toContain("jump");
    expect(verbNames).toContain("look");
    expect(verbNames).toContain("read");
    expect(verbNames).toContain("take");

    // Check sources
    const jump = verbs.find((v: any) => v.name === "jump");
    expect(jump.source).toBe(playerId);

    const look = verbs.find((v: any) => v.name === "look");
    expect(look.source).toBe(roomId);
  });
});
