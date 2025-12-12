// oxlint-disable-next-line no-unassigned-import
import "../../generated_types";
import { EntityBase } from "./EntityBase";

declare const ENTITY_BASE_ID_PLACEHOLDER: number;

export class Player extends EntityBase {
  override name = "Player Base";
  override description = "A generic adventurer.";

  look() {
    const argsList = std.args();
    if (list.empty(argsList)) {
      const me = entity(std.caller().id) as EntityBase;
      const room = resolve_props(entity(me.location!)) as EntityBase;
      const contents = room.contents ?? [];
      const exits = room.exits ?? [];
      const resolvedContents = list.map(
        contents,
        (id: number) => resolve_props(entity(id)) as EntityBase,
      );
      const resolvedExits = list.map(
        exits,
        (id: number) => resolve_props(entity(id)) as EntityBase,
      );

      send("update", {
        entities: list.concat([room], list.concat(resolvedContents, resolvedExits)),
      });
    } else {
      const targetName = std.arg(0);
      const targetId = call(std.caller(), "find", targetName);
      if (targetId) {
        const target = resolve_props(entity(targetId));
        send("update", { entities: [target] });
      } else {
        send("message", "You don't see that here.");
      }
    }
  }

  inventory() {
    const player = resolve_props(std.caller()) as EntityBase;
    const contents = player.contents ?? [];
    const resolvedItems = list.map(
      contents,
      (id: number) => resolve_props(entity(id)) as EntityBase,
    );
    const finalList = list.concat([player], resolvedItems);
    send("update", { entities: finalList });
  }

  whoami() {
    send("player_id", { playerId: std.caller().id });
  }

  dig(direction: string) {
    // Note: direction is arg 0. But extracting variable args is tricky in class methods if not explicit?
    // Wait, transpile unwrap logic should handle named args.
    // If we define dig(direction: string), arg(0) is mapped to direction.
    // The original code used `std.args()` to get rest args.
    // We can define `dig(direction: string, ...rest: any[])`?
    // Our transpiler likely just maps defined args.
    // We can access `std.arg` directly if needed inside method body for extra args,
    // OR we can rely on standard library `std.args()`.
    // The original code: `const roomName = str.join(list.slice(std.args(), 1), " ");`
    // This implies variable arguments.
    // Our new transpiler logic: `const direction = std.arg(0)`.
    // `std.args()` returns ALL args.
    // So `direction` will be effectively `arg(0)`.

    // However, existing implementation used: `const direction = std.arg(0);`

    const roomName = str.join(list.slice(std.args(), 1), " ");

    if (!direction) {
      send("message", "Where do you want to dig?");
    } else {
      const createCap = get_capability("sys.create", {});
      const caller = std.caller() as EntityBase;
      const controlCap =
        get_capability("entity.control", {
          target_id: caller.location,
        }) ?? get_capability("entity.control", { "*": true });

      if (createCap && controlCap) {
        const newRoomData: Record<string, any> = {};
        newRoomData["name"] = roomName;
        const newRoomId = createCap.create(newRoomData);

        const exitData: Record<string, any> = {};
        exitData["name"] = direction;
        exitData["location"] = caller.location;
        exitData["direction"] = direction;
        exitData["destination"] = newRoomId;
        const exitId = createCap.create(exitData);

        // ENTITY_BASE_ID_PLACEHOLDER needs to be handled.
        // In the original file it was an injected number by string replacement.
        // Here we are compiling TypeScript. We can't easily inject it AFTER compile unless we return string code.
        // BUT wait, `transpile` returns S-expression.
        // `EntityBase.ts` and `Player.ts` are compiled at runtime by `loader.ts`?
        // No, `loader.ts` reads the file source and transpiles it.
        // It's still using `transpile()`.
        // So `ENTITY_BASE_ID_PLACEHOLDER` will be transpiled as a variable.
        // We probably want to pass `EntityBase` ID into the constructor or closure?
        // Or we can rely on Global `entity_base_id`?
        // Or we can assume we will string-replace it in the loader potentially.
        // The original code `transpile(extractVerb(...).replace(...))` did string replacement on source.
        // We can do the same in `loader.ts` if we define placeholders.
        // But `loader.ts` parses AST.
        // If we leave `ENTITY_BASE_ID_PLACEHOLDER` as a global variable, the transpiler emits `std.var("ENTITY_BASE_ID_PLACEHOLDER")` (or similar).
        // If we want it to be a literal number, we need to replace it in the emitted code OR source.
        // Let's assume for now we will string replace in `seed.ts` logic on the emitted code string?
        // Actually, `loader.ts` returns `ScriptValue`. Replacing in JSON structure is hard.
        // Ideally we resolve it at runtime?
        // But `EntityBase` is created during seed. It has a dynamic ID.
        // Maybe we store `EntityBase` ID in a known place? Like System?
        // OR we just use `call(system, "get_entity_base_id")`?
        // That seems cleaner.
        // But for now to match exactly...
        // Let's assume I will replace the variable in `seed.ts` after loading.
        // OR I can use the same string replacement trick if I expose the source code from loader?
        // Loader returns `Map<string, ScriptValue>`.
        // I can change loader to perform replacements?
        // Let's stick to the placeholder and I'll handle replacement in `seed.ts`.
        // But I need to ensure `ENTITY_BASE_ID_PLACEHOLDER` is valid TS for `ts.createSourceFile`.
        // `declare const` works for that.

        controlCap.setPrototype(newRoomId, ENTITY_BASE_ID_PLACEHOLDER);

        const currentRoom = entity(caller.location!) as EntityBase;
        const exits = currentRoom.exits ?? [];
        list.push(exits, exitId);
        controlCap.update(currentRoom.id, { exits });

        // Back exit
        const backExitData: Record<string, any> = {};
        backExitData["name"] = "back";
        backExitData["location"] = newRoomId;
        backExitData["direction"] = "back";
        backExitData["destination"] = caller.location;
        const backExitId = createCap.create(backExitData);

        const newRoom = entity(newRoomId);
        const newExits: number[] = [];
        list.push(newExits, backExitId);

        const newRoomCap = get_capability("entity.control", {
          target_id: newRoomId,
        });
        if (newRoomCap) {
          newRoomCap.update(newRoom.id, { exits: newExits });
        }

        send("message", "You dig a new room.");
        call(std.caller(), "teleport", entity(newRoomId));
      } else {
        send("message", "You cannot dig here.");
      }
    }
  }

  create(name: string) {
    if (!name) {
      send("message", "What do you want to create?");
      return;
    }
    const createCap = get_capability("sys.create");
    const caller = std.caller() as EntityBase;
    const controlCap =
      get_capability("entity.control", { target_id: caller.location }) ??
      get_capability("entity.control", { "*": true });
    if (!createCap || !controlCap) {
      send("message", "You do not have permission to create here.");
      return;
    }
    const itemData: Record<string, any> = {};
    itemData["name"] = name;
    itemData["location"] = caller.location;
    const itemId = createCap.create(itemData);
    controlCap.setPrototype(itemId, ENTITY_BASE_ID_PLACEHOLDER);

    const room = entity(caller.location!) as EntityBase;
    const roomId = room.id;
    if (!roomId) {
      send("message", "Unknown room");
      return;
    }
    if (!itemId) {
      send("message", "Unknown item");
      return;
    }
    const contents = room.contents ?? [];
    const newContents = list.concat(contents, [itemId]);
    controlCap.update(roomId, { contents: newContents });
    send("message", `You create ${name}.`);
    call(std.caller(), "look");
    return itemId;
  }

  set(targetName: string, propName: string, value: unknown) {
    if (!targetName) {
      send("message", "Usage: set <target> <prop> <value>");
      return;
    }
    if (!propName) {
      send("message", "Usage: set <target> <prop> <value>");
      return;
    }
    const targetId = call(this, "find", targetName);
    if (!targetId) {
      send("message", "I don't see that here.");
      return;
    }
    const controlCap =
      get_capability("entity.control", { target_id: targetId }) ??
      get_capability("entity.control", { "*": true });
    if (!controlCap) {
      send("message", "You do not have permission to modify this object.");
      return;
    }
    controlCap.update(targetId, { [propName]: value });
    send("message", "Property set.");
  }

  // Quest verbs
  quest_start() {
    const questId = std.arg<number>(0);
    const player = std.caller();

    if (!questId) {
      send("message", "Quest ID required.");
      return;
    }

    // Need control to update player state
    let controlCap = get_capability("entity.control", { target_id: player.id });
    if (!controlCap) {
      controlCap = get_capability("entity.control", { "*": true });
    }

    if (!controlCap) {
      send("message", "Permission denied: Cannot modify player quest state.");
      return;
    }

    // Fetch quest structure
    const questEnt = entity(questId);
    const structure = call(questEnt, "get_structure") as any;
    if (!structure) {
      send("message", "Invalid quest: No structure defined.");
      return;
    }

    const quests = (player["quests"] as Record<string, any>) ?? {};

    if (quests[String(questId)] && quests[String(questId)].status !== "completed") {
      send("message", "Quest already started.");
      return;
    }

    // Initialize state
    const questState: any = {
      started_at: time.to_timestamp(time.now()),
      status: "active",
      tasks: {},
    };

    const rootId = structure.id;
    questState.tasks[rootId] = { status: "active" };
    quests[String(questId)] = questState;
    controlCap.update(player.id, { quests });
    send("message", `Quest Started: ${structure.description || questEnt["name"]}`);

    call(player, "quest_update", questId, rootId, "active");
  }

  quest_update() {
    const questId = std.arg<number>(0);
    const taskId = std.arg<string>(1);
    const status = std.arg<string>(2); // "active" or "completed"
    const player = std.caller();

    let controlCap = get_capability("entity.control", { target_id: player.id });
    if (!controlCap) {
      controlCap = get_capability("entity.control", { "*": true });
    }

    if (!controlCap) {
      return;
    }

    const quests = (player["quests"] as Record<string, any>) ?? {};
    const qState = quests[String(questId)];
    if (!qState || qState.status !== "active") {
      return;
    }

    const currentTaskState = qState.tasks[taskId] || {};

    if (currentTaskState.status === status) {
      return;
    }

    qState.tasks[taskId] = { ...currentTaskState, status: status };

    controlCap.update(player.id, { quests });

    const questEnt = entity(questId);
    const structure = call(questEnt, "get_structure") as any;
    const node = call(questEnt, "get_node", taskId) as any;

    if (!node) {
      return;
    }

    if (status === "active") {
      if (node.type === "sequence") {
        if (node.children && list.len(node.children) > 0) {
          call(player, "quest_update", questId, node.children[0], "active");
        } else {
          call(player, "quest_update", questId, taskId, "completed");
        }
      } else if (node.type === "parallel_all" || node.type === "parallel_any") {
        if (node.children) {
          for (const childId of node.children) {
            call(player, "quest_update", questId, childId, "active");
          }
        }
      }
    } else if (status === "completed") {
      if (node.parent_id) {
        const parentNode = call(questEnt, "get_node", node.parent_id) as any;
        if (parentNode) {
          if (parentNode.type === "sequence") {
            let nextChildId;
            let found = false;
            for (const childId of parentNode.children) {
              if (found) {
                nextChildId = childId;
                break;
              }
              if (childId === taskId) {
                found = true;
              }
            }

            if (nextChildId) {
              call(player, "quest_update", questId, nextChildId, "active");
            } else {
              call(player, "quest_update", questId, parentNode.id, "completed");
            }
          } else if (parentNode.type === "parallel_all") {
            let allComplete = true;
            const freshPlayer = std.caller();
            const freshQuests = freshPlayer["quests"] as any;
            const freshQState = freshQuests[String(questId)];

            for (const childId of parentNode.children) {
              const childTask = freshQState.tasks[childId];
              if (!childTask || childTask.status !== "completed") {
                allComplete = false;
                break;
              }
            }

            if (allComplete) {
              call(player, "quest_update", questId, parentNode.id, "completed");
            }
          } else if (parentNode.type === "parallel_any") {
            call(player, "quest_update", questId, parentNode.id, "completed");
          }
        }
      } else {
        if (taskId === structure.id) {
          qState.status = "completed";
          qState.completed_at = time.to_timestamp(time.now());
          controlCap.update(player.id, { quests });
          send("message", `Quest Completed: ${structure.description || questEnt["name"]}!`);
        }
      }
    }
  }

  quest_log() {
    const player = std.caller();
    const quests = (player["quests"] as Record<string, any>) ?? {};

    if (list.len(obj.keys(quests)) === 0) {
      send("message", "No active quests.");
      return;
    }

    let output = "Quest Log:\n";

    for (const qId of obj.keys(quests)) {
      const qState = quests[qId];
      if (qState.status !== "active") {
        continue;
      }

      const questEnt = entity(std.int(qId));
      const structure = call(questEnt, "get_structure") as any;

      output = str.concat(output, `\n[${questEnt["name"]}]\n`);

      const stack: any[] = [{ depth: 0, id: structure.id }];

      while (list.len(stack) > 0) {
        const item = list.pop(stack);
        const node = call(questEnt, "get_node", item.id) as any;
        const taskState = qState.tasks[item.id] || { status: "locked" };

        let indent = "";
        let idx = 0;
        while (idx < item.depth) {
          indent = str.concat(indent, "  ");
          idx += 1;
        }

        let mark = "[ ]";
        if (taskState.status === "completed") {
          mark = "[x]";
        } else if (taskState.status === "active") {
          mark = "[>]";
        }

        output = str.concat(output, `${indent}${mark} ${node.description}\n`);

        if (node.children) {
          let idx = list.len(node.children) - 1;
          while (idx >= 0) {
            list.push(stack, { depth: item.depth + 1, id: node.children[idx] });
            idx -= 1;
          }
        }
      }
    }

    call(player, "tell", output);
  }
}
