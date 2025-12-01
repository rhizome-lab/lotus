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
  createScriptContext,
  evaluate,
  registerLibrary,
} from "../scripting/interpreter";
import * as Core from "../scripting/lib/core";
import * as String from "../scripting/lib/string";
import * as Object from "../scripting/lib/object";
import * as List from "../scripting/lib/list";
import * as Time from "../scripting/lib/time";
import { seedHotel } from "./hotel";
import { seed } from "../seed";

describe("Hotel Seed", () => {
  registerLibrary(Core);
  registerLibrary(String);
  registerLibrary(Object);
  registerLibrary(Time);
  registerLibrary(List);

  let lobbyId: number;
  let voidId: number;
  let player: any;

  beforeAll(async () => {
    // Create basic world
    seed();
    const void_ = db
      .query<{ id: number }, []>(
        "SELECT id FROM entities WHERE json_extract(props, '$.name') = 'The Void'",
      )
      .get()!;
    voidId = void_.id;
    const lobby = db
      .query<{ id: number }, []>(
        "SELECT id FROM entities WHERE json_extract(props, '$.name') = 'Lobby'",
      )
      .get()!;
    lobbyId = lobby.id;

    // Seed Hotel
    seedHotel(lobbyId, voidId);

    // Create a player
    const playerId = createEntity({
      name: "Tester",
      location: lobbyId,
      is_wizard: true,
    });
    player = getEntity(playerId);
  });

  test("West Wing Room Validation", async () => {
    // 1. Find Floor Lobby Proto
    const floorLobbyProto = db
      .query<{ id: number }, []>(
        "SELECT id FROM entities WHERE json_extract(props, '$.name') = 'Floor Lobby Proto'",
      )
      .get()!;

    // 2. Create a Floor Lobby instance (mocking the elevator 'out' logic)
    const floorLobbyId = createEntity(
      { name: "Floor 1 Lobby", floor: 1 },
      floorLobbyProto.id,
    );

    // 3. Execute 'west' verb to create West Wing
    const westVerb = getVerb(floorLobbyId, "west")!;

    // TODO: `move` does not support `id`
    await evaluate(
      Core["call"](player, "move", floorLobbyId),
      createScriptContext({ caller: player, this: player }),
    );

    await evaluate(
      westVerb.code,
      createScriptContext({
        caller: player,
        this: getEntity(floorLobbyId)!,
        send: (msg: any) => {
          output = msg.text || JSON.stringify(msg);
        },
      }),
    );

    // Player should be in West Wing now
    const playerAfterWest = getEntity(player.id)!;
    const westWingId = playerAfterWest["location"] as number;
    const westWing = getEntity(westWingId)!;
    expect(westWing["name"]).toContain("West Wing");

    // 4. Try to enter invalid room (e.g. 51)
    const enterVerb = getVerb(westWingId, "enter")!;
    let output = "";
    await evaluate(
      enterVerb.code,
      createScriptContext({ caller: player, this: westWing, args: [51] }),
    );

    // Should fail and tell user
    expect(output).toContain("Room numbers in the West Wing are 1-50");

    // Player should still be in West Wing
    expect(getEntity(player.id)!["location"]).toBe(westWingId);

    // 5. Try to enter valid room (e.g. 10)
    await evaluate(
      enterVerb.code,
      createScriptContext({ caller: player, this: westWing, args: [10] }),
    );

    // Player should be in Room 10
    const playerInRoom = getEntity(player.id)!;
    const room = getEntity(playerInRoom["location"] as number)!;
    expect(room["name"]).toBe("Room 10");
  });

  test("East Wing Room Validation", async () => {
    // 1. Find Floor Lobby Proto
    const floorLobbyProto = db
      // TODO: name is in prop now; use sqlite json tools
      .query<{ id: number }, []>(
        "SELECT id FROM entities WHERE json_extract(props, '$.name') = 'Floor Lobby Proto'",
      )
      .get()!;

    // 2. Create a Floor Lobby instance
    const floorLobbyId = createEntity(
      { name: "Floor 2 Lobby", floor: 2 },
      floorLobbyProto.id,
    );

    // 3. Execute 'east' verb to create East Wing
    const eastVerb = getVerb(floorLobbyId, "east")!;

    // TODO: `move` does not support `id`
    await evaluate(
      Core["call"](player, "move", floorLobbyId),
      createScriptContext({
        caller: player,
        this: player,
      }),
    );

    await evaluate(
      eastVerb.code,
      createScriptContext({
        caller: player,
        this: getEntity(floorLobbyId)!,
        send: (msg: any) => {
          output = msg.text || JSON.stringify(msg);
        },
      }),
    );

    const playerAfterEast = getEntity(player.id)!;
    const eastWingId = playerAfterEast["location"] as number;
    const eastWing = getEntity(eastWingId)!;
    expect(eastWing["name"]).toContain("East Wing");

    // 4. Try to enter invalid room (e.g. 10)
    const enterVerb = getVerb(eastWingId, "enter")!;
    let output = "";

    await evaluate(
      enterVerb.code,
      createScriptContext({ caller: player, this: eastWing, args: [10] }),
    );

    expect(output).toContain("Room numbers in the East Wing are 51-99");

    // 5. Try to enter valid room (e.g. 60)
    await evaluate(
      enterVerb.code,
      createScriptContext({ caller: player, this: eastWing, args: [60] }),
    );

    const playerInRoom = getEntity(player.id)!;
    const room = getEntity(playerInRoom["location"] as number)!;
    expect(room["name"]).toBe("Room 60");
  });
});
