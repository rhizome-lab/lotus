import { describe, test, expect, beforeEach } from "bun:test";
import { BooleanLib, StdLib as Std } from "@viwo/scripting";
import {
  evaluate,
  createScriptContext,
  registerLibrary,
  ObjectLib as Object,
  ListLib as List,
} from "@viwo/scripting";
import { Entity } from "@viwo/shared/jsonrpc";
import { createEntity, getEntity, addVerb, updateEntity, createCapability } from "./repo";
import { CoreLib, db } from ".";
import * as KernelLib from "./runtime/lib/kernel";
import { seed } from "./seed";

describe("Mailbox Verification", () => {
  registerLibrary(Std);
  registerLibrary(Object);
  registerLibrary(List);
  registerLibrary(CoreLib);
  registerLibrary(KernelLib);

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
    });
    mailbox = getEntity(mailboxId)!;
    // Receiver gets control of mailbox
    createCapability(receiverId, "entity.control", { target_id: mailboxId });

    // 3. Create Item to send
    const itemId = createEntity({
      name: "Letter",
      owner: senderId,
      location: senderId, // Held by sender
    });
    item = getEntity(itemId)!;
    // Sender gets control of item
    createCapability(senderId, "entity.control", { target_id: itemId });
  });

  const checkView = (actor: Entity, target: Entity) => {
    // Check if actor has entity.control for target
    const script = KernelLib["has_capability"](
      CoreLib["entity"](actor.id),
      "entity.control",
      Object["obj.new"](["target_id", target.id]),
    );

    const ctx = createScriptContext({
      caller: actor,
      this: system,
      args: [],
    });
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

    const giveVerb = Std["seq"](
      Std["let"]("item", Std["arg"](0)),
      Std["let"]("dest", Std["arg"](1)),
      Std["if"](
        BooleanLib["=="](
          Object["obj.get"](Std["var"]("item"), "owner"),
          Object["obj.get"](Std["caller"](), "id"),
        ),
        Std["seq"](
          Std["let"]("newOwner", Object["obj.get"](Std["var"]("dest"), "owner")),
          Std["let"](
            "cap",
            KernelLib["get_capability"](
              "entity.control",
              Object["obj.new"](["target_id", Object["obj.get"](Std["var"]("item"), "id")]),
            ),
          ),
          CoreLib["set_entity"](
            Std["var"]("cap"),
            Object["obj.merge"](
              Std["var"]("item"),
              Object["obj.new"](
                ["location", Object["obj.get"](Std["var"]("dest"), "id")],
                ["owner", Std["var"]("newOwner")],
              ),
            ),
          ),
          true,
        ),
        false,
      ),
    );

    addVerb(system.id, "give", giveVerb);

    const callGive = CoreLib["call"](
      CoreLib["entity"](system.id),
      "give",
      CoreLib["entity"](item.id),
      CoreLib["entity"](mailbox.id),
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
    // Simulate a 'look' that respects permissions (needs capability).
    const lookVerb = Std["seq"](
      Std["let"]("target", Std["arg"](0)),
      Std["if"](
        KernelLib["has_capability"](
          Std["caller"](),
          "entity.control",
          Object["obj.new"](["target_id", Object["obj.get"](Std["var"]("target"), "id")]),
        ),
        Object["obj.get"](Std["var"]("target"), "contents", List["list.new"]()),
        List["list.new"](),
      ),
    );

    addVerb(system.id, "look_at", lookVerb);

    const callLook = CoreLib["call"](
      CoreLib["entity"](system.id),
      "look_at",
      CoreLib["entity"](mailbox.id),
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
    const lookVerb = Std["seq"](
      Std["let"]("target", Std["arg"](0)),
      Std["if"](
        KernelLib["has_capability"](
          Std["caller"](),
          "entity.control",
          Object["obj.new"](["target_id", Object["obj.get"](Std["var"]("target"), "id")]),
        ),
        Object["obj.get"](Std["var"]("target"), "contents", List["list.new"]()),
        List["list.new"](),
      ),
    );

    addVerb(system.id, "look_at", lookVerb);

    const callLook = CoreLib["call"](
      CoreLib["entity"](system.id),
      "look_at",
      CoreLib["entity"](mailbox.id),
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
