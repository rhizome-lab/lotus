import * as CoreLib from "./runtime/lib/core";
import * as KernelLib from "./runtime/lib/kernel";
import {
  BooleanLib,
  ListLib,
  ObjectLib,
  StdLib,
  createScriptContext,
  evaluate,
} from "@viwo/scripting";
import { addVerb, createCapability, createEntity, getEntity, updateEntity } from "./repo";
import { beforeEach, describe, expect, test } from "bun:test";
import type { Entity } from "@viwo/shared/jsonrpc";
import { GameOpcodes } from "./runtime/opcodes";
import { db } from ".";
import { seed } from "./seed";

describe("Mailbox Verification", () => {
  let sender: Entity;
  let receiver: Entity;
  let mailbox: Entity;
  let item: Entity;
  let system: Entity;

  beforeEach(() => {
    // Reset DB state
    db.query("DELETE FROM entities").run();
    db.query("DELETE FROM verbs").run();
    db.query("DELETE FROM capabilities").run();
    db.query("DELETE FROM sqlite_sequence").run();

    // Seed (creates base entities)
    seed();

    // Get System Entity
    const systemRes = db
      .query<Entity, []>("SELECT * FROM entities WHERE json_extract(props, '$.name') = 'System'")
      .get();
    if (!systemRes) {
      throw new Error("System entity not found");
    }
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
    });
    mailbox = getEntity(mailboxId)!;
    // Receiver gets control of mailbox
    createCapability(receiverId, "entity.control", { target_id: mailboxId });

    // 3. Create Item to send
    const itemId = createEntity({
      location: senderId,
      name: "Letter",
      owner: senderId, // Held by sender
    });
    item = getEntity(itemId)!;
    // Sender gets control of item
    createCapability(senderId, "entity.control", { target_id: itemId });
  });

  const checkView = (actor: Entity, target: Entity) => {
    // Check if actor has entity.control for target
    const script = KernelLib.hasCapability(
      CoreLib.entity(actor.id),
      "entity.control",
      ObjectLib.objNew(["target_id", target.id]),
    );

    const ctx = createScriptContext({ args: [], caller: actor, ops: GameOpcodes, this: system });
    return evaluate(script, ctx);
  };

  test("should deny view permission to sender", async () => {
    expect(await checkView(sender, mailbox)).toBe(false);
  });

  test("should allow view permission to receiver", async () => {
    expect(await checkView(receiver, mailbox)).toBe(true);
  });

  test("should allow deposit via give opcode", async () => {
    // Logic: Check owner, update location, update owner.
    // NOTE: This logic assumes the 'give' verb handles the transfer logic
    // which usually requires the GIVER to have control of the ITEM,
    // and the RECEIVER (or destination) to accept it.
    // For simplicity here, we'll assume 'give' just moves it if the giver owns the item.

    const giveVerb = StdLib.seq(
      StdLib.let("item", StdLib.arg(0)),
      StdLib.let("dest", StdLib.arg(1)),
      StdLib.if(
        BooleanLib.eq(
          ObjectLib.objGet(StdLib.var("item"), "owner"),
          ObjectLib.objGet(StdLib.caller(), "id"),
        ),
        StdLib.seq(
          StdLib.let("newOwner", ObjectLib.objGet(StdLib.var("dest"), "owner")),
          StdLib.let(
            "cap",
            KernelLib.getCapability(
              "entity.control",
              ObjectLib.objNew(["target_id", ObjectLib.objGet(StdLib.var("item"), "id")]),
            ),
          ),
          CoreLib.setEntity(
            StdLib.var("cap"),
            StdLib.var("item"),
            ObjectLib.objNew(
              ["location", ObjectLib.objGet(StdLib.var("dest"), "id")],
              ["owner", StdLib.var("newOwner")],
            ),
          ),
          true,
        ),
        false,
      ),
    );

    addVerb(system.id, "give", giveVerb);

    const callGive = CoreLib.call(
      CoreLib.entity(system.id),
      "give",
      CoreLib.entity(item.id),
      CoreLib.entity(mailbox.id),
    );

    const ctx = createScriptContext({ args: [], caller: sender, ops: GameOpcodes, this: system });

    const result = await evaluate(callGive, ctx);
    expect(result).toBe(true);

    const updatedItem = getEntity(item.id)!;
    expect(updatedItem["location"]).toBe(mailbox.id);
    expect(updatedItem["owner"]).toBe(receiver.id);
  });

  test("should hide contents from sender", async () => {
    // Simulate a 'look' that respects permissions (needs capability).
    const lookVerb = StdLib.seq(
      StdLib.let("target", StdLib.arg(0)),
      StdLib.if(
        KernelLib.hasCapability(
          StdLib.caller(),
          "entity.control",
          ObjectLib.objNew(["target_id", ObjectLib.objGet(StdLib.var("target"), "id")]),
        ),
        ObjectLib.objGet(StdLib.var("target"), "contents", ListLib.listNew()),
        ListLib.listNew(),
      ),
    );

    addVerb(system.id, "look_at", lookVerb);

    const callLook = CoreLib.call(CoreLib.entity(system.id), "look_at", CoreLib.entity(mailbox.id));

    const ctx = createScriptContext({
      args: [],
      caller: sender,
      ops: GameOpcodes,
      this: system,
    });

    const contents = await evaluate(callLook, ctx);
    expect(contents).toEqual([]);
  });

  test("should show contents to receiver", async () => {
    const lookVerb = StdLib.seq(
      StdLib.let("target", StdLib.arg(0)),
      StdLib.if(
        KernelLib.hasCapability(
          StdLib.caller(),
          "entity.control",
          ObjectLib.objNew(["target_id", ObjectLib.objGet(StdLib.var("target"), "id")]),
        ),
        ObjectLib.objGet(StdLib.var("target"), "contents", ListLib.listNew()),
        ListLib.listNew(),
      ),
    );

    addVerb(system.id, "look_at", lookVerb);

    const callLook = CoreLib.call(CoreLib.entity(system.id), "look_at", CoreLib.entity(mailbox.id));

    const ctx = createScriptContext({ args: [], caller: receiver, ops: GameOpcodes, this: system });

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
