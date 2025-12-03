import { describe, test, expect, beforeEach } from "bun:test";
import {
  evaluate,
  createScriptContext,
  registerLibrary,
  StdLib as Std,
  ObjectLib,
  ListLib as List,
} from "@viwo/scripting";
import { Entity } from "@viwo/shared/jsonrpc";
import { createEntity, getEntity } from "./repo";
import { CoreLib, db } from ".";
import { seed } from "./seed";

describe("Scripted Permissions", () => {
  registerLibrary(Std);
  registerLibrary(ObjectLib);
  registerLibrary(List);

  let owner: Entity;
  let other: Entity;
  let admin: Entity;
  let item: Entity;
  let unownedItem: Entity;
  let publicItem: Entity;
  let sharedItem: Entity;
  let system: Entity;
  // let room: Entity;

  beforeEach(() => {
    // Reset DB state
    db.query("DELETE FROM entities").run();
    db.query("DELETE FROM verbs").run();
    db.query("DELETE FROM sqlite_sequence").run();

    // Seed (creates base entities)
    seed();

    // Get System Entity
    const systemRes = db
      .query<Entity, []>(
        "SELECT * FROM entities WHERE json_extract(props, '$.name') = 'System'",
      )
      .get();
    if (!systemRes) throw new Error("System entity not found");
    system = getEntity(systemRes.id)!;

    // Create Test Entities
    const ownerId = createEntity({ name: "Owner" });
    owner = getEntity(ownerId)!;

    const otherId = createEntity({ name: "Other" });
    other = getEntity(otherId)!;

    const adminId = createEntity({ name: "Admin", admin: true });
    admin = getEntity(adminId)!;

    const roomId = createEntity({ name: "Room", owner: ownerId });
    // room = getEntity(roomId)!;

    const itemId = createEntity({
      name: "Item",
      owner: ownerId,
      location: roomId,
    });
    item = getEntity(itemId)!;

    const unownedItemId = createEntity({
      name: "Unowned Item",
      owner: null,
      location: roomId,
    });
    unownedItem = getEntity(unownedItemId)!;

    const publicItemId = createEntity({
      name: "Public Item",
      owner: ownerId,
      permissions: { edit: true },
    });
    publicItem = getEntity(publicItemId)!;

    const sharedItemId = createEntity({
      name: "Shared Item",
      owner: ownerId,
      permissions: { edit: [otherId] },
    });
    sharedItem = getEntity(sharedItemId)!;
  });

  const check = (actor: Entity, target: Entity, type: string) => {
    // Construct a script to call sys.can_edit(actor, target, type)
    const callScript = CoreLib["call"](
      CoreLib["entity"](system.id),
      "can_edit",
      CoreLib["entity"](actor.id),
      CoreLib["entity"](target.id),
      type,
    );

    const ctx = createScriptContext({
      caller: actor,
      this: system,
      args: [],
    });
    return evaluate(callScript, ctx);
  };

  test("Admin Access", () => {
    expect(check(admin, item, "edit")).toBe(true);
  });

  test("Owner Access", () => {
    expect(check(owner, item, "edit")).toBe(true);
    expect(check(other, item, "edit")).toBe(false);
  });

  test("Public Access", () => {
    expect(check(other, publicItem, "edit")).toBe(true);
  });

  test("Shared Access", () => {
    expect(check(other, sharedItem, "edit")).toBe(true);
    expect(check(admin, sharedItem, "edit")).toBe(true); // Admin still works
    // Create a third user
    const thirdId = createEntity({ name: "Third" });
    const third = getEntity(thirdId)!;
    expect(check(third, sharedItem, "edit")).toBe(false);
  });

  test("Cascading Access", () => {
    // Unowned item in room owned by owner
    expect(check(owner, unownedItem, "edit")).toBe(true);
    expect(check(other, unownedItem, "edit")).toBe(false);
  });
});
