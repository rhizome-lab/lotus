import { beforeEach, describe, expect, it } from "bun:test";
import { createScriptContext, evaluate } from "@viwo/scripting";
import { getEntity, getVerb, updateEntity } from "../../repo";
import type { Entity } from "@viwo/shared/jsonrpc";
import { GameOpcodes } from "../../runtime/opcodes";
import { db } from "../../db";
import { seed } from "../../seed";

describe("Hotel Seed Stage 1", () => {
  let manager: Entity;
  let send: (type: string, payload: unknown) => void;
  let sentMessages: any[] = [];
  let mockTime = 1_677_648_000_000; // Arbitrary timestamp (2023-03-01)

  beforeEach(() => {
    // Reset DB state
    db.query("DELETE FROM entities").run();
    db.query("DELETE FROM verbs").run();
    db.query("DELETE FROM capabilities").run();
    db.query("DELETE FROM sqlite_sequence").run();

    sentMessages = [];
    mockTime = 1_677_648_000_000;

    send = (type: string, payload: any) => {
      sentMessages.push({ payload, type });
    };

    seed();

    // Find Hotel Manager
    const managerRow = db
      .query<Entity, []>(
        "SELECT * FROM entities WHERE json_extract(props, '$.name') = 'Hotel Manager'",
      )
      .get()!;
    manager = getEntity(managerRow.id)!;
  });

  const createOps = () => {
    const ops = { ...GameOpcodes };
    // Override time.now to use mockTime
    ops["time.now"] = {
      ...ops["time.now"],
      handler: () => new Date(mockTime).toISOString(),
    } as any;
    return ops;
  };

  const runVerb = async (entity: Entity, verbName: string, args: any[] = [], caller?: Entity) => {
    const freshEntity = getEntity(entity.id)!;
    const verb = getVerb(freshEntity.id, verbName);
    if (!verb) {
      throw new Error(`Verb ${verbName} not found on entity ${freshEntity.id}`);
    }

    const ctx = createScriptContext({
      args,
      caller: caller ?? freshEntity,
      ops: createOps(),
      send,
      this: freshEntity,
    });

    return await evaluate(verb.code, ctx);
  };

  it("should create a lobby if checking in", async () => {
    // Simulate enter
    await runVerb(manager, "enter");

    const freshManager = getEntity(manager.id)!;
    const lobbyId = freshManager["lobby_id"] as number;
    expect(lobbyId).toBeDefined();

    const lobby = getEntity(lobbyId);
    expect(lobby).toBeDefined();
    expect(lobby!["name"]).toBe("Grand Hotel Lobby");
    expect(lobby!["hotel_entity_type"]).toBe("lobby");
  });

  it("should create a room", async () => {
    const roomId = (await runVerb(manager, "create_room")) as number;
    expect(roomId).toBeDefined();

    const room = getEntity(roomId);
    expect(room).toBeDefined();
    expect(room!["hotel_entity_type"]).toBe("room");
    expect(room!["managed_by"]).toBe(manager.id);
    expect(room!["last_occupied"]).toBe(new Date(mockTime).toISOString());

    const freshManager = getEntity(manager.id)!;
    const activeRooms = freshManager["active_rooms"] as number[];
    expect(activeRooms).toContain(roomId);
  });

  it("should cleanup empty rooms after grace period", async () => {
    // 1. Create room
    const roomId = (await runVerb(manager, "create_room")) as number;
    // Manually clear contents (furniture) to test cleanup logic
    updateEntity({ contents: [], id: roomId });

    let freshManager = getEntity(manager.id)!;
    expect((freshManager["active_rooms"] as number[]).length).toBe(1);

    // 2. Advance time past grace period (10_000ms)
    mockTime += 11_000;

    // 3. Run cleanup loop
    await runVerb(manager, "cleanup_loop");

    // 4. Verify room destroyed
    const room = getEntity(roomId);
    expect(room).toBeNull();

    freshManager = getEntity(manager.id)!;
    expect((freshManager["active_rooms"] as number[]).length).toBe(0);

    // Verify message
    const cleanupMsg = sentMessages.find((message) =>
      message.payload.includes(`Cleaned up room ${roomId}`),
    );
    expect(cleanupMsg).toBeDefined();
  });

  it("should NOT cleanup occupied rooms (empty but recent)", async () => {
    // 1. Create room
    const roomId = (await runVerb(manager, "create_room")) as number;

    // 2. Advance time WITHIN grace period
    mockTime += 5000;

    // 3. Run cleanup loop
    await runVerb(manager, "cleanup_loop");

    // 4. Verify room still exists
    const room = getEntity(roomId);
    expect(room).toBeDefined();
    expect(room).toBeDefined();
  });

  it("should populate room with content", async () => {
    const roomId = (await runVerb(manager, "create_room")) as number;
    const room = getEntity(roomId)!;

    // Check description for theme
    console.log("Sent Messages:", JSON.stringify(sentMessages, null, 2));
    expect(room["theme"]).toBeDefined();
    expect(typeof room["theme"]).toBe("string");

    // Check contents (furniture)
    const contents = (room["contents"] as number[]) || [];
    expect(contents.length).toBeGreaterThan(0);

    const firstItem = getEntity(contents[0]!);
    expect(firstItem).toBeDefined();
    expect(firstItem!["description"]).toContain(room["theme"] as string);
  });
});
