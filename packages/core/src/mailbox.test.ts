import { describe, test, expect, beforeEach } from "bun:test";
import { BooleanLib, StdLib as Std } from "@viwo/scripting";
import {
  evaluate,
  createScriptContext,
  registerLibrary,
  ObjectLib,
  ListLib as List,
} from "@viwo/scripting";
import { Entity } from "@viwo/shared/jsonrpc";
import { createEntity, getEntity, addVerb, updateEntity } from "./repo";
import { CoreLib, db } from ".";
import * as KernelLib from "./runtime/lib/kernel";
import { seed } from "./seed";

describe("Mailbox Verification", () => {
  registerLibrary(Std);
  registerLibrary(ObjectLib);
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

  const check = (actor: Entity, target: Entity, type: string) => {
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

  test("should deny view permission to sender", () => {
    expect(check(sender, mailbox, "view")).toBe(false);
  });

  test("should allow view permission to receiver", () => {
    expect(check(receiver, mailbox, "view")).toBe(true);
  });

  test("should deny manual move (enter) to mailbox", () => {
    expect(check(sender, mailbox, "enter")).toBe(false);
  });

  test("should allow deposit via give opcode", async () => {
    // Logic: Check owner, update location, update owner.

    const giveVerb = Std["seq"](
      Std["let"]("item", Std["arg"](0)),
      Std["let"]("dest", Std["arg"](1)),
      Std["if"](
        BooleanLib["=="](
          ObjectLib["obj.get"](Std["var"]("item"), "owner"),
          ObjectLib["obj.get"](Std["caller"](), "id"),
        ),
        Std["seq"](
          Std["let"](
            "newOwner",
            ObjectLib["obj.get"](Std["var"]("dest"), "owner"),
          ),
          Std["let"](
            "cap",
            KernelLib["get_capability"](
              "entity.control",
              ObjectLib["obj.new"]([
                "target_id",
                ObjectLib["obj.get"](Std["var"]("item"), "id"),
              ]),
            ),
          ),
          CoreLib["set_entity"](
            Std["var"]("cap"),
            ObjectLib["obj.merge"](
              Std["var"]("item"),
              ObjectLib["obj.new"](
                ["location", ObjectLib["obj.get"](Std["var"]("dest"), "id")],
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

  test("should hide contents from sender", () => {
    // Simulate a 'look' that respects permissions.

    const lookVerb = Std["seq"](
      Std["let"]("target", Std["arg"](0)),
      Std["if"](
        CoreLib["call"](
          CoreLib["entity"](system.id),
          "can_edit",
          Std["caller"](),
          Std["var"]("target"),
          "view",
        ),
        ObjectLib["obj.get"](
          Std["var"]("target"),
          "contents",
          List["list.new"](),
        ),
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

    const contents = evaluate(callLook, ctx);
    expect(contents).toEqual([]);
  });

  test("should show contents to receiver", () => {
    const lookVerb = Std["seq"](
      Std["let"]("target", Std["arg"](0)),
      Std["if"](
        CoreLib["call"](
          CoreLib["entity"](system.id),
          "can_edit",
          Std["caller"](),
          Std["var"]("target"),
          "view",
        ),
        ObjectLib["obj.get"](
          Std["var"]("target"),
          "contents",
          List["list.new"](),
        ),
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

    const contents = evaluate(callLook, ctx);
    expect(contents).toContain(item.id);
  });
});
