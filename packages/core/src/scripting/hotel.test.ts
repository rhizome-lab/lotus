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

import {
  evaluate,
  ScriptSystemContext,
  registerLibrary,
  createScriptContext,
  ScriptError,
} from "./interpreter";
import * as Core from "./lib/core";
import * as List from "./lib/list";
import * as String from "./lib/string";
import * as Object from "./lib/object";
import { seedHotel } from "../seeds/hotel";
import {
  createEntity,
  getEntity,
  updateEntity,
  Entity,
  getVerb,
  getVerbs,
} from "../repo";

describe("Hotel Scripting", () => {
  registerLibrary(Core);
  registerLibrary(List);
  registerLibrary(String);
  registerLibrary(Object);

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

    // Setup Sys Context
    sys = {
      send: (msg: any) => {
        if (msg.type === "message") {
          messages.push(msg.text);
        }
      },
      call: async (caller, targetId, verbName, args, warnings) => {
        const target = getEntity(targetId);
        if (!target) {
          throw new ScriptError(`Target ${targetId} not found`);
        }
        const verbs = getVerbs(targetId);
        const verb = verbs.find((v) => v.name === verbName);
        if (!verb) {
          throw new ScriptError(`Verb ${verbName} not found on ${targetId}`);
        }
        return await evaluate(
          verb.code,
          createScriptContext({
            caller,
            this: target,
            args,
            sys,
            warnings,
          }),
        );
      },
    };

    // Setup Environment
    const lobbyId = createEntity({ name: "Main Lobby", kind: "ROOM" });
    const voidId = 0;

    // Seed Hotel
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

  it("should leave a room (move and destroy)", async () => {
    // 1. Manually create a room (since visit is gone)
    const roomProto = db
      .query("SELECT id FROM entities WHERE name = 'Hotel Room Prototype'")
      .get() as any;
    const roomId = createEntity({
      name: "Room 101",
      kind: "ROOM",
      prototype_id: roomProto.id,
      props: { lobby_id: hotelLobby.id },
    });

    // Move caller to room
    updateEntity({ ...caller, location: roomId });
    caller = getEntity(caller.id)!;

    // Clear messages
    messages = [];

    // 2. Leave
    const leaveVerb = getVerb(roomId, "leave");
    expect(leaveVerb).toBeDefined();

    await evaluate(
      leaveVerb!.code,
      createScriptContext({ caller, this: getEntity(roomId)!, sys }),
    );

    expect(messages[0]).toBe(
      "You leave the room and it fades away behind you.",
    );

    caller = getEntity(caller.id)!;
    expect(caller["location"]).toBe(hotelLobby.id); // Back in lobby
    expect(getEntity(roomId)).toBeNull(); // Destroyed
  });

  it("should navigate elevator -> floor lobby -> wing -> room and back", async () => {
    // Find Elevator (it's persistent)
    const allEntities = db
      .query("SELECT id, name FROM entities")
      .all() as any[];
    const elevatorData = allEntities.find((e) => e.name === "Hotel Elevator");
    let elevator = getEntity(elevatorData.id)!;
    expect(elevator).toBeDefined();

    // 0. Enter Hotel Lobby (from Main Lobby)
    // Caller starts in Hotel Lobby from beforeEach

    // 1. Enter Elevator
    updateEntity({ ...caller, location: elevator.id });
    caller = getEntity(caller.id)!; // Refresh

    const ctx = {
      caller,
      this: elevator,
      args: [],
      warnings: [],
      sys,
    } as any; // Cast to any to avoid strict type checks on sys if needed, or ScriptContext

    // 2. Push 5
    const pushVerb = getVerb(elevator.id, "push");
    expect(pushVerb).toBeDefined();
    if (pushVerb) {
      await evaluate(pushVerb.code, { ...ctx, this: elevator, args: [5] });
    }

    // Verify state
    elevator = getEntity(elevator.id)!;
    expect(elevator["current_floor"]).toBe(5);

    // 3. Out (to Floor 5 Lobby)
    const outVerb = getVerb(elevator.id, "out");
    expect(outVerb).toBeDefined();
    if (outVerb) {
      await evaluate(outVerb.code, { ...ctx, this: elevator, args: [] });
    }

    caller = getEntity(caller.id)!;
    const floorLobbyId = caller["location_id"];
    expect(floorLobbyId).not.toBe(elevator.id);
    const floorLobby = getEntity(floorLobbyId as never)!;
    expect(floorLobby["name"]).toBe("Floor 5 Lobby");

    // 4. West (to West Wing)
    const westVerb = getVerb(floorLobby.id, "west");
    expect(westVerb).toBeDefined();
    if (westVerb) {
      await evaluate(westVerb.code, { ...ctx, this: floorLobby, args: [] });
    }

    caller = getEntity(caller.id)!;
    const wingId = caller["location_id"];
    const wing = getEntity(wingId as never)!;
    expect(wing["name"]).toBe("Floor 5 West Wing");

    // 5. Enter 5 (to Room)
    const enterVerb = getVerb(wing.id, "enter");
    expect(enterVerb).toBeDefined();
    if (enterVerb) {
      await evaluate(enterVerb.code, { ...ctx, this: wing, args: ["5"] });
    }

    caller = getEntity(caller.id)!;
    const roomId = caller["location_id"];
    const room = getEntity(roomId as never)!;
    expect(room["name"]).toBe("Room 5");

    // Verify furnishings
    const contents = room["contents"] as Entity[];
    expect(contents.some((e) => e["name"] === "Bed")).toBe(true);
    expect(contents.some((e) => e["name"] === "Lamp")).toBe(true);
    expect(contents.some((e) => e["name"] === "Chair")).toBe(true);

    // 6. Leave (back to Wing)
    const leaveVerb = getVerb(room.id, "leave");
    expect(leaveVerb).toBeDefined();
    if (leaveVerb) {
      await evaluate(leaveVerb.code, { ...ctx, this: room, args: [] });
    }

    caller = getEntity(caller.id)!;
    expect(caller["location_id"]).toBe(wingId);
    expect(getEntity(roomId as never)).toBeNull(); // Room destroyed

    // Verify furnishings destroyed (by checking if they exist in DB)
    // Since we don't have IDs, we can check count of entities or just assume if room is gone and we used destroy, they are gone.
    // But we implemented explicit destroy loop.
    // Let's check if any "Bed" exists that was in that room.
    // Actually, since we are in-memory and reset DB, we can check total entity count or query by name.
    // But simpler: just trust the script logic if test passes.
    // Or we can capture IDs before leaving.
    const bed = contents.find((e) => e["name"] === "Bed")!;
    expect(getEntity(bed.id)).toBeNull();

    // 7. Back (back to Floor Lobby)
    const backVerb = getVerb(wing.id, "back");
    expect(backVerb).toBeDefined();
    if (backVerb) {
      await evaluate(backVerb.code, { ...ctx, this: wing, args: [] });
    }

    caller = getEntity(caller.id)!;
    expect(caller["location_id"]).toBe(floorLobbyId);
    expect(getEntity(wingId as never)).toBeNull(); // Wing destroyed

    // 8. Elevator (back to Elevator)
    const elevatorVerb = getVerb(floorLobby.id, "elevator");
    expect(elevatorVerb).toBeDefined();
    if (elevatorVerb) {
      await evaluate(elevatorVerb.code, { ...ctx, this: floorLobby, args: [] });
    }

    caller = getEntity(caller.id)!;
    expect(caller["location_id"]).toBe(elevator.id);
    expect(getEntity(floorLobbyId as never)).toBeNull(); // Lobby destroyed
  });
});
