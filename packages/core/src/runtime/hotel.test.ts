import { describe, it, test, expect, beforeEach, beforeAll } from "bun:test";
import { db } from "../db";
import * as CoreLib from "../runtime/lib/core";
import * as KernelLib from "../runtime/lib/kernel";
import { seed } from "../seed";
import { seedHotel } from "../seeds/hotel";
import {
  createEntity,
  getEntity,
  updateEntity,
  getVerb,
  createCapability,
} from "../repo";
import {
  evaluate,
  registerLibrary,
  createScriptContext,
  StdLib,
  ListLib,
  StringLib,
  ObjectLib,
  TimeLib,
  BooleanLib,
} from "@viwo/scripting";
import { Entity } from "@viwo/shared/jsonrpc";

registerLibrary(CoreLib);
registerLibrary(KernelLib);
registerLibrary(StdLib);
registerLibrary(ListLib);
registerLibrary(StringLib);
registerLibrary(ObjectLib);
registerLibrary(BooleanLib);
registerLibrary(TimeLib);

describe("Hotel Scripting", () => {
  let hotelLobby: Entity;
  let caller: Entity;
  let messages: unknown[] = [];
  let send: (type: string, payload: unknown) => void;

  beforeEach(() => {
    // Reset DB state
    db.query("DELETE FROM entities").run();
    db.query("DELETE FROM verbs").run();
    db.query("DELETE FROM capabilities").run();
    db.query("DELETE FROM sqlite_sequence").run();

    messages = [];

    // Setup Sys Context
    // Setup Send
    send = (type: string, payload: unknown) => {
      if (type === "message") {
        messages.push(payload);
      }
    };

    // Setup Environment
    // Seed Base
    seed();

    // Find Main Lobby & Void
    const lobby = db
      .query<{ id: number }, []>(
        "SELECT id FROM entities WHERE json_extract(props, '$.name') = 'Lobby'",
      )
      .get()!;
    const lobbyId = lobby.id;
    const voidEntity = db
      .query<{ id: number }, []>(
        "SELECT id FROM entities WHERE json_extract(props, '$.name') = 'The Void'",
      )
      .get()!;
    const voidId = voidEntity.id;

    const entityBase = db
      .query<{ id: number }, []>(
        "SELECT id FROM entities WHERE json_extract(props, '$.name') = 'Entity Base'",
      )
      .get()!;
    const entityBaseId = entityBase.id;

    // Seed Hotel
    seedHotel(lobbyId, voidId, entityBaseId);

    // Find Hotel Lobby
    const hotelLobbyData = db
      .query<{ id: number }, []>(
        "SELECT id, props FROM entities WHERE json_extract(props, '$.name') = 'Grand Hotel Lobby'",
      )
      .get()!;
    hotelLobby = getEntity(hotelLobbyData.id)!;

    // Setup Caller
    const playerBase = db
      .query<{ id: number }, []>(
        "SELECT id FROM entities WHERE json_extract(props, '$.name') = 'Player Base'",
      )
      .get()!;
    const callerId = createEntity(
      { name: "Guest", location: hotelLobby.id },
      playerBase.id,
    );
    caller = getEntity(callerId)!;
    createCapability(callerId, "entity.control", { target_id: callerId });
  });

  it("should leave a room (move and destroy)", async () => {
    // 1. Manually create a room (since visit is gone)
    const roomProto = db
      .query(
        "SELECT id FROM entities WHERE json_extract(props, '$.name') = 'Hotel Room Prototype'",
      )
      .get() as any;
    const roomId = createEntity(
      { name: "Room 101", lobby_id: hotelLobby.id },
      roomProto.id,
    );
    createCapability(roomId, "entity.control", { target_id: roomId });

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
      createScriptContext({ caller, this: getEntity(roomId)!, send }),
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
    const elevatorData = db
      .query<{ id: number }, []>(
        "SELECT id FROM entities WHERE json_extract(props, '$.name') = 'Hotel Elevator'",
      )
      .get()!;
    let elevator = getEntity(elevatorData.id)!;
    expect(elevator).toBeDefined();

    // 0. Enter Hotel Lobby (from Main Lobby). 1. Enter Elevator.
    updateEntity({ ...caller, location: elevator.id });
    caller = getEntity(caller.id)!; // Refresh

    const ctx = {
      caller,
      this: elevator,
      args: [],
      warnings: [],
      send,
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
    const floorLobbyId = caller["location"];
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
    const wingId = caller["location"];
    const wing = getEntity(wingId as never)!;
    expect(wing["name"]).toBe("Floor 5 West Wing");

    // 5. Enter 5 (to Room)
    const enterVerb = getVerb(wing.id, "enter");
    expect(enterVerb).toBeDefined();
    if (enterVerb) {
      await evaluate(enterVerb.code, { ...ctx, this: wing, args: [5] });
    }

    caller = getEntity(caller.id)!;
    const roomId = caller["location"];
    const room = getEntity(roomId as never)!;
    expect(room["name"]).toBe("Room 5");

    // Verify furnishings
    const contentIds = room["contents"] as number[];
    const contents = contentIds.map((id) => getEntity(id)!);
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
    expect(caller["location"]).toBe(wingId);
    expect(getEntity(roomId as never)).toBeNull(); // Room destroyed

    // Verify furnishings destroyed (by checking if they exist in DB)
    const bed = contents.find((e) => e["name"] === "Bed")!;
    expect(getEntity(bed.id)).toBeNull();

    // 7. Back (back to Floor Lobby)
    const backVerb = getVerb(wing.id, "back");
    expect(backVerb).toBeDefined();
    if (backVerb) {
      await evaluate(backVerb.code, { ...ctx, this: wing, args: [] });
    }

    caller = getEntity(caller.id)!;
    expect(caller["location"]).toBe(floorLobbyId);
    expect(getEntity(wingId as never)).toBeNull(); // Wing destroyed

    // 8. Elevator (back to Elevator)
    const elevatorVerb = getVerb(floorLobby.id, "elevator");
    expect(elevatorVerb).toBeDefined();
    if (elevatorVerb) {
      await evaluate(elevatorVerb.code, { ...ctx, this: floorLobby, args: [] });
    }

    caller = getEntity(caller.id)!;
    expect(caller["location"]).toBe(elevator.id);
    expect(getEntity(floorLobbyId as never)).toBeNull(); // Lobby destroyed
  });
});

describe("Hotel Seed", () => {
  let lobbyId: number;
  let voidId: number;
  let player: any;

  beforeAll(() => {
    // Reset DB for this block
    db.query("DELETE FROM entities").run();
    db.query("DELETE FROM verbs").run();
    db.query("DELETE FROM sqlite_sequence").run();

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

    const entityBase = db
      .query<{ id: number }, []>(
        "SELECT id FROM entities WHERE json_extract(props, '$.name') = 'Entity Base'",
      )
      .get()!;
    const entityBaseId = entityBase.id;

    // Seed Hotel
    seedHotel(lobbyId, voidId, entityBaseId);

    // Create a player
    const playerBase = db
      .query<{ id: number }, []>(
        "SELECT id FROM entities WHERE json_extract(props, '$.name') = 'Player Base'",
      )
      .get()!;
    const playerId = createEntity(
      {
        name: "Tester",
        location: lobbyId,
        is_wizard: true,
      },
      playerBase.id,
    );
    player = getEntity(playerId);
    createCapability(playerId, "entity.control", { target_id: playerId });
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
    createCapability(floorLobbyId, "sys.create", {});
    createCapability(floorLobbyId, "entity.control", {
      target_id: floorLobbyId,
    });

    // 3. Execute 'west' verb to create West Wing
    const westVerb = getVerb(floorLobbyId, "west")!;

    let output = "";
    await evaluate(
      CoreLib.call(player, "move", floorLobbyId),
      createScriptContext({ caller: player, this: player }),
    );

    await evaluate(
      westVerb.code,
      createScriptContext({
        caller: player,
        this: getEntity(floorLobbyId)!,
        send: (type, payload) => {
          output = JSON.stringify({ type, payload });
        },
      }),
    );

    // Player should be in West Wing now
    const playerAfterWest = getEntity(player.id)!;
    const westWingId = playerAfterWest["location"] as number;
    const westWing = getEntity(westWingId)!;
    console.log("West Wing Output:", output);
    expect(westWing["name"]).toContain("West Wing");

    // 4. Try to enter invalid room (e.g. 51)
    const enterVerb = getVerb(westWingId, "enter")!;

    await evaluate(
      enterVerb.code,
      createScriptContext({
        caller: player,
        this: westWing,
        args: [51],
        send: (type, payload) => {
          output = JSON.stringify({ type, payload });
        },
      }),
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
      .query<{ id: number }, []>(
        "SELECT id FROM entities WHERE json_extract(props, '$.name') = 'Floor Lobby Proto'",
      )
      .get()!;

    // 2. Create a Floor Lobby instance
    const floorLobbyId = createEntity(
      { name: "Floor 2 Lobby", floor: 2 },
      floorLobbyProto.id,
    );
    createCapability(floorLobbyId, "sys.create", {});
    createCapability(floorLobbyId, "entity.control", {
      target_id: floorLobbyId,
    });

    // 3. Execute 'east' verb to create East Wing
    const eastVerb = getVerb(floorLobbyId, "east")!;
    let output = "";

    await evaluate(
      CoreLib.call(player, "move", floorLobbyId),
      createScriptContext({ caller: player, this: player }),
    );

    await evaluate(
      eastVerb.code,
      createScriptContext({
        caller: player,
        this: getEntity(floorLobbyId)!,
        send: (type, payload) => {
          output = JSON.stringify({ type, payload });
        },
      }),
    );

    const playerAfterEast = getEntity(player.id)!;
    const eastWingId = playerAfterEast["location"] as number;
    const eastWing = getEntity(eastWingId)!;
    expect(eastWing["name"]).toContain("East Wing");

    // 4. Try to enter invalid room (e.g. 10)
    const enterVerb = getVerb(eastWingId, "enter")!;

    await evaluate(
      enterVerb.code,
      createScriptContext({
        caller: player,
        this: eastWing,
        args: [10],
        send: (type, payload) => {
          output = JSON.stringify({ type, payload });
        },
      }),
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
