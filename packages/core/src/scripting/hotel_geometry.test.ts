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

import { evaluate, ScriptContext, ScriptSystemContext } from "./interpreter";
import { registerObjectLibrary } from "./lib/object";
import { registerStringLibrary } from "./lib/string";
import { registerListLibrary } from "./lib/list";
import { seedHotel } from "../seeds/hotel";
import {
  createEntity,
  getEntity,
  updateEntity,
  deleteEntity,
  Entity,
  getVerb,
} from "../repo";

describe("Hotel Geometry Scripting", () => {
  let caller: Entity;
  let elevator: Entity;
  let hotelLobby: Entity;
  let lobbyId: number;
  let sys: ScriptSystemContext;

  beforeEach(() => {
    // Reset DB state (truncate tables)
    db.query("DELETE FROM entities").run();
    db.query("DELETE FROM verbs").run();
    db.query("DELETE FROM entity_data").run();
    db.query("DELETE FROM sqlite_sequence").run(); // Reset auto-increment

    registerStringLibrary();
    registerListLibrary();
    registerObjectLibrary();

    // Setup Sys Context
    sys = {
      move: (id, dest) => {
        updateEntity(id, { location_id: dest });
        // Update caller if it's the one moving
        if (caller && caller.id === id) {
          caller.location_id = dest;
        }
      },
      create: createEntity,
      destroy: deleteEntity,
      send: () => {},
    };

    // Setup Environment
    const voidId = 0;

    // Create Main Lobby
    lobbyId = createEntity({ name: "Main Lobby", kind: "ROOM" });

    // Create Caller
    const callerId = createEntity({
      name: "Guest",
      kind: "ACTOR",
      location_id: lobbyId,
    });
    caller = getEntity(callerId)!;

    // Seed Hotel
    seedHotel(lobbyId, voidId);

    // Find Entities
    const allEntities = db
      .query("SELECT id, name FROM entities")
      .all() as any[];
    const hotelLobbyData = allEntities.find(
      (e) => e.name === "Grand Hotel Lobby",
    );
    const elevatorData = allEntities.find((e) => e.name === "Hotel Elevator");

    hotelLobby = getEntity(hotelLobbyData.id)!;
    elevator = getEntity(elevatorData.id)!;
  });

  it("should navigate elevator -> floor lobby -> wing -> room and back", async () => {
    expect(hotelLobby).toBeDefined();
    expect(elevator).toBeDefined();

    // 0. Enter Hotel Lobby (from Main Lobby)
    updateEntity(caller.id, { location_id: hotelLobby.id });
    caller = getEntity(caller.id)!; // Refresh

    // 1. Enter Elevator
    updateEntity(caller.id, { location_id: elevator.id });
    caller = getEntity(caller.id)!; // Refresh

    const ctx = {
      caller,
      this: elevator,
      args: [],
      warnings: [],
      sys,
    } as ScriptContext;

    // 2. Push 5
    const pushVerb = getVerb(elevator.id, "push");
    expect(pushVerb).toBeDefined();
    if (pushVerb) {
      await evaluate(pushVerb.code, { ...ctx, this: elevator, args: [5] });
    }

    // Verify state
    elevator = getEntity(elevator.id)!;
    expect(elevator.props["current_floor"]).toBe(5);

    // 3. Out (to Floor 5 Lobby)
    const outVerb = getVerb(elevator.id, "out");
    expect(outVerb).toBeDefined();
    if (outVerb) {
      await evaluate(outVerb.code, { ...ctx, this: elevator, args: [] });
    }

    caller = getEntity(caller.id)!;
    const floorLobbyId = caller.location_id!;
    expect(floorLobbyId).not.toBe(elevator.id);
    const floorLobby = getEntity(floorLobbyId)!;
    expect(floorLobby.name).toBe("Floor 5 Lobby");

    // 4. West (to West Wing)
    const westVerb = getVerb(floorLobby.prototype_id!, "west");
    expect(westVerb).toBeDefined();
    if (westVerb) {
      await evaluate(westVerb.code, { ...ctx, this: floorLobby, args: [] });
    }

    caller = getEntity(caller.id)!;
    const wingId = caller.location_id!;
    const wing = getEntity(wingId)!;
    expect(wing.name).toBe("Floor 5 West Wing");

    // 5. Enter 501 (to Room)
    const enterVerb = getVerb(wing.prototype_id!, "enter");
    expect(enterVerb).toBeDefined();
    if (enterVerb) {
      await evaluate(enterVerb.code, { ...ctx, this: wing, args: ["501"] });
    }

    caller = getEntity(caller.id)!;
    const roomId = caller.location_id!;
    const room = getEntity(roomId)!;
    expect(room.name).toBe("Room 501");

    // 6. Leave (back to Wing)
    const leaveVerb = getVerb(room.prototype_id!, "leave");
    expect(leaveVerb).toBeDefined();
    if (leaveVerb) {
      await evaluate(leaveVerb.code, { ...ctx, this: room, args: [] });
    }

    caller = getEntity(caller.id)!;
    expect(caller.location_id).toBe(wingId);
    expect(getEntity(roomId)).toBeNull(); // Room destroyed

    // 7. Back (back to Floor Lobby)
    const backVerb = getVerb(wing.prototype_id!, "back");
    expect(backVerb).toBeDefined();
    if (backVerb) {
      await evaluate(backVerb.code, { ...ctx, this: wing, args: [] });
    }

    caller = getEntity(caller.id)!;
    expect(caller.location_id).toBe(floorLobbyId);
    expect(getEntity(wingId)).toBeNull(); // Wing destroyed

    // 8. Elevator (back to Elevator)
    const elevatorVerb = getVerb(floorLobby.prototype_id!, "elevator");
    expect(elevatorVerb).toBeDefined();
    if (elevatorVerb) {
      await evaluate(elevatorVerb.code, { ...ctx, this: floorLobby, args: [] });
    }

    caller = getEntity(caller.id)!;
    expect(caller.location_id).toBe(elevator.id);
    expect(getEntity(floorLobbyId)).toBeNull(); // Lobby destroyed
  });
});
