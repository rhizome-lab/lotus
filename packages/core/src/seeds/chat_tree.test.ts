import { beforeEach, describe, expect, test } from "bun:test";
import type { Entity } from "@viwo/shared/jsonrpc";
import { createScriptContext, evaluate } from "@viwo/scripting";
import { db } from "../db";
import { createEntity, getEntity, getVerb } from "../repo";
import { GameOpcodes } from "../runtime/opcodes";
import { seedChatTree } from "./chat_tree";

describe("ChatTree", () => {
  let voidId: number;
  let playerId: number;
  let chatTreeId: number;
  let send: (type: string, payload: unknown) => void;
  let sentMessages: any[] = [];

  beforeEach(() => {
    // Reset DB state
    db.query("DELETE FROM entities").run();
    db.query("DELETE FROM verbs").run();
    db.query("DELETE FROM capabilities").run();
    db.query("DELETE FROM sqlite_sequence").run();

    sentMessages = [];
    send = (type: string, payload: any) => {
      sentMessages.push({ payload, type });
    };

    // Create minimal world
    voidId = createEntity({
      description: "Test void",
      name: "Void",
    });

    playerId = createEntity({
      description: "Test player",
      location: voidId,
      name: "Player",
    });

    // Seed chat tree
    const { exampleTreeId } = seedChatTree(voidId, playerId);
    chatTreeId = exampleTreeId;
  });

  const runVerb = async (entity: Entity, verbName: string, args: any[] = [], caller?: Entity) => {
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
      send,
      this: freshEntity,
    });

    return await evaluate(verb.code, ctx);
  };

  // Helper that fetches entity by ID before calling runVerb
  const callVerb = async (entityId: number, verbName: string, ...args: any[]) => {
    const entity = getEntity(entityId)!;
    return await runVerb(entity, verbName, args);
  };

  test("should create chat tree with initial state", () => {
    const tree = getEntity(chatTreeId);
    expect(tree).toBeDefined();
    expect(tree!.name).toBe("Example Chat Tree");
    expect(tree!.messages).toEqual({});
    expect(tree!.next_message_id).toBe(1);
    expect(tree!["active_branch"]).toBe("main");
    expect(tree!["branches"]).toEqual({ main: null });
  });

  test("should add messages to tree", async () => {
    // Add first message
    const msg1_id = await callVerb(chatTreeId, "add_message", "Hello!", "user");
    expect(msg1_id).toBe("1");

    // Add second message
    const msg2_id = await callVerb(chatTreeId, "add_message", "Hi there!", "assistant");
    expect(msg2_id).toBe("2");

    // Check tree state
    const tree = getEntity(chatTreeId);
    expect(tree!.next_message_id).toBe(3);
    expect(tree!["messages"]["1"]).toEqual({
      content: "Hello!",
      id: "1",
      parent_id: null,
      role: "user",
    });
    expect(tree!["messages"]["2"]).toEqual({
      content: "Hi there!",
      id: "2",
      parent_id: "1",
      role: "assistant",
    });
    expect(tree!["branches"]["main"]).toBe("2");
  });

  test("should support arbitrary role strings", async () => {
    await callVerb(chatTreeId, "add_message", "Narrator speaks", "narrator");
    await callVerb(chatTreeId, "add_message", "OOC comment", "ooc");
    await callVerb(chatTreeId, "add_message", "System message", "system");

    const tree = getEntity(chatTreeId);
    expect(tree!["messages"]["1"].role).toBe("narrator");
    expect(tree!["messages"]["2"].role).toBe("ooc");
    expect(tree!["messages"]["3"].role).toBe("system");
  });

  test("should get conversation for main branch", async () => {
    await callVerb(chatTreeId, "add_message", "Message 1", "user");
    await callVerb(chatTreeId, "add_message", "Message 2", "assistant");
    await callVerb(chatTreeId, "add_message", "Message 3", "user");

    const conversation = await callVerb(chatTreeId, "get_conversation");
    expect(conversation).toHaveLength(3);
    expect(conversation[0].content).toBe("Message 1");
    expect(conversation[1].content).toBe("Message 2");
    expect(conversation[2].content).toBe("Message 3");
  });

  test("should create branch from message", async () => {
    // Create initial conversation
    await callVerb(chatTreeId, "add_message", "Hello!", "user");
    const msg2_id = await callVerb(chatTreeId, "add_message", "Hi there!", "assistant");

    // Branch from second message
    const branch_name = await callVerb(chatTreeId, "branch_from", msg2_id, "alternate");
    expect(branch_name).toBe("alternate");

    const tree = getEntity(chatTreeId);
    expect(tree!["branches"]["alternate"]).toBe(msg2_id);
  });

  test("should switch between branches", async () => {
    // Create main conversation
    await callVerb(chatTreeId, "add_message", "Hello!", "user");
    const msg2_id = await callVerb(chatTreeId, "add_message", "Hi there!", "assistant");

    // Create alternate branch
    await callVerb(chatTreeId, "branch_from", msg2_id, "alternate");
    await callVerb(chatTreeId, "switch_branch", "alternate");

    const tree = getEntity(chatTreeId);
    expect(tree!["active_branch"]).toBe("alternate");

    // Add message to alternate branch
    await callVerb(chatTreeId, "add_message", "Greetings!", "assistant");

    // Check that alternate branch was updated
    const tree2 = getEntity(chatTreeId);
    expect(tree2!["branches"]["alternate"]).toBe("3");
  });

  test("should get conversation for specific branch", async () => {
    // Create main conversation
    await callVerb(chatTreeId, "add_message", "Hello!", "user");
    const msg2_id = await callVerb(chatTreeId, "add_message", "Hi there!", "assistant");
    await callVerb(chatTreeId, "add_message", "How are you?", "user");

    // Create alternate branch
    await callVerb(chatTreeId, "branch_from", msg2_id, "alternate");
    await callVerb(chatTreeId, "switch_branch", "alternate");
    await callVerb(chatTreeId, "add_message", "Greetings, traveler!", "assistant");

    // Get main conversation
    const main_conv = await callVerb(chatTreeId, "get_conversation", "main");
    expect(main_conv).toHaveLength(3);
    expect(main_conv[2].content).toBe("How are you?");

    // Get alternate conversation
    const alt_conv = await callVerb(chatTreeId, "get_conversation", "alternate");
    expect(alt_conv).toHaveLength(3);
    expect(alt_conv[2].content).toBe("Greetings, traveler!");

    // Both should share first two messages
    expect(main_conv[0].id).toBe(alt_conv[0].id);
    expect(main_conv[1].id).toBe(alt_conv[1].id);
  });

  test("should get full tree structure", async () => {
    await callVerb(chatTreeId, "add_message", "Hello!", "user");
    const msg2_id = await callVerb(chatTreeId, "add_message", "Hi!", "assistant");
    await callVerb(chatTreeId, "branch_from", msg2_id, "alt");

    const tree_data = await callVerb(chatTreeId, "get_tree");
    expect(tree_data.active_branch).toBe("main");
    expect(tree_data.branches).toHaveProperty("main");
    expect(tree_data.branches).toHaveProperty("alt");
    expect(Object.keys(tree_data.messages)).toHaveLength(2);
    expect(tree_data.next_message_id).toBe(3);
  });

  test("should delete branch", async () => {
    await callVerb(chatTreeId, "add_message", "Hello!", "user");
    const msg2_id = await callVerb(chatTreeId, "add_message", "Hi!", "assistant");
    await callVerb(chatTreeId, "branch_from", msg2_id, "alternate");

    // Delete alternate branch
    await callVerb(chatTreeId, "delete_branch", "alternate");

    const tree = getEntity(chatTreeId);
    expect(tree!["branches"]["alternate"]).toBeUndefined();
    expect(tree!["branches"]["main"]).toBeDefined();
  });

  test("should not delete main branch", async () => {
    // This should fail or return error
    await callVerb(chatTreeId, "delete_branch", "main");

    const tree = getEntity(chatTreeId);
    expect(tree!["branches"]["main"]).toBeDefined();
  });

  test("should switch to main when deleting active branch", async () => {
    await callVerb(chatTreeId, "add_message", "Hello!", "user");
    const msg2_id = await callVerb(chatTreeId, "add_message", "Hi!", "assistant");
    await callVerb(chatTreeId, "branch_from", msg2_id, "alternate");
    await callVerb(chatTreeId, "switch_branch", "alternate");

    // Delete the active branch
    await callVerb(chatTreeId, "delete_branch", "alternate");

    const tree = getEntity(chatTreeId);
    expect(tree!["active_branch"]).toBe("main");
  });

  test("should prune orphaned messages", async () => {
    // Create messages
    await callVerb(chatTreeId, "add_message", "Message 1", "user");
    const msg2_id = await callVerb(chatTreeId, "add_message", "Message 2", "assistant");
    await callVerb(chatTreeId, "add_message", "Message 3", "user");

    // Create branch
    await callVerb(chatTreeId, "branch_from", msg2_id, "alternate");
    await callVerb(chatTreeId, "switch_branch", "alternate");
    await callVerb(chatTreeId, "add_message", "Alternate 3", "assistant");

    // Now delete main branch's reference by manually setting it
    // This simulates orphaning message 3
    const tree = getEntity(chatTreeId);
    tree!["branches"]["main"] = msg2_id;

    // Prune orphans
    const deleted_count = await callVerb(chatTreeId, "prune_orphans");
    expect(deleted_count).toBe(1); // Message 3 should be pruned

    const tree2 = getEntity(chatTreeId);
    expect(tree2!["messages"]["3"]).toBeUndefined();
    expect(tree2!["messages"]["4"]).toBeDefined(); // Alternate message
  });

  test("should handle empty branch conversation", async () => {
    await callVerb(chatTreeId, "branch_from", null, "empty");
    const conversation = await callVerb(chatTreeId, "get_conversation", "empty");
    expect(conversation).toEqual([]);
  });

  test("should allow explicit parent_id when adding message", async () => {
    const msg1_id = await callVerb(chatTreeId, "add_message", "Message 1", "user");
    await callVerb(chatTreeId, "add_message", "Message 2", "assistant");

    // Add a message with explicit parent (creating a branch point)
    const msg3_id = await callVerb(
      chatTreeId,
      "add_message",
      "Alt Message 2",
      "assistant",
      msg1_id,
    );

    const tree = getEntity(chatTreeId);
    expect(tree!["messages"][msg3_id]["parent_id"]).toBe(msg1_id);
  });

  test("should handle complex branching tree", async () => {
    // Build a tree:
    //     1 (user)
    //     |
    //     2 (assistant)
    //    / \\
    //   3   4 (both user messages, different branches)

    const _msg1_id = await callVerb(chatTreeId, "add_message", "Start", "user");
    const msg2_id = await callVerb(chatTreeId, "add_message", "Response", "assistant");
    await callVerb(chatTreeId, "add_message", "Continue main", "user");

    await callVerb(chatTreeId, "branch_from", msg2_id, "branch_a");
    await callVerb(chatTreeId, "switch_branch", "branch_a");
    await callVerb(chatTreeId, "add_message", "Branch A response", "user");

    // Verify both branches exist and are different
    const main_conv = await callVerb(chatTreeId, "get_conversation", "main");
    const branch_a_conv = await callVerb(chatTreeId, "get_conversation", "branch_a");

    expect(main_conv).toHaveLength(3);
    expect(branch_a_conv).toHaveLength(3);
    expect(main_conv[2].content).toBe("Continue main");
    expect(branch_a_conv[2].content).toBe("Branch A response");
  });
});
