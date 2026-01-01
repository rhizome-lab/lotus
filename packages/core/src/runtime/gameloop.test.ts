import {
  addVerb,
  createCapability,
  createEntity,
  deleteEntity,
  getEntity,
  getCapabilities,
  getVerb,
  updateEntity,
} from "../repo";
import { beforeEach, describe, expect, it } from "bun:test";
import { createScriptContext, evaluate } from "@viwo/scripting";
import type { Entity } from "@viwo/shared/jsonrpc";
import { GameOpcodes } from "./opcodes";
import { db } from "../db";
import { scheduler } from "../scheduler";
import { seed } from "../seed";

/**
 * Semi-E2E tests for the game loop.
 * These tests exercise the full interaction flow: entities, verbs, scheduler, capabilities.
 * They use the real database and scheduler but mock the WebSocket layer.
 */
describe("Game Loop E2E", () => {
  let player1: Entity;
  let player2: Entity;
  let room: Entity;
  let messages1: any[] = [];
  let messages2: any[] = [];
  let send1: (type: string, payload: unknown) => void;
  let send2: (type: string, payload: unknown) => void;

  beforeEach(() => {
    // Reset DB state
    db.query("DELETE FROM entities").run();
    db.query("DELETE FROM verbs").run();
    db.query("DELETE FROM capabilities").run();
    db.query("DELETE FROM scheduled_tasks").run();
    db.query("DELETE FROM sqlite_sequence").run();

    messages1 = [];
    messages2 = [];

    // Mock send functions for two different clients
    send1 = (type: string, payload: any) => {
      messages1.push({ payload, type });
    };

    send2 = (type: string, payload: any) => {
      messages2.push({ payload, type });
    };

    // Seed the database
    seed();

    // Setup scheduler with mock send factory
    scheduler.setOpcodes(GameOpcodes);
    scheduler.setSendFactory((entityId: number) => (entityId === player1.id ? send1 : send2));

    // Get entity bases
    const playerBase = db
      .query<{ id: number }, []>(
        "SELECT id FROM entities WHERE json_extract(props, '$.name') = 'Player Base'",
      )
      .get()!;

    const entityBase = db
      .query<{ id: number }, []>(
        "SELECT id FROM entities WHERE json_extract(props, '$.name') = 'Entity Base'",
      )
      .get()!;

    // Create a room
    const roomId = createEntity(
      {
        description: "A cozy test room.",
        name: "Test Room",
      },
      entityBase.id,
    );
    room = getEntity(roomId)!;

    // Create two players
    const player1Id = createEntity(
      {
        admin: true,
        location: roomId,
        name: "Alice",
      },
      playerBase.id,
    );
    player1 = getEntity(player1Id)!;
    createCapability(player1Id, "sys.create", {});
    createCapability(player1Id, "entity.control", { "*": true });

    const player2Id = createEntity(
      {
        location: roomId,
        name: "Bob",
      },
      playerBase.id,
    );
    player2 = getEntity(player2Id)!;
    // Grant player 2 the same capabilities so they can also create
    createCapability(player2Id, "sys.create", {});
    createCapability(player2Id, "entity.control", { "*": true });

    // Ensure room tracks occupants for look/teleport flows
    updateEntity({ ...room, contents: [player1Id, player2Id] });
    room = getEntity(roomId)!;
  });

  // oxlint-disable-next-line max-params
  const runVerb = async (
    entity: Entity,
    verbName: string,
    args: any[] = [],
    caller?: Entity,
    send?: (type: string, payload: unknown) => void,
  ) => {
    const freshEntity = getEntity(entity.id)!;
    const verb = getVerb(freshEntity.id, verbName);
    if (!verb) {
      throw new Error(`Verb ${verbName} not found on entity ${freshEntity.id}`);
    }

    const ctx = createScriptContext({
      args,
      caller: caller ?? freshEntity,
      gas: 100_000,
      ops: GameOpcodes,
      send: send ?? send1,
      this: freshEntity,
    });

    return await evaluate(verb.code, ctx);
  };

  describe("Multi-Entity Interactions", () => {
    it("should include room and occupants when looking", async () => {
      await runVerb(player1, "look", [], player1, send1);

      const update = [...messages1].reverse().find((msg) => msg.type === "update");
      expect(update).toBeDefined();
      const entities = (update!.payload as any).entities as Array<{ name?: string }>;
      const names = entities.map((ent) => ent.name);
      expect(names).toContain("Test Room");
      expect(names).toContain("Alice");
      expect(names).toContain("Bob");
    });

    it("should handle two players in the same room", async () => {
      // Both players look at the room
      await runVerb(player1, "look", [], player1, send1);
      await runVerb(player2, "look", [], player2, send2);

      // Both should see the room
      expect(messages1.length).toBeGreaterThan(0);
      expect(messages2.length).toBeGreaterThan(0);

      // Check that both got room data
      const room1Data = messages1.find(
        (msg) => msg.type === "update" && Array.isArray(msg.payload.entities),
      );
      const room2Data = messages2.find(
        (msg) => msg.type === "update" && Array.isArray(msg.payload.entities),
      );

      expect(room1Data).toBeDefined();
      expect(room2Data).toBeDefined();
    });

    it("should handle concurrent item creation", async () => {
      // Both players create items simultaneously
      const item1Id = await runVerb(player1, "create", ["Rock"], player1, send1);
      const item2Id = await runVerb(player2, "create", ["Stick"], player2, send2);

      expect(item1Id).toBeDefined();
      expect(item2Id).toBeDefined();

      const item1 = getEntity(item1Id as number);
      const item2 = getEntity(item2Id as number);

      expect(item1).toBeDefined();
      expect(item2).toBeDefined();
      expect(item1!["name"]).toBe("Rock");
      expect(item2!["name"]).toBe("Stick");

      // Both items should be in the room
      expect(item1!["location"]).toBe(room.id);
      expect(item2!["location"]).toBe(room.id);
    });

    it("should handle entity creation and destruction", async () => {
      // Player 1 creates an item
      const itemId = (await runVerb(
        player1,
        "create",
        ["Temporary Item"],
        player1,
        send1,
      )) as number;
      expect(getEntity(itemId)).toBeDefined();

      // Destroy the item directly
      deleteEntity(itemId);

      // Item should be gone
      expect(getEntity(itemId)).toBeNull();
    });

    it("should add created items to room contents and emit updates", async () => {
      const itemId = (await runVerb(player1, "create", ["Lantern"], player1, send1)) as number;
      const updatedRoom = getEntity(room.id)!;
      expect(updatedRoom["contents"]).toContain(itemId);

      const message = messages1.find(
        (msg) => msg.type === "message" && msg.payload === "You create Lantern.",
      );
      expect(message).toBeDefined();

      const update = messages1.find((msg) => msg.type === "update");
      const entities = (update?.payload as any)?.entities?.map((ent: any) => ent.name) ?? [];
      expect(entities).toContain("Lantern");
    });
  });

  describe("Scheduler Integration", () => {
    it("should execute delayed verb via scheduler", async () => {
      // Add a verb that schedules itself
      addVerb(player1.id, "delayed_greet", [
        "std.seq",
        ["send", "message", "Greeting scheduled"],
        ["std.return", true],
      ] as any);

      // Schedule the verb
      scheduler.schedule(player1.id, "delayed_greet", [], 100);

      // Process immediately (task is in the future)
      await scheduler.process();
      expect(messages1.length).toBe(0);

      // Wait for the delay
      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });

      // Process again
      await scheduler.process();

      // Should have received the message
      const greetMsg = messages1.find(
        (msg) => msg.type === "message" && msg.payload === "Greeting scheduled",
      );
      expect(greetMsg).toBeDefined();
    });

    it("should handle multiple scheduled tasks", async () => {
      // Add verbs for both players
      addVerb(player1.id, "task1", ["send", "message", "Task 1 executed"] as any);

      addVerb(player2.id, "task2", ["send", "message", "Task 2 executed"] as any);

      // Schedule both
      scheduler.schedule(player1.id, "task1", [], 50);
      scheduler.schedule(player2.id, "task2", [], 50);

      // Wait and process
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
      await scheduler.process();

      // Both should have executed
      const task1Msg = messages1.find(
        (msg) => msg.type === "message" && msg.payload === "Task 1 executed",
      );
      const task2Msg = messages2.find(
        (msg) => msg.type === "message" && msg.payload === "Task 2 executed",
      );

      expect(task1Msg).toBeDefined();
      expect(task2Msg).toBeDefined();
    });
  });

  describe("Capability Enforcement", () => {
    it("should enforce entity.control capability", async () => {
      // Remove player 2's entity.control capability for this test
      db.query("DELETE FROM capabilities WHERE owner_id = ? AND type = 'entity.control'").run(
        player2.id,
      );

      // Player 2 (no entity.control) tries to set a property on an item
      const itemId = createEntity({
        location: room.id,
        name: "Protected Item",
        value: 100,
      });

      // Player 2 shouldn't be able to set the property
      await runVerb(player2, "set", ["Protected Item", "value", 999], player2, send2);

      // Check that the value wasn't changed
      const item = getEntity(itemId);
      expect(item!["value"]).toBe(100);
    });

    it("should allow operations with proper capability", async () => {
      // Player 1 (has admin + entity.control) creates and modifies
      const itemId = (await runVerb(player1, "create", ["Mutable Item"], player1, send1)) as number;
      const item = getEntity(itemId)!;
      updateEntity({ ...item, durability: 50 });

      // Should be able to modify
      await runVerb(player1, "set", ["Mutable Item", "durability", 25], player1, send1);

      const updatedItem = getEntity(itemId);
      expect(updatedItem!["durability"]).toBe(25);
    });
  });

  describe("Adversarial Scenarios", () => {
    it("should prevent minting with non-sys.mint authority", async () => {
      // Give player1 an unrelated capability and attempt to mint with it
      const nonMintCapId = createCapability(player1.id, "entity.control", { target_id: room.id });
      addVerb(player1.id, "mint_bad", [
        "std.seq",
        ["std.return", ["mint", ["get_capability", "entity.control"], "evil.cap", {}]],
      ] as any);

      await expect(runVerb(player1, "mint_bad", [], player1, send1)).rejects.toThrow(
        "mint: authority must be sys.mint",
      );

      const caps = getCapabilities(player1.id);
      expect(caps.find((cap) => cap.type === "evil.cap")).toBeUndefined();
      // cleanup capability directly
      db.query("DELETE FROM capabilities WHERE id = ?").run(nonMintCapId);
    });

    it("should enforce namespace when minting capabilities", async () => {
      // Grant scoped sys.mint to player1
      createCapability(player1.id, "sys.mint", { namespace: "player1." });
      addVerb(player1.id, "mint_namespace", [
        "std.seq",
        [
          "std.return",
          ["mint", ["get_capability", "sys.mint"], "othernamespace.cap", { foo: "bar" }],
        ],
      ] as any);

      await expect(runVerb(player1, "mint_namespace", [], player1, send1)).rejects.toThrow(
        "mint: authority namespace 'player1.' does not cover 'othernamespace.cap'",
      );

      const caps = getCapabilities(player1.id);
      expect(caps.find((cap) => cap.type === "othernamespace.cap")).toBeUndefined();
    });

    it("should reject creation when sys.create is missing", async () => {
      db.query("DELETE FROM capabilities WHERE owner_id = ? AND type = 'sys.create'").run(
        player2.id,
      );
      const beforeContents = (getEntity(room.id)?.["contents"] as number[] | undefined) ?? [];

      const result = await runVerb(player2, "create", ["Forbidden"], player2, send2);
      expect(result).toBeUndefined();

      const after = getEntity(room.id)!;
      const afterContents = (after["contents"] as number[] | undefined) ?? [];
      expect(afterContents).toHaveLength(beforeContents.length);
      const msg = messages2.find(
        (m) => m.type === "message" && m.payload === "You do not have permission to create here.",
      );
      expect(msg).toBeDefined();
    });

    it("should block recursive teleport into self", async () => {
      const originalLocation = player1["location"];
      await runVerb(player1, "teleport", [getEntity(player1.id)!], player1, send1);

      const msg = messages1.find(
        (m) => m.type === "message" && m.payload === "You can't put something inside itself.",
      );
      expect(msg).toBeDefined();
      const updated = getEntity(player1.id)!;
      expect(updated["location"]).toBe(originalLocation);
    });

    it("should refuse dig without required capabilities", async () => {
      db.query("DELETE FROM capabilities WHERE owner_id = ?").run(player2.id);
      const beforeExits = (getEntity(room.id)?.["exits"] as number[] | undefined) ?? [];

      const result = await runVerb(player2, "dig", ["east", "Honeypot"], player2, send2);
      expect(result).toBeNull();

      const message = messages2.find(
        (m) => m.type === "message" && m.payload === "You cannot dig here.",
      );
      expect(message).toBeDefined();
      const after = getEntity(room.id)!;
      const afterExits = (after["exits"] as number[] | undefined) ?? [];
      expect(afterExits).toHaveLength(beforeExits.length);
    });
  });

  describe("State Persistence", () => {
    it("should persist entity changes across operations", async () => {
      // Create an item with initial state
      const itemId = createEntity({
        counter: 0,
        location: room.id,
        name: "Counter",
      });

      // Add an increment verb
      addVerb(itemId, "increment", [
        "std.seq",
        ["send", "message", "Incrementing counter"],
        ["std.return", true],
      ] as any);

      const counter = getEntity(itemId)!;

      // Increment multiple times using direct repo calls
      await runVerb(counter, "increment", [], player1, send1);
      updateEntity({ ...getEntity(itemId)!, counter: 1 });

      await runVerb(counter, "increment", [], player1, send1);
      updateEntity({ ...getEntity(itemId)!, counter: 2 });

      await runVerb(counter, "increment", [], player1, send1);
      updateEntity({ ...getEntity(itemId)!, counter: 3 });

      // Check final state
      const finalCounter = getEntity(itemId)!;
      expect(finalCounter["counter"]).toBe(3);
    });

    it("should handle location changes properly", () => {
      // Create a container
      const containerId = createEntity({
        location: room.id,
        name: "Box",
      });

      // Create an item
      const itemId = createEntity({
        location: room.id,
        name: "Ball",
      });

      // Move item into container
      updateEntity({ ...getEntity(itemId)!, location: containerId });

      const item = getEntity(itemId)!;
      expect(item["location"]).toBe(containerId);

      // Move item back to room
      updateEntity({ ...item, location: room.id });

      const movedItem = getEntity(itemId)!;
      expect(movedItem["location"]).toBe(room.id);
    });
  });

  describe("Complex Workflows", () => {
    it("should handle a complete game loop: create, interact, destroy", async () => {
      // 1. Player creates a quest giver
      const npcId = (await runVerb(player1, "create", ["Quest Giver"], player1, send1)) as number;
      const npc = getEntity(npcId)!;

      // 2. Add a quest verb to NPC
      addVerb(npcId, "talk", [
        "std.seq",
        ["send", "message", "Greetings, traveler!"],
        ["std.return", "quest_accepted"],
      ] as any);

      // 3. Player talks to NPC
      const result = await runVerb(npc, "talk", [], player1, send1);
      expect(result).toBe("quest_accepted");

      // 4. Verify message was sent
      const talkMsg = messages1.find(
        (msg) => msg.type === "message" && msg.payload === "Greetings, traveler!",
      );
      expect(talkMsg).toBeDefined();

      // 5. Complete quest (destroy NPC directly)
      deleteEntity(npcId);

      // 6. NPC should be gone
      expect(getEntity(npcId)).toBeNull();
    });

    it("should handle room transitions", async () => {
      // Create a second room
      const entityBase = db
        .query<{ id: number }, []>(
          "SELECT id FROM entities WHERE json_extract(props, '$.name') = 'Entity Base'",
        )
        .get()!;

      const room2Id = createEntity(
        {
          name: "Second Room",
        },
        entityBase.id,
      );

      // Create an exit from room to room2
      const exitId = createEntity(
        {
          destination: room2Id,
          direction: "north",
          location: room.id,
          name: "north",
        },
        entityBase.id,
      );

      // Update room with exit
      updateEntity({ ...room, exits: [exitId] });

      // Player goes north
      await runVerb(player1, "go", ["north"], player1, send1);

      // Player should now be in room2 and contents should be updated
      const updatedPlayer = getEntity(player1.id)!;
      expect(updatedPlayer["location"]).toBe(room2Id);
      const updatedRoom = getEntity(room.id)!;
      expect((updatedRoom["contents"] as number[] | undefined) ?? []).not.toContain(player1.id);
      const newRoom = getEntity(room2Id)!;
      expect((newRoom["contents"] as number[] | undefined) ?? []).toContain(player1.id);
    });

    it("should support creating rooms, carrying items, and dropping them", async () => {
      const startingRoomId = room.id;
      const beforeRoomContents = (getEntity(startingRoomId)!["contents"] as number[] | undefined) ?? [];

      // Dig east into a new room (creates back exit and teleports player)
      await runVerb(player1, "dig", ["east", "Workshop"], player1, send1);
      const afterDigPlayer = getEntity(player1.id)!;
      const workshopId = afterDigPlayer["location"] as number;
      expect(workshopId).not.toBe(startingRoomId);

      // Create an item in the new room
      const playerInWorkshop = getEntity(player1.id)!;
      const itemId = (await runVerb(
        playerInWorkshop,
        "create",
        ["Widget"],
        playerInWorkshop,
        send1,
      )) as number;
      const workshop = getEntity(workshopId)!;
      expect(getEntity(itemId)!["location"]).toBe(workshopId);
      let workshopContents = (workshop["contents"] as number[] | undefined) ?? [];
      if (!workshopContents.includes(itemId)) {
        // Some flows may skip contents updates; patch to exercise carry/drop path.
        workshopContents = [...workshopContents, itemId];
        updateEntity({ ...workshop, contents: workshopContents });
      }

      // Simulate pick up: move item into player contents and out of room
      const playerEntity = getEntity(player1.id)!;
      const playerContents = (playerEntity["contents"] as number[] | undefined) ?? [];
      updateEntity(
        { ...getEntity(itemId)!, location: player1.id },
        { ...workshop, contents: workshopContents.filter((id) => id !== itemId) },
        { ...playerEntity, contents: [...playerContents, itemId] },
      );

      const carriedPlayer = getEntity(player1.id)!;
      expect(((carriedPlayer["contents"] as number[] | undefined) ?? [])).toContain(itemId);
      expect(((getEntity(workshopId)!["contents"] as number[] | undefined) ?? [])).not.toContain(
        itemId,
      );

      // Move back to starting room via back exit
      await runVerb(player1, "go", ["back"], player1, send1);
      const backRoomPlayer = getEntity(player1.id)!;
      expect(backRoomPlayer["location"]).toBe(startingRoomId);

      // Drop item into starting room
      const lobby = getEntity(startingRoomId)!;
      const lobbyContents = (lobby["contents"] as number[] | undefined) ?? [];
      const updatedPlayerContents = ((backRoomPlayer["contents"] as number[] | undefined) ?? []).filter(
        (id) => id !== itemId,
      );
      updateEntity(
        { ...getEntity(itemId)!, location: startingRoomId },
        { ...lobby, contents: [...lobbyContents, itemId] },
        { ...backRoomPlayer, contents: updatedPlayerContents },
      );

      const finalLobby = getEntity(startingRoomId)!;
      expect((finalLobby["contents"] as number[] | undefined) ?? []).toContain(itemId);
      expect((getEntity(workshopId)!["contents"] as number[] | undefined) ?? []).not.toContain(
        itemId,
      );
      expect(((getEntity(player1.id)!["contents"] as number[] | undefined) ?? [])).not.toContain(
        itemId,
      );

      // Ensure we didn't lose original room contents
      const finalLobbyContents = (finalLobby["contents"] as number[] | undefined) ?? [];
      for (const id of beforeRoomContents) {
        expect(finalLobbyContents).toContain(id);
      }
    });
  });
});
