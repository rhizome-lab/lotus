import { describe, it, expect, beforeEach } from "bun:test";
import { evaluate } from "./interpreter";
import { registerListLibrary } from "./lib/list";
import { registerStringLibrary } from "./lib/string";
import { registerObjectLibrary } from "./lib/object";
import { registerOpcode } from "./interpreter";
import { Entity } from "../repo";

describe("Hotel Scripting", () => {
  let lobby: Entity;
  let proto: Entity;
  let caller: Entity;
  let messages: string[] = [];
  let entities: Record<number, Entity> = {};
  let nextId = 100;

  beforeEach(() => {
    messages = [];
    entities = {};
    nextId = 100;

    // Register libraries
    registerListLibrary();
    registerStringLibrary();
    registerObjectLibrary();

    // Mock system opcodes
    registerOpcode("tell", async (args, ctx) => {
      const [targetExpr, msgExpr] = args;
      if (targetExpr === "caller") {
        const msg = await evaluate(msgExpr, ctx);
        messages.push(msg);
      }
      return null;
    });

    registerOpcode("move", async (args, ctx) => {
      const [targetExpr, destExpr] = args;
      let target = await evaluate(targetExpr, ctx);
      let dest = await evaluate(destExpr, ctx);

      if (target === "caller") target = ctx.caller;
      if (target === "this") target = ctx.this;
      if (dest === "caller") dest = ctx.caller;
      if (dest === "this") dest = ctx.this;

      const targetEntity = target?.id ? target : entities[target];
      const destEntity = dest?.id ? dest : entities[dest];

      if (targetEntity && destEntity) {
        targetEntity.location_id = destEntity.id;
      }
      return true;
    });

    registerOpcode("create", async (args, ctx) => {
      const [dataExpr] = args;
      const data = await evaluate(dataExpr, ctx);
      const id = nextId++;
      entities[id] = {
        id,
        name: data.name,
        kind: data.kind,
        prototype_id: data.prototype_id,
        props: data.props || {},
        location_id: data.location_id,
      } as any;
      return id;
    });

    registerOpcode("destroy", async (args, ctx) => {
      const [targetExpr] = args;
      let target = await evaluate(targetExpr, ctx);
      if (target === "this") target = ctx.this;

      if (target && target.id) {
        delete entities[target.id];
      }
      return true;
    });

    registerOpcode("prop", async (args, ctx) => {
      const [targetExpr, keyExpr] = args;
      const key = await evaluate(keyExpr, ctx);
      let target = await evaluate(targetExpr, ctx);

      if (target === "this") target = ctx.this;
      if (target === "caller") target = ctx.caller;

      if (target && target.props) {
        return target.props[key];
      }
      return null;
    });

    // Setup Lobby
    lobby = {
      id: 1,
      name: "Lobby",
      kind: "ROOM",
      props: {},
    } as any;
    entities[1] = lobby;

    // Setup Prototype
    proto = {
      id: 2,
      name: "Room Proto",
      kind: "ROOM",
      props: {},
    } as any;
    entities[2] = proto;

    // Setup Caller
    caller = {
      id: 3,
      name: "Guest",
      kind: "ACTOR",
      location_id: 1,
      props: {},
    } as any;
    entities[3] = caller;
  });

  it("should visit a room (create and move)", async () => {
    const script = [
      "seq",
      ["let", "roomNum", ["arg", 0]],
      ["let", "roomData", {}],
      [
        "obj.set",
        ["var", "roomData"],
        "name",
        ["str.concat", "Room ", ["var", "roomNum"]],
      ],
      ["obj.set", ["var", "roomData"], "kind", "ROOM"],
      ["obj.set", ["var", "roomData"], "prototype_id", 2],

      ["let", "props", {}],
      [
        "obj.set",
        ["var", "props"],
        "description",
        ["str.concat", "You are in room ", ["var", "roomNum"]],
      ],
      ["obj.set", ["var", "props"], "lobby_id", 1],

      ["obj.set", ["var", "roomData"], "props", ["var", "props"]],

      ["let", "roomId", ["create", ["var", "roomData"]]],
      ["move", "caller", ["var", "roomId"]],
      [
        "tell",
        "caller",
        ["str.concat", "You enter Room ", ["var", "roomNum"], "."],
      ],
    ];

    await evaluate(script, {
      caller,
      this: lobby,
      args: ["101"],
      warnings: [],
    });

    expect(messages[0]).toBe("You enter Room 101.");
    expect(caller.location_id).not.toBe(1); // Moved out of lobby
    const newRoomId = caller.location_id!;
    expect(entities[newRoomId]).toBeDefined();
    expect(entities[newRoomId]!.name).toBe("Room 101");
    expect(entities[newRoomId]!.props["lobby_id"]).toBe(1);
  });

  it("should leave a room (move and destroy)", async () => {
    // Manually create a room first
    const roomId = 101;
    const room = {
      id: roomId,
      name: "Room 101",
      kind: "ROOM",
      prototype_id: 2,
      props: { lobby_id: 1 },
    } as any;
    entities[roomId] = room;
    caller.location_id = roomId;

    const script = [
      "seq",
      ["let", "lobbyId", ["prop", "this", "lobby_id"]],
      ["move", "caller", ["var", "lobbyId"]],
      ["tell", "caller", "You leave."],
      ["destroy", "this"],
    ];

    // Mock evaluateTarget for "this" to return the room entity
    // In real interpreter, "this" is passed in ctx.
    await evaluate(script, { caller, this: room, args: [], warnings: [] });

    expect(messages[0]).toBe("You leave.");
    expect(caller.location_id).toBe(1); // Back in lobby
    expect(entities[roomId]).toBeUndefined(); // Destroyed
  });
});
