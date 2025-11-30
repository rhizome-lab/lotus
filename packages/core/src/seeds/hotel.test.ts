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
  ScriptSystemContext,
} from "../scripting/interpreter";
import * as Core from "../scripting/lib/core";
import * as String from "../scripting/lib/string";
import * as Object from "../scripting/lib/object";
import * as List from "../scripting/lib/list";
import * as Time from "../scripting/lib/time";
import { seedHotel } from "./hotel";

describe("Hotel Seed", () => {
  let lobbyId: number;
  let voidId: number;
  let sys: ScriptSystemContext;
  let player: any;

  beforeAll(async () => {
    // Register libraries
    registerLibrary(Core);
    registerLibrary(String);
    registerLibrary(Object);
    registerLibrary(Time);
    registerLibrary(List);

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
      ["location"]: lobbyId,
      props: { is_wizard: true },
    });
    player = getEntity(playerId);

    // Mock System Context
    sys = {
      create: (data) => createEntity(data),
      send: () => {}, // Mock send
      destroy: () => {}, // Mock destroy
      schedule: () => {},
      call: async () => null,
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

    // TODO: `move` does not support `id`
    sys.call(player, player.id, "move", [floorLobbyId], []);

    await evaluate(
      westVerb.code,
      createScriptContext({
        caller: player,
        this: getEntity(floorLobbyId)!,
        sys,
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
    sys.send = (msg: any) => {
      output = msg.text || JSON.stringify(msg);
    }; // Capture output

    await evaluate(
      enterVerb.code,
      createScriptContext({ caller: player, this: westWing, args: [51], sys }),
    );

    // Should fail and tell user
    expect(output).toContain("Room numbers in the West Wing are 1-50");

    // Player should still be in West Wing
    expect(getEntity(player.id)!["location"]).toBe(westWingId);

    // 5. Try to enter valid room (e.g. 10)
    await evaluate(
      enterVerb.code,
      createScriptContext({ caller: player, this: westWing, args: [10], sys }),
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
      {
        name: "Floor 2 Lobby",
        kind: "ROOM",
        props: { floor: 2 },
      },
      floorLobbyProto.id,
    );

    // 3. Execute 'east' verb to create East Wing
    const eastVerb = getVerb(floorLobbyId, "east")!;

    // TODO: `move` does not support `id`
    sys.call(player, player.id, "move", [floorLobbyId], []);

    await evaluate(
      eastVerb.code,
      createScriptContext({
        caller: player,
        this: getEntity(floorLobbyId)!,
        sys,
      }),
    );

    const playerAfterEast = getEntity(player.id)!;
    const eastWingId = playerAfterEast["location"] as number;
    const eastWing = getEntity(eastWingId)!;
    expect(eastWing["name"]).toContain("East Wing");

    // 4. Try to enter invalid room (e.g. 10)
    const enterVerb = getVerb(eastWingId, "enter")!;
    let output = "";
    sys.send = (msg: any) => {
      output = msg.text || JSON.stringify(msg);
    };

    await evaluate(
      enterVerb.code,
      createScriptContext({ caller: player, this: eastWing, args: [10], sys }),
    );

    expect(output).toContain("Room numbers in the East Wing are 51-99");

    // 5. Try to enter valid room (e.g. 60)
    await evaluate(
      enterVerb.code,
      createScriptContext({ caller: player, this: eastWing, args: [60], sys }),
    );

    const playerInRoom = getEntity(player.id)!;
    const room = getEntity(playerInRoom["location"] as number)!;
    expect(room["name"]).toBe("Room 60");
  });
});
