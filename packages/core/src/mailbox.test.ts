import { describe, it, expect, beforeAll, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "./schema";

// Setup in-memory DB
const db = new Database(":memory:");
initSchema(db);

// Mock the db module
mock.module("./db", () => ({ db }));

import { evaluate, registerLibrary } from "./scripting/interpreter";
import { WorldLibrary } from "./scripting/lib/world";
import { createEntity, getEntity } from "./repo";
import { checkPermission } from "./permissions";

describe("Mailbox Verification", () => {
  let senderId: number;
  let receiverId: number;
  let mailboxId: number;
  let itemId: number;

  beforeAll(() => {
    registerLibrary(WorldLibrary);

    // 1. Create Sender and Receiver
    senderId = createEntity({ name: "Sender", kind: "ACTOR" });
    receiverId = createEntity({ name: "Receiver", kind: "ACTOR" });

    // 2. Create Mailbox for Receiver
    mailboxId = createEntity({
      name: "Receiver's Mailbox",
      kind: "ITEM",
      owner_id: receiverId,
      props: {
        permissions: {
          view: [receiverId], // Only receiver can view
          enter: [], // No manual entry
        },
      },
    });

    // 3. Create Item to send
    itemId = createEntity({
      name: "Letter",
      kind: "ITEM",
      owner_id: senderId,
      location_id: senderId, // Held by sender
    });
  });

  it("should deny view permission to sender", () => {
    const canView = checkPermission(
      { id: senderId, props: {} } as any,
      {
        id: mailboxId,
        owner_id: receiverId,
        props: { permissions: { view: [receiverId] } },
      } as any,
      "view",
    );
    expect(canView).toBe(false);
  });

  it("should allow view permission to receiver", () => {
    const canView = checkPermission(
      { id: receiverId, props: {} } as any,
      {
        id: mailboxId,
        owner_id: receiverId,
        props: { permissions: { view: [receiverId] } },
      } as any,
      "view",
    );
    expect(canView).toBe(true);
  });

  it("should deny manual move (enter) to mailbox", async () => {
    // Sender tries to move item to mailbox directly
    const ctx = {
      caller: { id: senderId, props: {} } as any,
      this: { id: senderId, props: {} } as any,
      args: [],
      sys: {
        move: mock(() => {}),
      },
    } as any;

    // We need to mock evaluateTarget to return entities
    // But evaluateTarget uses import("../repo"), which uses mocked db. So it should work if we use real evaluateTarget?
    // But evaluateTarget is not exported from interpreter to be mocked easily, but we can use real evaluate.

    // Let's use evaluate with real entities in DB.
    // We need to make sure 'move' opcode checks permission.

    // We need to mock sys.move to NOT throw, but the opcode logic throws.
    // So we expect evaluate to throw ScriptError.

    try {
      await evaluate(["move", itemId, mailboxId], ctx);
      expect(true).toBe(false); // Should not reach here
    } catch (e: any) {
      expect(e.message).toContain("Permission denied");
    }
  });

  it("should allow deposit via give opcode", async () => {
    // We need to implement 'give' in sys for the test context
    let given = false;
    const ctx = {
      caller: { id: senderId, props: {} } as any, // Sender calls
      this: { id: mailboxId, props: {} } as any, // Context might be mailbox if calling deposit?
      // Actually, 'give' opcode is what we are testing.
      // Opcode: give(target, destination)
      args: [],
      sys: {
        give: (target: number, dest: number, owner: number) => {
          given = true;
          // Simulate what sys.give does
          const { updateEntity } = require("./repo");
          updateEntity(target, { location_id: dest, owner_id: owner });
        },
      },
    } as any;

    // Execute give
    await evaluate(["give", itemId, mailboxId], ctx);

    expect(given).toBe(true);

    // Verify item state
    const item = getEntity(itemId);
    expect(item?.location_id).toBe(mailboxId);
    expect(item?.owner_id).toBe(receiverId); // Ownership transferred to mailbox owner (receiver)
  });

  it("should hide contents from sender", async () => {
    // Sender tries to list contents of mailbox
    // entity.contents(mailbox)

    const ctx = {
      caller: { id: senderId, props: {} } as any,
      args: [],
      sys: {},
    } as any;

    const contents = await evaluate(["entity.contents", mailboxId], ctx);
    expect(contents).toEqual([]); // Should be empty because view denied
  });

  it("should show contents to receiver", async () => {
    const ctx = {
      caller: { id: receiverId, props: {} } as any,
      args: [],
      sys: {},
    } as any;

    const contents = await evaluate(["entity.contents", mailboxId], ctx);
    expect(contents).toContain(itemId);
  });
});
