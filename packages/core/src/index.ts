import { WebSocketServer, WebSocket } from "ws";
import { db } from "./db";
import { seed } from "./seed";
import {
  getEntity,
  getContents,
  moveEntity,
  createEntity,
  updateEntity,
  deleteEntity,
  getVerbs,
  getAllEntities,
  getVerb,
} from "./repo";
import { checkPermission } from "./permissions";
import { PluginManager, CommandContext } from "./plugin";
import { scheduler } from "./scheduler";
import {
  evaluate,
  ScriptSystemContext,
  registerLibrary,
} from "./scripting/interpreter";
import { StringLibrary } from "./scripting/lib/string";
import { ObjectLibrary } from "./scripting/lib/object";
import { TimeLibrary } from "./scripting/lib/time";
import { WorldLibrary } from "./scripting/lib/world";
import { ListLibrary } from "./scripting/lib/list";

export { PluginManager };
export type { CommandContext };
export type { Plugin, PluginContext } from "./plugin";

export const pluginManager = new PluginManager();

const GAS_LIMIT = 1000;

export function startServer(port: number = 8080) {
  // Register libraries
  registerLibrary(StringLibrary);
  registerLibrary(ObjectLibrary);
  registerLibrary(TimeLibrary);
  registerLibrary(WorldLibrary);
  registerLibrary(ListLibrary);

  seed();

  const wss = new WebSocketServer({ port });

  console.log(`Viwo Core Server running on port ${port}`);

  // Start Scheduler
  scheduler.setContextFactory(() => ({
    move: (id, dest) => updateEntity(id, { location_id: dest }),
    create: createEntity,
    send: (msg) => console.log("[Scheduler System Message]:", msg),
    destroy: deleteEntity,
    getAllEntities,
    schedule: scheduler.schedule.bind(scheduler),
    broadcast: (msg, locationId) => {
      wss.clients.forEach((client) => {
        const c = client as Client;
        if (c.readyState === WebSocket.OPEN && c.playerId) {
          if (!locationId) {
            c.send(JSON.stringify({ type: "message", text: msg }));
          } else {
            const p = getEntity(c.playerId);
            if (p && p.location_id === locationId) {
              c.send(JSON.stringify({ type: "message", text: msg }));
            }
          }
        }
      });
    },
    give: (entityId, destId, newOwnerId) => {
      updateEntity(entityId, { location_id: destId, owner_id: newOwnerId });
    },
    // We can add `call` and `triggerEvent` here too if needed for background tasks
  }));

  setInterval(() => {
    scheduler.process();
  }, 1000);

  interface Client extends WebSocket {
    playerId?: number;
  }

  wss.on("connection", (ws: Client) => {
    console.log("New client connected");

    const sys: ScriptSystemContext = {
      move: (id, dest) => updateEntity(id, { location_id: dest }),
      create: createEntity,
      send: (msg) => ws.send(JSON.stringify(msg)),
      destroy: deleteEntity,
      getAllEntities,
      schedule: scheduler.schedule.bind(scheduler),
      broadcast: (msg, locationId) => {
        wss.clients.forEach((client) => {
          const c = client as Client;
          if (c.readyState === WebSocket.OPEN && c.playerId) {
            if (!locationId) {
              // Global
              c.send(JSON.stringify({ type: "message", text: msg }));
            } else {
              // Local
              const p = getEntity(c.playerId);
              if (p && p.location_id === locationId) {
                c.send(JSON.stringify({ type: "message", text: msg }));
              }
            }
          }
        });
      },
      give: (entityId, destId, newOwnerId) => {
        // Update location and owner
        updateEntity(entityId, { location_id: destId, owner_id: newOwnerId });
      },
      call: async (caller, targetId, verbName, callArgs, warnings) => {
        const targetVerb = getVerb(targetId, verbName);
        const targetEnt = getEntity(targetId);
        if (targetVerb && targetEnt) {
          return await evaluate(targetVerb.code, {
            caller, // Caller remains original player? Or the entity? Usually original caller for permissions.
            this: targetEnt,
            args: callArgs,
            gas: GAS_LIMIT / 2, // Sub-call gas limit?
            warnings, // Share warnings array
            sys,
          });
        }
        return null;
      },
      // Recursive calls allowed?
      triggerEvent: async (eventName, locationId, args, excludeEntityId) => {
        const contents = getContents(locationId);
        // Also include the room itself?
        // Let's include the room itself in the check
        const room = getEntity(locationId);
        const entities = room ? [room, ...contents] : contents;

        for (const entity of entities) {
          if (excludeEntityId && entity.id === excludeEntityId) continue;

          const verb = getVerb(entity.id, eventName);
          if (verb) {
            // We need to import evaluate here or pass it in.
            // Since we are inside the connection handler, we can import it once at top or here.
            const { evaluate } = require("./scripting/interpreter");
            try {
              await evaluate(verb.code, {
                caller: entity, // The entity running the script is the caller/agent
                this: entity,
                args: args,
                gas: GAS_LIMIT / 2,
                sys,
                warnings: [],
              });
            } catch (e) {
              console.error(
                `Error triggering ${eventName} on ${entity.id}:`,
                e,
              );
            }
          }
        }
      },
    };

    // Auto-login as the Guest player for now
    const guest = db
      .query("SELECT id FROM entities WHERE name = 'Guest'")
      .get() as { id: number };
    if (guest) {
      ws.playerId = guest.id;
      ws.send(
        JSON.stringify({
          type: "message",
          text: `Welcome to Viwo! You are logged in as Guest (ID: ${guest.id}).`,
        }),
      );
    } else {
      ws.send(
        JSON.stringify({
          type: "error",
          text: "Error: Guest player not found. Please re-seed.",
        }),
      );
    }

    ws.on("message", async (message) => {
      let data: unknown;
      try {
        data = JSON.parse(message.toString());
      } catch {
        ws.send(JSON.stringify({ type: "error", text: "Invalid JSON." }));
        return;
      }

      if (!Array.isArray(data) || typeof data[0] !== "string") {
        ws.send(
          JSON.stringify({
            type: "error",
            text: "Invalid S-expression format.",
          }),
        );
        return;
      }

      const [command, ...args] = data as [string, ...unknown[]];

      console.log(
        `[Player ${ws.playerId}] Command: ${command}, Args: ${JSON.stringify(
          args,
        )}`,
      );

      if (!ws.playerId) return;

      const player = getEntity(ws.playerId);
      if (!player) return;

      // Helper to resolve dynamic properties (get_*)
      const resolveEntityProps = async (entity: any) => {
        const props = { ...entity.props };
        const verbs = getVerbs(entity.id);

        for (const verb of verbs) {
          if (verb.name.startsWith("get_")) {
            const propName = verb.name.substring(4); // remove "get_"
            try {
              const result = await evaluate(verb.code, {
                caller: entity,
                this: entity,
                args: [],
                gas: 500,
                sys, // Use the sys object we created
                warnings: [],
              });
              if (result !== undefined && result !== null) {
                props[propName] = result;
              }
            } catch (e) {
              console.error(
                `Error resolving property ${propName} for ${entity.id}`,
                e,
              );
            }
          }
        }
        return props;
      };

      // Helper to send room update
      const sendRoom = async (roomId: number) => {
        const room = getEntity(roomId);
        if (!room) return;

        // CSS Inheritance: Parent (Zone) -> Room
        let customCss = room.props["custom_css"] || "";
        if (room.location_id) {
          const parent = getEntity(room.location_id);
          if (parent && (parent.kind === "ZONE" || parent.kind === "ROOM")) {
            const parentCss = parent.props["custom_css"];
            if (parentCss) {
              customCss = `${parentCss}\n${customCss}`;
            }
          }
        }

        const contents = getContents(room.id).filter((e) => e.id !== player.id);
        const richContents = await Promise.all(
          contents.map(async (item) => {
            const props = await resolveEntityProps(item);

            const richItem: any = {
              id: item.id,
              name: item.name,
              kind: item.kind,
              location_detail: item.location_detail,
              description: props["description"],
              adjectives: props["adjectives"],
              custom_css: props["custom_css"],
              contents: getContents(item.id).map((sub) => ({
                id: sub.id,
                name: sub.name,
                kind: sub.kind,
                contents: [],
                custom_css: sub.props["custom_css"], // Should we resolve sub-items too? Maybe later.
                verbs: getVerbs(sub.id).map((v) => v.name),
              })),
              verbs: getVerbs(item.id).map((v) => v.name),
            };

            if (item.kind === "EXIT" && item.props["destination_id"]) {
              const dest = getEntity(item.props["destination_id"]);
              if (dest) {
                richItem.destination_name = dest.name;
              }
            }

            return richItem;
          }),
        );

        ws.send(
          JSON.stringify({
            type: "room",
            name: room.name,
            description: room.props["description"] || "Nothing special.",
            custom_css: customCss,
            image: room.props["image"],
            contents: richContents,
          }),
        );
      };

      const sendInventory = async (playerId: number) => {
        const items = getContents(playerId);
        const richItems = await Promise.all(
          items.map(async (item) => {
            const props = await resolveEntityProps(item);
            return {
              id: item.id,
              name: item.name,
              kind: item.kind,
              location_detail: item.location_detail,
              adjectives: props["adjectives"],
              custom_css: props["custom_css"],
              contents: getContents(item.id).map((sub) => ({
                id: sub.id,
                name: sub.name,
                kind: sub.kind,
                contents: [],
                custom_css: sub.props["custom_css"],
                verbs: getVerbs(sub.id).map((v) => v.name),
              })),
              verbs: getVerbs(item.id).map((v) => v.name),
            };
          }),
        );

        const client = Array.from(wss.clients).find(
          (c: any) => c.playerId === playerId,
        );
        if (client && client.readyState === WebSocket.OPEN) {
          client.send(
            JSON.stringify({
              type: "inventory",
              items: richItems,
            }),
          );
        }
      };

      const sendItem = async (itemId: number) => {
        const item = getEntity(itemId);
        if (!item) return;

        const richContents = await Promise.all(
          getContents(item.id).map(async (sub) => {
            const props = await resolveEntityProps(sub);
            return {
              id: sub.id,
              name: sub.name,
              kind: sub.kind,
              contents: [],
              location_detail: sub.location_detail,
              description: props["description"],
              adjectives: props["adjectives"],
              custom_css: props["custom_css"],
              verbs: getVerbs(sub.id).map((v) => v.name),
            };
          }),
        );

        const props = await resolveEntityProps(item);

        // Send item details to the client who requested it (via ws)
        // Note: `sendInventory` uses `wss.clients` because it takes a playerId,
        // but `sendItem` is context-aware and sends to the current connection.

        ws.send(
          JSON.stringify({
            type: "item",
            name: item.name,
            description: props["description"] || "It's just a thing.",
            contents: richContents,
            adjectives: props["adjectives"],
            custom_css: props["custom_css"],
            verbs: getVerbs(item.id).map((v) => v.name),
          }),
        );
      };

      // Plugin Hook
      const ctx: CommandContext = {
        player: { id: player.id, ws },
        command,
        args: args,
        send: (msg) => ws.send(JSON.stringify(msg)),
        core: {
          getEntity,
          getContents,
          moveEntity,
          createEntity,
          updateEntity,
          deleteEntity,
          sendRoom,
          sendInventory,
          sendItem,
          canEdit: (playerId, entityId) => {
            const player = getEntity(playerId);
            const entity = getEntity(entityId);
            if (!player || !entity) return false;
            return checkPermission(player, entity, "edit");
          },
        },
      };

      if (await pluginManager.handleCommand(ctx)) {
        return;
      }

      // --- SCRIPTING ENGINE INTEGRATION ---

      // 1. Check verbs on 'me' (the player)
      let verb = getVerb(player.id, command);
      let targetEntity = player;

      // 2. Check verbs on room
      if (!verb && player.location_id) {
        verb = getVerb(player.location_id, command);
        if (verb) {
          const { getEntity } = await import("./repo");
          targetEntity = getEntity(player.location_id)!;
        }
      }

      // 3. Check verbs on items in room (if command is "verb item")
      if (!verb) {
        const parts = command.split(" ");
        if (parts.length > 1) {
          const verbName = parts[0];
          const targetName = parts.slice(1).join(" ");

          // Find target in room or inventory
          const roomContents = player.location_id
            ? getContents(player.location_id)
            : [];
          const inventory = getContents(player.id);
          const allVisible = [...roomContents, ...inventory];

          const target = allVisible.find(
            (e) => e.name.toLowerCase() === targetName.toLowerCase(),
          );

          if (target && verbName) {
            const targetVerb = getVerb(target.id, verbName);
            if (targetVerb) {
              verb = targetVerb;
              targetEntity = target;
              // Adjust args to exclude the target name if needed?
              // Actually, the command was split. The original args are still passed.
              // If the user typed "look apple", command is "look apple" (if sent as string)
              // But here `command` is the first element of the S-expression list.
              // If the client sends ["look apple"], then command is "look apple".
              // If the client sends ["look", "apple"], then command is "look" and args is ["apple"].
              // The current client implementation sends ["look apple"] for typed commands?
              // Let's check the client code or assume standard behavior.
              // The `ws.on("message")` parses JSON.
              // If the client sends `["look apple"]`, then `command` is "look apple".
              // If the client sends `["look", "apple"]`, then `command` is "look".

              // If we are here, `command` was NOT a verb on player/room.
              // So it might be "verb target".
              // If we matched "verb target", we should probably pass the rest of the args?
              // But `args` variable currently holds the rest of the S-expression.
              // If `command` was "look apple", `args` is empty.
              // So we don't need to adjust args.
            }
          }
        }
      }

      if (verb) {
        try {
          const warnings: string[] = [];
          await evaluate(verb.code, {
            caller: player,
            this: targetEntity,
            args: args || [],
            gas: GAS_LIMIT,
            warnings,
            sys,
          });

          if (warnings.length > 0) {
            ws.send(
              JSON.stringify({
                type: "message",
                text: `[Warnings]: ${warnings.join(", ")}`,
              }),
            );
          }
        } catch (e: any) {
          ws.send(
            JSON.stringify({
              type: "error",
              text: `Script error: ${e.message}`,
            }),
          );
        }
        return;
      }

      // If no verb handled the command, try built-in commands
      // TODO: Move these to verbs on the player/room eventually.
      if (command === "login") {
        const id = args[0];
        if (typeof id !== "number") {
          ws.send(
            JSON.stringify({ type: "error", text: "Invalid player ID." }),
          );
          return;
        }
        const player = getEntity(id);
        if (player) {
          ws.playerId = id;
          ws.send(
            JSON.stringify({
              type: "message",
              text: `Logged in as ${player.name} (ID: ${player.id}).`,
            }),
          );
        } else {
          ws.send(JSON.stringify({ type: "error", text: "Player not found." }));
        }
      } else if (command === "create_player") {
        const name = args[0];
        if (typeof name !== "string") {
          ws.send(
            JSON.stringify({ type: "error", text: "Invalid player name." }),
          );
          return;
        }
        // Default start location (Void or Room 1)
        // For now, let's try to find a "Start" room or just use 1
        const startRoom = db
          .query("SELECT id FROM entities WHERE kind = 'ROOM' LIMIT 1")
          .get() as { id: number };
        const locationId = startRoom ? startRoom.id : undefined;

        const newId = createEntity({
          name,
          kind: "ACTOR",
          ...(locationId !== undefined ? { location_id: locationId } : {}),
          props: { description: "A new player." },
        });

        ws.send(
          JSON.stringify({
            type: "player_created",
            name,
            id: newId,
          }),
        );
      } else {
        ws.send(
          JSON.stringify({
            type: "message",
            text: `Unknown command: ${command}`,
          }),
        );
      }
    });

    ws.on("close", () => {
      console.log("Client disconnected");
    });
  });

  // Keep the process alive
  process.on("SIGINT", () => {
    console.log("Shutting down...");
    db.close();
    process.exit(0);
  });

  return wss;
}
