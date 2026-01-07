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

    const controlCap = get_capability("entity.control", { "*": true });
    if (!controlCap) {
      send("message", "Error: Missing entity.control capability");
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
      this.branches = { main: null! };
    }
    if (this.active_branch === undefined) {
      this.active_branch = "main";
    }

    // Generate new message ID
    const msg_id = this.next_message_id;
    this.next_message_id += 1;

    // Determine parent
    let actual_parent_id = parent_id;
    if (actual_parent_id === null || actual_parent_id === undefined) {
      // Use current branch head as parent
      const branch_name = this.active_branch ?? "main";
      actual_parent_id = this.branches[branch_name] ?? null;
    }

    // Create message - use string key for consistency with DB retrieval
    const message = {
      content: content,
      id: msg_id,
      parent_id: actual_parent_id,
      role: role,
    };

    // Add to messages map using string key
    this.messages[String(msg_id)] = message;

    // Update active branch head
    const branch_name = this.active_branch ?? "main";
    this.branches[branch_name] = msg_id;

    // Persist changes to database
    controlCap.update(this, {
      branches: this.branches,
      messages: this.messages,
      next_message_id: this.next_message_id,
    });

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

    const controlCap = get_capability("entity.control", { "*": true });
    if (!controlCap) {
      send("message", "Error: Missing entity.control capability");
      return;
    }

    if (!this.messages || !this.messages[String(message_id)]) {
      send("message", `Error: Message ${message_id} not found`);
      return;
    }

    if (this.branches && branch_name in this.branches) {
      send("message", `Error: Branch '${branch_name}' already exists`);
      return;
    }

    // Create new branch pointing to this message
    if (!this.branches) {
      this.branches = {};
    }
    this.branches[branch_name] = message_id;

    // Persist changes
    controlCap.update(this, { branches: this.branches });

    send("message", `Created branch '${branch_name}' at message ${message_id}`);
    return branch_name;
  }

  switch_branch() {
    const branch_name = std.arg<string>(0);

    if (!branch_name) {
      send("message", "Usage: switch_branch <branch_name>");
      return;
    }

    const controlCap = get_capability("entity.control", { "*": true });
    if (!controlCap) {
      send("message", "Error: Missing entity.control capability");
      return;
    }

    if (!this.branches || !this.branches[branch_name]) {
      send("message", `Error: Branch '${branch_name}' not found`);
      return;
    }

    this.active_branch = branch_name;

    // Persist changes
    controlCap.update(this, { active_branch: this.active_branch });

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
      this.branches = { main: null! };
    }

    // Use active branch if not specified
    const target_branch = branch_name ?? this.active_branch ?? "main";

    if (!(target_branch in this.branches)) {
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
    const conversation: any[] = [];
    let current_id: string | number | null = head_id;

    while (current_id !== null && current_id !== undefined) {
      const msg = messages_map[String(current_id)] as any;
      if (!msg) {
        send("message", `Warning: Message ${current_id} not found in chain`);
        break;
      }

      list.push(conversation, msg);
      current_id = msg.parent_id;
    }

    // Reverse for chronological order
    return list.reverse(conversation);
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

    const controlCap = get_capability("entity.control", { "*": true });
    if (!controlCap) {
      send("message", "Error: Missing entity.control capability");
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
      // Persist both changes
      controlCap.update(this, {
        active_branch: this.active_branch,
        branches: this.branches,
      });
      send("message", `Deleted branch '${branch_name}' and switched to 'main'`);
    } else {
      // Just persist branch deletion
      controlCap.update(this, { branches: this.branches });
      send("message", `Deleted branch '${branch_name}'`);
    }

    return true;
  }

  prune_orphans() {
    const controlCap = get_capability("entity.control", { "*": true });
    if (!controlCap) {
      send("message", "Error: Missing entity.control capability");
      return 0;
    }

    // Mark all reachable messages
    const reachable: Record<string, boolean> = {};
    const branches = this.branches ?? {};
    const messages_map = this.messages ?? {};

    // Walk from each branch head
    const branch_names = obj.keys(branches);
    for (const branch_name of branch_names) {
      let current_id: string | number | null = obj.get(branches, branch_name, null!);

      while (current_id !== null && current_id !== undefined) {
        const id_str = String(current_id) as string;
        if (obj.get(reachable, id_str, false)) {
          break; // Already processed this path
        }

        obj.set(reachable, id_str, true);
        const msg = obj.get(messages_map, id_str, null);
        if (!msg) {
          break;
        }

        current_id = obj.get(msg, "parent_id", null);
      }
    }

    // Delete unreachable messages
    let deleted_count = 0;
    const msg_ids = obj.keys(messages_map);
    for (const msg_id of msg_ids) {
      if (!obj.get(reachable, msg_id, false)) {
        obj.del(messages_map, msg_id);
        deleted_count += 1;
      }
    }

    // Persist changes
    controlCap.update(this, { messages: messages_map });

    send("message", `Pruned ${deleted_count} orphaned message(s)`);
    return deleted_count;
  }
}
