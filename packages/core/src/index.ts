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
import { evaluate, ScriptSystemContext } from "./scripting/interpreter";

export { PluginManager };
export type { CommandContext };
export type { Plugin, PluginContext } from "./plugin";

export const pluginManager = new PluginManager();

export function startServer(port: number = 8080) {
  seed();

  const wss = new WebSocketServer({ port });

  console.log(`Viwo Core Server running on port ${port}`);

  // Start Scheduler
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
            gas: 500, // Sub-call gas limit?
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
                gas: 500,
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
              adjectives: props["adjectives"],
              custom_css: props["custom_css"],
              verbs: getVerbs(sub.id).map((v) => v.name),
            };
          }),
        );

        const props = await resolveEntityProps(item);

        // Send to everyone? No, usually just the looker.
        // But sendItem here is generic.
        // The opcode `sys.send_item` takes an ID.
        // But who do we send it to?
        // `sendRoom` sends to the player in the room?
        // No, `sendRoom` sends to `ws`?
        // Wait, `sendRoom` in `index.ts` uses `ws.send` at the end?
        // Let's check `sendRoom` implementation again.
        // It uses `ws.send`. `ws` is the connection of the player executing the command.
        // So `sendItem` should also use `ws.send`.
        // But `sendInventory` uses `wss.clients.find` because it takes `playerId`.
        // `sendRoom` takes `roomId` but sends to `ws`?
        // If `sendRoom` is called by `sys.send_room(roomId)`, it should send to the caller.
        // In `index.ts`, `sendRoom` is defined inside the connection handler, so `ws` is available.
        // So `sendItem` should also use `ws`.

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
      // Simple parsing: "verb target"
      if (!verb) {
        const parts = command.split(" ");
        if (parts.length > 1) {
          // const verbName = parts[0];
          // const targetName = parts.slice(1).join(" ");
          // Find target in room or inventory
          // ... (simplified for now)
        }
      }

      if (verb) {
        try {
          const warnings: string[] = [];
          await evaluate(verb.code, {
            caller: player,
            this: targetEntity,
            args: args || [],
            gas: 1000, // TODO: Configurable gas
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
      // These built-in commands will eventually be verbs on the player or room.
      // For now, they are hardcoded.
      // The `login` command is an exception as it changes the player's session.
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
