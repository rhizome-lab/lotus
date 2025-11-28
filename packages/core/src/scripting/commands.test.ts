import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../schema";

// Setup in-memory DB
const db = new Database(":memory:");
initSchema(db);

// Mock the db module
mock.module("../db", () => ({ db }));

// Mock permissions
mock.module("../permissions", () => ({
  checkPermission: () => true,
}));

import { evaluate, ScriptSystemContext, registerLibrary } from "./interpreter";
import { ListLibrary } from "./lib/list";
import { StringLibrary } from "./lib/string";
import { ObjectLibrary } from "./lib/object";
import { WorldLibrary } from "./lib/world"; // Need world lib for world.find
import { seed } from "../seed";
import {
  createEntity,
  getEntity,
  updateEntity,
  deleteEntity,
  Entity,
  getVerb,
  getContents,
} from "../repo";
import { CoreLibrary } from "./lib/core";

describe("Player Commands", () => {
  // Register libraries
  registerLibrary(CoreLibrary);
  registerLibrary(ListLibrary);
  registerLibrary(StringLibrary);
  registerLibrary(ObjectLibrary);
  registerLibrary(WorldLibrary);

  let player: Entity;
  let room: Entity;
  let sys: ScriptSystemContext;
  let sentMessages: any[] = [];

  beforeEach(() => {
    // Reset DB state
    db.query("DELETE FROM entities").run();
    db.query("DELETE FROM verbs").run();
    db.query("DELETE FROM entity_data").run();
    db.query("DELETE FROM sqlite_sequence").run();

    sentMessages = [];

    // Setup Sys Context
    sys = {
      move: (id, dest) => {
        updateEntity(id, { location_id: dest });
        const e = getEntity(id);
        if (e) e.location_id = dest;
        if (player && player.id === id) {
          player.location_id = dest;
        }
      },
      create: createEntity,
      destroy: deleteEntity,
      getEntity: async (id) => getEntity(id),
      send: (msg) => {
        sentMessages.push(msg);
      },
      broadcast: (msg) => {
        sentMessages.push(msg);
      },
      canEdit: () => true,
      triggerEvent: async () => {},
      call: async (caller, targetId, verbName, args) => {
        const verb = getVerb(targetId, verbName);
        if (verb) {
          await evaluate(verb.code, {
            caller,
            this: getEntity(targetId)!,
            args,
            sys,
            warnings: [],
          });
        }
      },
      getContents: async (id) => getContents(id),
    };

    // Seed DB (creates sys:player_base, Lobby, Guest, etc.)
    seed();

    // Get Guest Player
    const guest = db
      .query("SELECT * FROM entities WHERE name = 'Guest'")
      .get() as any;
    player = getEntity(guest.id)!;
    room = getEntity(player.location_id!)!;
  });

  const runCommand = async (command: string, args: any[]) => {
    const verb = getVerb(player.id, command);
    if (!verb) throw new Error(`Verb ${command} not found on player`);
    return await evaluate(verb.code, {
      caller: player,
      this: player,
      args,
      sys,
      warnings: [],
    });
  };

  it("should look at room", async () => {
    await runCommand("look", []);
    expect(sentMessages[0]?.name).toEqual(room.name);
  });

  it("should inspect item", async () => {
    // Create item in room
    createEntity({
      name: "Box",
      kind: "ITEM",
      location_id: room.id,
    });

    await runCommand("look", ["Box"]);
    expect(sentMessages[0]?.name).toEqual("Box");
  });

  it("should check inventory", async () => {
    await runCommand("inventory", []);
    expect(sentMessages[0]?.[0]?.name).toEqual("Leather Backpack");
  });

  it("should move", async () => {
    // Create start room
    const startRoomId = createEntity({ name: "Start Room", kind: "ROOM" });
    // Move player to start room
    updateEntity(player.id, { location_id: startRoomId });
    player.location_id = startRoomId;
    room = getEntity(startRoomId)!;

    // Create another room
    const otherRoomId = createEntity({ name: "Other Room", kind: "ROOM" });
    // Create exit
    createEntity({
      name: "north",
      kind: "EXIT",
      location_id: startRoomId,
      props: { direction: "north", destination_id: otherRoomId },
    });

    await runCommand("move", ["north"]);

    const updatedPlayer = getEntity(player.id)!;
    expect(updatedPlayer.location_id).toBe(otherRoomId);
    expect(sentMessages).toContain("Other Room");
  });

  it("should dig", async () => {
    await runCommand("dig", ["south", "New Room"]);

    // Check if new room exists
    const allRooms = db
      .query("SELECT * FROM entities WHERE kind = 'ROOM'")
      .all() as any[];
    const newRoom = allRooms.find((r) => r.name === "New Room");
    expect(newRoom).toBeDefined();

    // Check if player moved
    const updatedPlayer = getEntity(player.id)!;
    expect(updatedPlayer.location_id).toBe(newRoom.id);
  });

  it("should create item", async () => {
    const id = await runCommand("create", ["Rock"]);
    expect(id, "create should return item id").toBeDefined();
    const createdRock = getEntity(id);
    expect(createdRock, "created item should exist").toBeDefined();
    expect(sentMessages, "created item should send room update").toContain(
      "Lobby",
    );
  });

  it("should set property", async () => {
    const itemId = createEntity({
      name: "Stone",
      kind: "ITEM",
      location_id: room.id,
      props: { weight: 10 },
    });

    await runCommand("set", ["Stone", "weight", 20]);

    const updatedItem = getEntity(itemId)!;
    expect(updatedItem.props["weight"]).toBe(20);
  });
});
