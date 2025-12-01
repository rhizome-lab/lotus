import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../schema";

// Setup in-memory DB
const db = new Database(":memory:");
initSchema(db);

// Mock the db module
mock.module("../db", () => ({ db }));

import { evaluate, registerLibrary, createScriptContext } from "./interpreter";
import * as Core from "./lib/core";
import * as List from "./lib/list";
import * as String from "./lib/string";
import * as Object from "./lib/object";
import { seed } from "../seed";
import { createEntity, getEntity, updateEntity, getVerb } from "../repo";
import { Entity } from "@viwo/shared/jsonrpc";

describe("Player Commands", () => {
  registerLibrary(Core);
  registerLibrary(List);
  registerLibrary(String);
  registerLibrary(Object);

  let player: Entity;
  let room: Entity;
  let send: (msg: unknown) => void;
  let sentMessages: any[] = [];

  beforeEach(() => {
    // Reset DB state
    db.query("DELETE FROM entities").run();
    db.query("DELETE FROM verbs").run();
    db.query("DELETE FROM sqlite_sequence").run();

    sentMessages = [];

    // Setup Sys Context
    // Setup Send
    send = (msg) => {
      sentMessages.push(msg);
    };

    // Seed DB (creates sys:player_base, Lobby, Guest, etc.)
    seed();

    // Get Guest Player
    const guest = db
      .query<Entity, []>(
        "SELECT * FROM entities WHERE json_extract(props, '$.name') = 'Guest'",
      )
      .get()!;
    player = getEntity(guest.id)!;
    room = getEntity(player["location"] as number)!;
  });

  const runCommand = async (command: string, args: readonly unknown[]) => {
    const verb = getVerb(player.id, command);
    if (!verb) throw new Error(`Verb ${command} not found on player`);
    return await evaluate(
      verb.code,
      createScriptContext({
        caller: player,
        this: player,
        args,
        send,
      }),
    );
  };

  it("should look at room", async () => {
    await runCommand("look", []);
    expect(sentMessages[0]?.name).toEqual(room["name"]);
  });

  it("should inspect item", async () => {
    // Create item in room
    createEntity({ name: "Box", location: room.id });

    await runCommand("look", ["Box"]);
    expect(sentMessages[0]?.name).toEqual("Box");
  });

  it("should check inventory", async () => {
    await runCommand("inventory", []);
    expect(sentMessages[0]?.[0]?.name).toEqual("Leather Backpack");
  });

  it("should move", async () => {
    // Create start room
    const startRoomId = createEntity({ name: "Start Room" });
    // Move player to start room
    updateEntity({ ...player, location: startRoomId });
    player["location"] = startRoomId;
    room = getEntity(startRoomId)!;

    // Create another room
    const otherRoomId = createEntity({ name: "Other Room" });
    // Create exit
    const exitId = createEntity({
      name: "north",
      location: startRoomId,
      direction: "north",
      destination: otherRoomId,
    });
    // Update start room with exit
    updateEntity({ ...room, exits: [exitId] });

    await runCommand("move", ["north"]);

    const updatedPlayer = getEntity(player.id)!;
    expect(updatedPlayer["location"]).toBe(otherRoomId);
    expect(sentMessages[0]?.name).toBe("Other Room");
  });

  it("should dig", async () => {
    await runCommand("dig", ["south", "New Room"]);

    // Check if new room exists
    const newRoomId = db
      .query<{ id: number }, []>(
        "SELECT id FROM entities WHERE json_extract(props, '$.name') = 'New Room'",
      )
      .get();
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
    expect(sentMessages[0]?.name, "created item should send room update").toBe(
      "Lobby",
    );
  });

  it("should set property", async () => {
    const itemId = createEntity({
      name: "Stone",
      location: room.id,
      weight: 10,
    });

    await runCommand("set", ["Stone", "weight", 20]);

    const updatedItem = getEntity(itemId)!;
    expect(updatedItem["weight"]).toBe(20);
  });
});
