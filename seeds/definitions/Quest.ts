// oxlint-disable-next-line no-unassigned-import
import "../../generated_types";
import { EntityBase } from "./EntityBase";

export class QuestBase extends EntityBase {
  structure!: any; // Or specific type
  nodes_map!: Record<string, any>;
  [key: string]: unknown;

  get_structure() {
    return this.structure;
  }

  get_node() {
    const nodeId = std.arg<string>(0);
    const map = this.nodes_map as Record<string, any>;
    return map ? map[nodeId] : undefined;
  }

  test() {
    const player = std.arg<Entity>(0);
    const questId = std.arg<number>(1);

    if (!player || !questId) {
      send("message", "Usage: test <player> <quest_id>");
      return;
    }

    send("message", "--- Quest Verification Start ---");

    // 1. Start Quest
    call(player, "quest_start", questId);

    // 2. Check State (Indirectly via log or peeking prop)
    // We can peek prop if we have sudo/control, or just trust logs.
    // Let's print log.
    call(player, "quest_log");

    // 3. Complete Task 1 (Get Chips)
    send("message", "--- Completing 'get_chips' ---");
    call(player, "quest_update", questId, "get_chips", "completed");
    call(player, "quest_log");

    // 4. Complete Task 2 (Get Drinks)
    send("message", "--- Completing 'get_drinks' ---");
    call(player, "quest_update", questId, "get_drinks", "completed");
    // This should complete "gather_supplies" (Parallel All) and activate "invite_friends"
    call(player, "quest_log");

    // 5. Complete Task 3 (Invite Friends)
    send("message", "--- Completing 'invite_friends' ---");
    call(player, "quest_update", questId, "invite_friends", "completed");
    // This should complete "party_prep" (Root)

    // Final Log
    call(player, "quest_log");

    send("message", "--- Quest Verification End ---");
  }
}
