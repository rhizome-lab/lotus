import { describe, it, expect, beforeEach } from "bun:test";
import { db } from "../db";
import {
  evaluate,
  registerLibrary,
  createScriptContext,
  ListLib,
  StringLib,
  ObjectLib,
  BooleanLib,
  StdLib,
} from "@viwo/scripting";
import * as Core from "./lib/core";
import * as Kernel from "./lib/kernel";
import { createEntity, getEntity, updateEntity, getVerb, addVerb, createCapability } from "../repo";
import { Entity } from "@viwo/shared/jsonrpc";
import { seed } from "../seed";

describe("Player Commands", () => {
  registerLibrary(StdLib);
  registerLibrary(Core);
  registerLibrary(ListLib);
  registerLibrary(StringLib);
  registerLibrary(ObjectLib);
  registerLibrary(BooleanLib);
  registerLibrary(Kernel);

  let player: Entity;
  let room: Entity;
  let send: (type: string, payload: unknown) => void;
  let sentMessages: any[] = [];

  beforeEach(() => {
    // Reset DB state
    db.query("DELETE FROM entities").run();
    db.query("DELETE FROM verbs").run();
    db.query("DELETE FROM sqlite_sequence").run();

    sentMessages = [];

    // Setup Sys Context
    // Setup Send
    send = (type: string, payload: unknown) => {
      if (type === "update") {
        // 'look' sends { entities: [room, ...contents] }.
        const p = payload as any;
        if (p.entities && p.entities.length > 0) {
          sentMessages.push(p.entities);
        } else {
          sentMessages.push(payload);
        }
      } else if (type === "message") {
        // 'inspect' can send 'update' or 'message' depending on implementation.
        sentMessages.push({ type, payload });
      } else {
        sentMessages.push(payload);
      }
    };

    // Seed DB (creates sys:player_base, Lobby, Guest, etc.)
    seed();

    // Get Guest Player
    const guest = db
      .query<Entity, []>("SELECT * FROM entities WHERE json_extract(props, '$.name') = 'Guest'")
      .get()!;
    player = getEntity(guest.id)!;
    // Make player admin to allow create/dig/set
    player["admin"] = true;
    updateEntity(player);

    // Grant capabilities
    createCapability(player.id, "sys.create", {});
    createCapability(player.id, "entity.control", { "*": true });

    room = getEntity(player["location"] as number)!;
  });

  const runCommand = async (command: string, args: readonly unknown[]) => {
    const freshPlayer = getEntity(player.id)!;
    const verb = getVerb(freshPlayer.id, command);
    if (!verb) throw new Error(`Verb ${command} not found on player`);
    return await evaluate(
      verb.code,
      createScriptContext({
        caller: freshPlayer,
        this: freshPlayer,
        args,
        send,
      }),
    );
  };

  it("should look at room", async () => {
    await runCommand("look", []);
    expect(sentMessages[0]?.[0]?.name).toEqual(room["name"]);
  });

  it("should inspect item", async () => {
    // Create item in room
    console.log("Creating Box...");
    const boxId = createEntity({ name: "Box", location: room.id });
    console.log(`Created Box with ID ${boxId}`);

    // Update room contents
    const freshRoom = getEntity(room.id)!;
    const contents = (freshRoom["contents"] as number[]) || [];
    contents.push(boxId);
    freshRoom["contents"] = contents;
    updateEntity(freshRoom);

    await runCommand("look", ["Box"]);
    expect(sentMessages.length).toBeGreaterThan(0);
    expect(Array.isArray(sentMessages[0])).toBe(true);
    expect(sentMessages[0].length).toBeGreaterThan(0);
    expect(sentMessages[0][0].name).toEqual("Box");
  });

  it("should check inventory", async () => {
    const backpackId = createEntity({
      name: "Leather Backpack",
      location: player.id,
    });
    const freshPlayer = getEntity(player.id)!;
    // 'inventory' verb uses 'contents' property.

    const contents = (freshPlayer["contents"] as number[]) || [];
    contents.push(backpackId);
    freshPlayer["contents"] = contents;
    updateEntity(freshPlayer);

    await runCommand("inventory", []);
    expect(sentMessages[0]?.[1]?.name).toEqual("Leather Backpack");
  });

  it("should move", async () => {
    const entityBase = db
      .query<{ id: number }, []>(
        "SELECT id FROM entities WHERE json_extract(props, '$.name') = 'Entity Base'",
      )
      .get()!;
    // Create start room
    const startRoomId = createEntity({ name: "Start Room" }, entityBase.id);
    // Move player to start room
    updateEntity({ ...player, location: startRoomId });
    player["location"] = startRoomId;
    room = getEntity(startRoomId)!;

    // Create another room
    const otherRoomId = createEntity({ name: "Other Room" }, entityBase.id);
    // Create exit
    const exitId = createEntity(
      {
        name: "north",
        location: startRoomId,
        direction: "north",
        destination: otherRoomId,
      },
      entityBase.id,
    );
    // Update start room with exit
    updateEntity({ ...room, exits: [exitId] });

    await runCommand("move", ["north"]);

    const updatedPlayer = getEntity(player.id)!;
    expect(updatedPlayer["location"]).toBe(otherRoomId);

    // Find the update message (array of entities)
    const updateMsg = sentMessages.find(
      (msg) => Array.isArray(msg) && msg[0]?.name === "Other Room",
    );
    expect(updateMsg).toBeDefined();
    expect(updateMsg![0].name).toBe("Other Room");
  });

  it("should dig", async () => {
    await runCommand("dig", ["south", "New Room"]);

    // Check if new room exists
    const newRoomId = db
      .query<{ id: number }, []>(
        "SELECT id FROM entities WHERE json_extract(props, '$.name') = 'New Room'",
      )
      .get()?.id;
    expect(newRoomId).toBeDefined();

    // Check if player moved
    const updatedPlayer = getEntity(player.id)!;
    expect(updatedPlayer["location"]).toBe(newRoomId);
  });

  it("should create item", async () => {
    const id = await runCommand("create", ["Rock"]);
    expect(id, "create should return item id").toBeDefined();
    const createdRock = getEntity(id as number);
    expect(createdRock, "created item should exist").toBeDefined();
    const roomUpdate = sentMessages.flat().find((m) => m.name === room["name"]);
    expect(roomUpdate, "created item should send room update").toBeDefined();
  });

  it("should set property", async () => {
    const itemId = createEntity({
      name: "Stone",
      location: room.id,
      weight: 10,
    });
    // Update room contents
    const contents = (room["contents"] as number[]) || [];
    contents.push(itemId);
    room["contents"] = contents;
    updateEntity(room);

    await runCommand("set", ["Stone", "weight", 20]);

    const updatedItem = getEntity(itemId)!;
    expect(updatedItem["weight"]).toBe(20);
  });
});

describe("Recursive Move Check", () => {
  registerLibrary(Core);
  registerLibrary(ListLib);
  registerLibrary(StringLib);
  registerLibrary(ObjectLib);

  let caller: Entity;
  let messages: unknown[] = [];
  let send: (type: string, payload: unknown) => void;

  beforeEach(() => {
    // Reset DB state
    db.query("DELETE FROM entities").run();
    db.query("DELETE FROM verbs").run();
    db.query("DELETE FROM sqlite_sequence").run();

    messages = [];

    // Setup Send
    send = (type: string, payload: unknown) => {
      if (type === "message") {
        messages.push(payload);
      }
    };

    // Seed Base
    seed();

    // Setup Caller (Player)
    const playerBase = db
      .query<{ id: number }, []>(
        "SELECT id FROM entities WHERE json_extract(props, '$.name') = 'Player Base'",
      )
      .get()!;

    // Create a room
    const voidEntity = db
      .query<{ id: number }, []>(
        "SELECT id FROM entities WHERE json_extract(props, '$.name') = 'The Void'",
      )
      .get()!;

    const callerId = createEntity({ name: "Player", location: voidEntity.id }, playerBase.id);
    caller = getEntity(callerId)!;
  });

  it("should prevent moving an entity into itself", async () => {
    // 1. Create a Box
    const entityBase = db
      .query<{ id: number }, []>(
        "SELECT id FROM entities WHERE json_extract(props, '$.name') = 'Entity Base'",
      )
      .get()!;

    const boxId = createEntity({ name: "Box", location: caller["location"] }, entityBase.id);
    // Add dummy look verb to Box since move calls it
    addVerb(boxId, "look", StdLib.let("dummy", 1));
    const box = getEntity(boxId)!;

    // 2. Create an Item inside the Box
    const itemId = createEntity({ name: "Item", location: boxId }, entityBase.id);

    // 3. Attempt to move Box into Item
    // 'move' verb on Entity Base moves the CALLER.
    // To test moving a box into an item, we simulate the Box acting as the caller.

    // Let's simulate the Box acting as the caller.
    const ctx = createScriptContext({
      caller: box,
      this: box, // The verb is on Entity Base, which Box inherits
      args: [getEntity(itemId)!], // Move to Item
      send,
    });

    const moveVerb = getVerb(entityBase.id, "teleport");
    expect(moveVerb).toBeDefined();

    await evaluate(moveVerb!.code, ctx);

    // 4. Assert failure
    const updatedBox = getEntity(box.id)!;

    // If it failed, Box should still be in the Void (caller.location)
    // If it succeeded (bug), Box would be in Item (itemId)
    expect(updatedBox["location"]).not.toBe(itemId);
    expect(updatedBox["location"]).toBe(caller["location"]);

    // Expect an error message
    expect(messages).toContain("You can't put something inside itself.");
  });
});
