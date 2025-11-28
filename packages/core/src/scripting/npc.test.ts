import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../schema";

// Setup in-memory DB
const db = new Database(":memory:");
initSchema(db);

// Mock the db module
mock.module("../db", () => ({ db }));

// Mock permissions to allow everything
mock.module("../permissions", () => ({
  checkPermission: () => true,
}));

import { evaluate, ScriptSystemContext, registerLibrary } from "./interpreter";
import { ListLibrary } from "./lib/list";
import { StringLibrary } from "./lib/string";
import { ObjectLibrary } from "./lib/object";
import { seedHotel } from "../seeds/hotel";
import {
  createEntity,
  getEntity,
  updateEntity,
  deleteEntity,
  Entity,
  getVerb,
  getContents,
} from "../repo";

describe("NPC Interactions", () => {
  let hotelLobby: Entity;
  let caller: Entity;
  let messages: string[] = [];
  let sys: ScriptSystemContext;

  beforeEach(() => {
    // Reset DB state
    db.query("DELETE FROM entities").run();
    db.query("DELETE FROM verbs").run();
    db.query("DELETE FROM entity_data").run();
    db.query("DELETE FROM sqlite_sequence").run();

    messages = [];

    // Register libraries
    registerLibrary(ListLibrary);
    registerLibrary(StringLibrary);
    registerLibrary(ObjectLibrary);

    // Setup Sys Context
    sys = {
      move: (id, dest) => {
        updateEntity(id, { location_id: dest });
        if (caller && caller.id === id) {
          caller.location_id = dest;
        }
      },
      create: createEntity,
      destroy: deleteEntity,
      send: (msg: any) => {
        messages.push(msg.text);
      },
      broadcast: (msg: any) => {
        messages.push(msg);
      },
      triggerEvent: async (eventName, locationId, args, excludeEntityId) => {
        const contents = getContents(locationId);
        const room = getEntity(locationId);
        const entities = room ? [room, ...contents] : contents;

        for (const entity of entities) {
          if (excludeEntityId && entity.id === excludeEntityId) continue;

          const verb = getVerb(entity.id, eventName);
          if (verb) {
            await evaluate(verb.code, {
              caller: entity, // The entity running the script is the caller/agent
              this: entity,
              args: args,
              gas: 500,
              sys,
              warnings: [],
            });
          }
        }
      },
    };

    // Setup Environment
    const lobbyId = createEntity({ name: "Main Lobby", kind: "ROOM" });
    const voidId = 0;

    // Seed Hotel (includes NPCs)
    seedHotel(lobbyId, voidId);

    // Find Hotel Lobby
    const allEntities = db
      .query("SELECT id, name FROM entities")
      .all() as any[];
    const hotelLobbyData = allEntities.find(
      (e) => e.name === "Grand Hotel Lobby",
    );
    hotelLobby = getEntity(hotelLobbyData.id)!;

    // Setup Caller
    const callerId = createEntity({
      name: "Guest",
      kind: "ACTOR",
      location_id: hotelLobby.id,
    });
    caller = getEntity(callerId)!;
  });

  it("Golem should echo messages", async () => {
    // Simulate 'tell' command logic
    const msg = "Hello World";

    if (!caller.location_id) throw new Error("Caller has no location");

    // 1. Send message (Player tells)
    // sys.send is mocked to push to messages, but here we check Golem's response.
    // The player's "You tell..." message is handled by index.ts, not here.
    messages.push(`Guest tells Stone Golem: "${msg}"`);

    // 2. Trigger on_hear on Golem (Direct tell)
    await sys.triggerEvent!(
      "on_hear",
      caller.location_id,
      [msg, caller.id, "tell"], // Type is "tell"
      caller.id,
    );

    // Expect Golem to echo
    expect(messages).toContain('Guest tells Stone Golem: "Hello World"');
    expect(messages).toContain('Stone Golem says: "Golem echoes: Hello World"');
  });

  it("Receptionist should respond to 'room'", async () => {
    const msg = "I need a room";

    if (!caller.location_id) throw new Error("Caller has no location");

    sys.broadcast!(`${caller.name} says: "${msg}"`); // 1. Broadcast message
    // 2. Trigger on_hear
    await sys.triggerEvent!(
      "on_hear",
      caller.location_id,
      [msg, caller.id, "say"], // Type is "say"
      caller.id,
    );

    expect(messages).toContain(
      'Receptionist says: "We have lovely rooms available on floors 1-100. Just use the elevator!"',
    );
  });

  it("Receptionist should respond to 'hello'", async () => {
    const msg = "Hello there";

    if (!caller.location_id) throw new Error("Caller has no location");

    sys.broadcast!(`${caller.name} says: "${msg}"`, caller.location_id);
    await sys.triggerEvent!(
      "on_hear",
      caller.location_id,
      [msg, caller.id],
      caller.id,
    );

    expect(messages).toContain(
      'Receptionist says: "Welcome to the Grand Hotel! How may I help you?"',
    );
  });
});
