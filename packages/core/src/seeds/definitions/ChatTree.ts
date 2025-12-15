// oxlint-disable-next-line no-unassigned-import
import "../../generated_types";
import { EntityBase } from "./EntityBase";

export class ChatTree extends EntityBase {
  messages!: Record<string, any>;
  next_message_id!: number;
  active_branch!: string | null;
  branches!: Record<string, string | number>;
  [key: string]: unknown;

  add_message() {
    const content = std.arg<string>(0);
    const role = std.arg<string>(1);
    const parent_id = std.arg<string | number | null>(2);

    if (!content || !role) {
      send("message", "Usage: add_message <content> <role> [parent_id]");
      return;
    }

    // Initialize on first use
    if (!this.messages) {
      this.messages = {};
    }
    if (this.next_message_id === undefined) {
      this.next_message_id = 1;
    }
    if (!this.branches) {
      this.branches = { main: null };
    }
    if (this.active_branch === undefined) {
      this.active_branch = "main";
    }

    // Generate new message ID
    const msg_id = String(this.next_message_id);
    this.next_message_id += 1;

    // Determine parent
    let actual_parent_id = parent_id;
    if (actual_parent_id === null || actual_parent_id === undefined) {
      // Use current branch head as parent
      const branch_name = this.active_branch ?? "main";
      actual_parent_id = this.branches[branch_name] ?? null;
    }

    // Create message
    const message = {
      content,
      id: msg_id,
      parent_id: actual_parent_id,
      role,
    };

    // Add to messages map
    this.messages[msg_id] = message;

    // Update active branch head
    const branch_name = this.active_branch ?? "main";
    this.branches[branch_name] = msg_id;

    send("message", `Added message ${msg_id} to branch '${branch_name}'`);
    return msg_id;
  }

  branch_from() {
    const message_id = std.arg<string | number>(0);
    const branch_name = std.arg<string>(1);

    if (!message_id || !branch_name) {
      send("message", "Usage: branch_from <message_id> <branch_name>");
      return;
    }

    if (!this.messages || !this.messages[String(message_id)]) {
      send("message", `Error: Message ${message_id} not found`);
      return;
    }

    if (this.branches && this.branches[branch_name]) {
      send("message", `Error: Branch '${branch_name}' already exists`);
      return;
    }

    // Create new branch pointing to this message
    if (!this.branches) {
      this.branches = {};
    }
    this.branches[branch_name] = message_id;

    send("message", `Created branch '${branch_name}' at message ${message_id}`);
    return branch_name;
  }

  switch_branch() {
    const branch_name = std.arg<string>(0);

    if (!branch_name) {
      send("message", "Usage: switch_branch <branch_name>");
      return;
    }

    if (!this.branches || !this.branches[branch_name]) {
      send("message", `Error: Branch '${branch_name}' not found`);
      return;
    }

    this.active_branch = branch_name;
    send("message", `Switched to branch '${branch_name}'`);
    return branch_name;
  }

  get_conversation() {
    const branch_name = std.arg<string | null>(0);

    // Initialize data structures if needed
    if (!this.messages) {
      this.messages = {};
    }
    if (!this.branches) {
      this.branches = { main: null };
    }

    // Use active branch if not specified
    const target_branch = branch_name ?? this.active_branch ?? "main";

    if (this.branches[target_branch] === undefined) {
      send("message", `Error: Branch '${target_branch}' not found`);
      return [];
    }

    const messages_map = this.messages;
    const head_id = this.branches[target_branch];

    if (head_id === null || head_id === undefined) {
      // Empty branch
      return [];
    }

    // Walk backwards from head
    const conversation = [];
    let current_id: string | number | null = head_id;

    while (current_id !== null && current_id !== undefined) {
      const msg = messages_map[String(current_id)];
      if (!msg) {
        send("message", `Warning: Message ${current_id} not found in chain`);
        break;
      }

      conversation.push(msg);
      current_id = msg.parent_id;
    }

    // Reverse for chronological order
    conversation.reverse();
    return conversation;
  }

  get_tree() {
    // Return full tree structure for visualization
    const tree_data = {
      active_branch: this.active_branch ?? "main",
      branches: this.branches ?? {},
      messages: this.messages ?? {},
      next_message_id: this.next_message_id ?? 1,
    };

    return tree_data;
  }

  delete_branch() {
    const branch_name = std.arg<string>(0);

    if (!branch_name) {
      send("message", "Usage: delete_branch <branch_name>");
      return;
    }

    if (branch_name === "main") {
      send("message", "Error: Cannot delete 'main' branch");
      return;
    }

    if (!this.branches || !this.branches[branch_name]) {
      send("message", `Error: Branch '${branch_name}' not found`);
      return;
    }

    // Remove branch pointer
    delete this.branches[branch_name];

    // If this was the active branch, switch to main
    if (this.active_branch === branch_name) {
      this.active_branch = "main";
      send("message", `Deleted branch '${branch_name}' and switched to 'main'`);
    } else {
      send("message", `Deleted branch '${branch_name}'`);
    }

    return true;
  }

  prune_orphans() {
    // Mark all reachable messages
    const reachable: Record<string, boolean> = {};
    const branches = this.branches ?? {};
    const messages_map = this.messages ?? {};

    // Walk from each branch head
    for (const branch_name in branches) {
      let current_id: string | number | null = branches[branch_name];

      while (current_id !== null && current_id !== undefined) {
        const id_str = String(current_id);
        if (reachable[id_str]) {
          break; // Already processed this path
        }

        reachable[id_str] = true;
        const msg = messages_map[id_str];
        if (!msg) {
          break;
        }

        current_id = msg.parent_id;
      }
    }

    // Delete unreachable messages
    let deleted_count = 0;
    for (const msg_id in messages_map) {
      if (!reachable[msg_id]) {
        delete messages_map[msg_id];
        deleted_count += 1;
      }
    }

    send("message", `Pruned ${deleted_count} orphaned message(s)`);
    return deleted_count;
  }
}
