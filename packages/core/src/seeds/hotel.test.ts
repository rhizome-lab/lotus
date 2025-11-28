import { describe, test, expect, mock, beforeAll } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../schema";

const db = new Database(":memory:");
initSchema(db);

// Mock the db module
mock.module("../db", () => ({ db }));

// Import repo and seed after mocking
import { getEntity, createEntity, getVerb } from "../repo";
import {
  evaluate,
  registerLibrary,
  ScriptSystemContext,
} from "../scripting/interpreter";
import { StringLibrary } from "../scripting/lib/string";
import { ObjectLibrary } from "../scripting/lib/object";
import { TimeLibrary } from "../scripting/lib/time";
import { WorldLibrary } from "../scripting/lib/world";
import { ListLibrary } from "../scripting/lib/list";
import { seedHotel } from "./hotel";

describe("Hotel Seed", () => {
  let lobbyId: number;
  let voidId: number;
  let sys: ScriptSystemContext;
  let player: any;

  beforeAll(async () => {
    // Register libraries
    registerLibrary(StringLibrary);
    registerLibrary(ObjectLibrary);
    registerLibrary(TimeLibrary);
    registerLibrary(WorldLibrary);
    registerLibrary(ListLibrary);

    // Initialize DB
    db.run("DELETE FROM entities");
    // Create basic world
    voidId = createEntity({ name: "Void", kind: "ROOM" });
    lobbyId = createEntity({ name: "Lobby", kind: "ROOM" });

    // Seed Hotel
    seedHotel(lobbyId, voidId);

    // Create a player
    const playerId = createEntity({
      name: "Tester",
      kind: "ACTOR",
      location_id: lobbyId,
      props: { is_wizard: true },
    });
    player = getEntity(playerId);

    // Mock System Context
    sys = {
      move: (id, dest) => {
        const e = getEntity(id);
        if (e) {
          // Direct DB update for test
          db.query("UPDATE entities SET location_id = ? WHERE id = ?").run(
            dest,
            id,
          );
        }
      },
      create: (data) => createEntity(data),
      send: () => {}, // Mock send
      destroy: () => {}, // Mock destroy
      getAllEntities: () => [],
      schedule: () => {},
      broadcast: () => {},
      give: () => {},
      call: async () => null,
      triggerEvent: async () => {},
    };
  });

  test("West Wing Room Validation", async () => {
    // 1. Find Floor Lobby Proto
    const floorLobbyProto = db
      .query("SELECT id FROM entities WHERE name = 'Floor Lobby Proto'")
      .get() as { id: number };

    // 2. Create a Floor Lobby instance (mocking the elevator 'out' logic)
    const floorLobbyId = createEntity({
      name: "Floor 1 Lobby",
      kind: "ROOM",
      prototype_id: floorLobbyProto.id,
      props: { floor: 1 },
    });

    // 3. Execute 'west' verb to create West Wing
    const westVerb = getVerb(floorLobbyId, "west")!;
    let warnings: string[] = [];

    // Mock player location
    sys.move(player.id, floorLobbyId);

    await evaluate(westVerb.code, {
      caller: player,
      this: getEntity(floorLobbyId)!,
      args: [],
      gas: 1000,
      sys,
      warnings,
    });

    // Player should be in West Wing now
    const playerAfterWest = getEntity(player.id)!;
    const westWingId = playerAfterWest.location_id!;
    const westWing = getEntity(westWingId)!;
    expect(westWing.name).toContain("West Wing");

    // 4. Try to enter invalid room (e.g. 51)
    const enterVerb = getVerb(westWingId, "enter")!;
    let output = "";
    sys.send = (msg: any) => {
      output = msg.text || JSON.stringify(msg);
    }; // Capture output

    await evaluate(enterVerb.code, {
      caller: player,
      this: westWing,
      args: [51],
      gas: 1000,
      sys,
      warnings,
    });

    // Should fail and tell user
    expect(output).toContain("Room numbers in the West Wing are 1-50");

    // Player should still be in West Wing
    expect(getEntity(player.id)!.location_id).toBe(westWingId);

    // 5. Try to enter valid room (e.g. 10)
    await evaluate(enterVerb.code, {
      caller: player,
      this: westWing,
      args: [10],
      gas: 1000,
      sys,
      warnings,
    });

    // Player should be in Room 10
    const playerInRoom = getEntity(player.id)!;
    const room = getEntity(playerInRoom.location_id!)!;
    expect(room.name).toBe("Room 10");
  });

  test("East Wing Room Validation", async () => {
    // 1. Find Floor Lobby Proto
    const floorLobbyProto = db
      .query("SELECT id FROM entities WHERE name = 'Floor Lobby Proto'")
      .get() as { id: number };

    // 2. Create a Floor Lobby instance
    const floorLobbyId = createEntity({
      name: "Floor 2 Lobby",
      kind: "ROOM",
      prototype_id: floorLobbyProto.id,
      props: { floor: 2 },
    });

    // 3. Execute 'east' verb to create East Wing
    const eastVerb = getVerb(floorLobbyId, "east")!;
    let warnings: string[] = [];

    sys.move(player.id, floorLobbyId);

    await evaluate(eastVerb.code, {
      caller: player,
      this: getEntity(floorLobbyId)!,
      args: [],
      gas: 1000,
      sys,
      warnings,
    });

    const playerAfterEast = getEntity(player.id)!;
    const eastWingId = playerAfterEast.location_id!;
    const eastWing = getEntity(eastWingId)!;
    expect(eastWing.name).toContain("East Wing");

    // 4. Try to enter invalid room (e.g. 10)
    const enterVerb = getVerb(eastWingId, "enter")!;
    let output = "";
    sys.send = (msg: any) => {
      output = msg.text || JSON.stringify(msg);
    };

    await evaluate(enterVerb.code, {
      caller: player,
      this: eastWing,
      args: [10],
      gas: 1000,
      sys,
      warnings,
    });

    expect(output).toContain("Room numbers in the East Wing are 51-99");

    // 5. Try to enter valid room (e.g. 60)
    await evaluate(enterVerb.code, {
      caller: player,
      this: eastWing,
      args: [60],
      gas: 1000,
      sys,
      warnings,
    });

    const playerInRoom = getEntity(player.id)!;
    const room = getEntity(playerInRoom.location_id!)!;
    expect(room.name).toBe("Room 60");
  });
});
