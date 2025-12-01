import { describe, test, expect, beforeEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "./schema";

// Setup in-memory DB
const db = new Database(":memory:");
initSchema(db);

// Mock the db module
mock.module("./db", () => ({ db }));

import {
  evaluate,
  createScriptContext,
  registerLibrary,
} from "./scripting/interpreter";
import * as Core from "./scripting/lib/core";
import * as ObjectOp from "./scripting/lib/object";
import * as List from "./scripting/lib/list";
import { Entity } from "@viwo/shared/jsonrpc";
import { createEntity, getEntity, addVerb, updateEntity } from "./repo";
import { seed } from "./seed";

describe("Mailbox Verification", () => {
  registerLibrary(Core);
  registerLibrary(ObjectOp);
  registerLibrary(List);

  let sender: Entity;
  let receiver: Entity;
  let mailbox: Entity;
  let item: Entity;
  let system: Entity;

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

    // 1. Create Sender and Receiver
    const senderId = createEntity({ name: "Sender" });
    sender = getEntity(senderId)!;

    const receiverId = createEntity({ name: "Receiver" });
    receiver = getEntity(receiverId)!;

    // 2. Create Mailbox for Receiver
    const mailboxId = createEntity({
      name: "Receiver's Mailbox",
      owner: receiverId,
      permissions: {
        view: [receiverId], // Only receiver can view
        enter: [], // No manual entry
      },
    });
    mailbox = getEntity(mailboxId)!;

    // 3. Create Item to send
    const itemId = createEntity({
      name: "Letter",
      owner: senderId,
      location: senderId, // Held by sender
    });
    item = getEntity(itemId)!;
  });

  const check = async (actor: Entity, target: Entity, type: string) => {
    const callScript = Core["call"](
      Core["entity"](system.id),
      "can_edit",
      Core["entity"](actor.id),
      Core["entity"](target.id),
      type,
    );

    const ctx = createScriptContext({
      caller: actor,
      this: system,
      args: [],
    });
    return await evaluate(callScript, ctx);
  };

  test("should deny view permission to sender", async () => {
    expect(await check(sender, mailbox, "view")).toBe(false);
  });

  test("should allow view permission to receiver", async () => {
    expect(await check(receiver, mailbox, "view")).toBe(true);
  });

  test("should deny manual move (enter) to mailbox", async () => {
    expect(await check(sender, mailbox, "enter")).toBe(false);
  });

  test("should allow deposit via give opcode", async () => {
    // Define a 'give' verb on the system or base entity for testing purposes
    // Logic:
    // 1. Check if caller owns the item
    // 2. Update item location to destination
    // 3. Update item owner to destination's owner

    const giveVerb = Core["seq"](
      Core["let"]("item", Core["arg"](0)),
      Core["let"]("dest", Core["arg"](1)),
      Core["if"](
        Core["=="](
          ObjectOp["obj.get"](Core["var"]("item"), "owner"),
          ObjectOp["obj.get"](Core["caller"](), "id"),
        ),
        Core["seq"](
          Core["let"](
            "newOwner",
            ObjectOp["obj.get"](Core["var"]("dest"), "owner"),
          ),
          Core["set_entity"](
            ObjectOp["obj.merge"](
              Core["var"]("item"),
              ObjectOp["obj.new"](
                "location",
                ObjectOp["obj.get"](Core["var"]("dest"), "id"),
                "owner",
                Core["var"]("newOwner"),
              ),
            ),
          ),
          true,
        ),
        false,
      ),
    );

    addVerb(system.id, "give", giveVerb);

    const callGive = Core["call"](
      Core["entity"](system.id),
      "give",
      Core["entity"](item.id),
      Core["entity"](mailbox.id),
    );

    const ctx = createScriptContext({
      caller: sender,
      this: system,
      args: [],
    });

    const result = await evaluate(callGive, ctx);
    expect(result).toBe(true);

    const updatedItem = getEntity(item.id)!;
    expect(updatedItem["location"]).toBe(mailbox.id);
    expect(updatedItem["owner"]).toBe(receiver.id);
  });

  test("should hide contents from sender", async () => {
    // If we use 'look' or similar, it should filter.
    // For now, let's just verify that 'view' permission is denied, which implies
    // any properly implemented 'look' verb would hide it.
    // We already verified 'view' is denied in the first test.
    // Let's try to simulate a 'look' that respects permissions.

    const lookVerb = Core["seq"](
      Core["let"]("target", Core["arg"](0)),
      Core["if"](
        Core["call"](
          Core["entity"](system.id),
          "can_edit",
          Core["caller"](),
          Core["var"]("target"),
          "view",
        ),
        ObjectOp["obj.get"](
          Core["var"]("target"),
          "contents",
          List["list.new"](),
        ),
        List["list.new"](),
      ),
    );

    addVerb(system.id, "look_at", lookVerb);

    const callLook = Core["call"](
      Core["entity"](system.id),
      "look_at",
      Core["entity"](mailbox.id),
    );

    const ctx = createScriptContext({
      caller: sender,
      this: system,
      args: [],
    });

    const contents = await evaluate(callLook, ctx);
    expect(contents).toEqual([]);
  });

  test("should show contents to receiver", async () => {
    const lookVerb = Core["seq"](
      Core["let"]("target", Core["arg"](0)),
      Core["if"](
        Core["call"](
          Core["entity"](system.id),
          "can_edit",
          Core["caller"](),
          Core["var"]("target"),
          "view",
        ),
        ObjectOp["obj.get"](
          Core["var"]("target"),
          "contents",
          List["list.new"](),
        ),
        List["list.new"](),
      ),
    );

    addVerb(system.id, "look_at", lookVerb);

    const callLook = Core["call"](
      Core["entity"](system.id),
      "look_at",
      Core["entity"](mailbox.id),
    );

    const ctx = createScriptContext({
      caller: receiver,
      this: system,
      args: [],
    });

    // First put something in there so we can see it
    updateEntity({ ...item, location: mailbox.id });
    const mailboxEntity = getEntity(mailbox.id)!;
    const currentContents = (mailboxEntity["contents"] as number[]) || [];
    updateEntity({
      ...mailboxEntity,
      contents: [...currentContents, item.id],
    });

    const contents = await evaluate(callLook, ctx);
    expect(contents).toContain(item.id);
  });
});
