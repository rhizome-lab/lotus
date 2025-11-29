import { WebSocketServer, WebSocket } from "ws";
import { db } from "./db";
import { seed } from "./seed";
import {
  getEntity,
  getContents,
  createEntity,
  updateEntity,
  deleteEntity,
  getVerbs,
  getAllEntities,
  getVerb,
} from "./repo";
import { PluginManager, CommandContext } from "./plugin";
import { scheduler } from "./scheduler";
import {
  createScriptContext,
  evaluate,
  registerLibrary,
  ScriptSystemContext,
} from "./scripting/interpreter";
import { StringLibrary } from "./scripting/lib/string";
import { TimeLibrary } from "./scripting/lib/time";
import { WorldLibrary } from "./scripting/lib/world";
import { ObjectLibrary } from "./scripting/lib/object";
import { ListLibrary } from "./scripting/lib/list";
import { CoreLibrary } from "./scripting/lib/core";

export { PluginManager };
export type { CommandContext };
export type { Plugin, PluginContext } from "./plugin";

export const pluginManager = new PluginManager();

const GAS_LIMIT = 1000;

export function startServer(port: number = 8080) {
  // Register libraries
  registerLibrary(CoreLibrary);
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
    call: async () => null, // TODO: Scheduler doesn't support call yet? Or we can implement it.
    triggerEvent: async () => {}, // TODO: Scheduler doesn't support triggerEvent yet?
    getContents: async (id) => getContents(id),
    getVerbs: async (id) => getVerbs(id),
    getEntity: async (id) => getEntity(id),
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
      destroy: deleteEntity,
      getAllEntities,
      getEntity: async (id) => getEntity(id),
      getContents: async (id) => getContents(id),
      getVerbs: async (id) => getVerbs(id),
      send: (payload) => {
        ws.send(
          JSON.stringify({
            jsonrpc: "2.0",
            method: "message",
            params: payload,
          }),
        );
      },
      schedule: scheduler.schedule.bind(scheduler),
      broadcast: (msg, locationId) => {
        for (const client of wss.clients) {
          const c = client as Client;
          if (c.readyState === WebSocket.OPEN && c.playerId) {
            if (!locationId) {
              // Global
              c.send(
                JSON.stringify({
                  jsonrpc: "2.0",
                  method: "message",
                  params: { text: msg },
                }),
              );
            } else {
              // Local
              const p = getEntity(c.playerId);
              if (p && p.location_id === locationId) {
                c.send(
                  JSON.stringify({
                    jsonrpc: "2.0",
                    method: "message",
                    params: { text: msg },
                  }),
                );
              }
            }
          }
        }
      },
      give: (entityId, destId, newOwnerId) => {
        // Update location and owner
        updateEntity(entityId, { location_id: destId, owner_id: newOwnerId });
      },
      call: async (caller, targetId, verbName, callArgs, warnings) => {
        const targetVerb = getVerb(targetId, verbName);
        const targetEnt = getEntity(targetId);
        if (targetVerb && targetEnt) {
          // TODO: Ideally we want to pass all of `ctx` here to preserve gas limit.
          return await evaluate(targetVerb.code, {
            caller, // Caller remains original player? Or the entity? Usually original caller for permissions.
            this: targetEnt,
            args: callArgs,
            gas: GAS_LIMIT / 2, // Sub-call gas limit?
            warnings, // Share warnings array
            sys,
            vars: {},
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
      .query<{ id: number }, []>("SELECT id FROM entities WHERE name = 'Guest'")
      .get();
    if (guest) {
      ws.playerId = guest.id;
      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "message",
          params: {
            type: "message",
            text: `Welcome to Viwo! You are logged in as Guest (ID: ${guest.id}).`,
          },
        }),
      );
      console.log("okay sent");
    } else {
      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32601,
            message: "Guest player not found. Please re-seed.",
          },
          id: null,
        }),
      );
    }

    ws.on("message", async (message) => {
      let request: any;
      try {
        request = JSON.parse(message.toString());
      } catch {
        ws.send(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32700, message: "Parse error" },
            id: null,
          }),
        );
        return;
      }

      // Validate JSON-RPC
      if (request.jsonrpc !== "2.0" || !request.method) {
        ws.send(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32600, message: "Invalid Request" },
            id: request.id || null,
          }),
        );
        return;
      }

      const { method, params, id } = request;
      const args = Array.isArray(params) ? params : [params]; // Support both array and object params (simplified)

      console.log(
        `[Player ${ws.playerId}] Method: ${method}, Params: ${JSON.stringify(
          params,
        )}`,
      );

      // Helper to send JSON-RPC Response
      const sendResponse = (result: any) => {
        if (id !== undefined && id !== null) {
          ws.send(JSON.stringify({ jsonrpc: "2.0", result, id }));
        }
      };

      const sendError = (code: number, message: string) => {
        if (id !== undefined && id !== null) {
          ws.send(
            JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id }),
          );
        }
      };

      if (method === "login") {
        const playerId = args[0];
        if (typeof playerId !== "number") {
          sendError(-32602, "Invalid params: playerId must be a number");
          return;
        }
        const player = getEntity(playerId);
        if (player) {
          ws.playerId = playerId;
          const resolvedPlayer = await evaluate(
            ["resolve_props", player.id],
            createScriptContext({ caller: player, this: player, sys }),
          );
          sendResponse({
            message: `Logged in as ${player.name} (ID: ${player.id}).`,
            playerId: player.id,
            player: resolvedPlayer,
          });
        } else {
          sendError(-32001, "Player not found");
        }
        return;
      }

      if (method === "create_player") {
        const name = args[0];
        if (typeof name !== "string") {
          sendError(-32602, "Invalid params: name must be a string");
          return;
        }
        const startRoom = db
          .query("SELECT id FROM entities WHERE kind = 'ROOM' LIMIT 1")
          .get() as { id: number };
        const locationId = startRoom ? startRoom.id : undefined;

        const playerBase = db
          .query("SELECT id FROM entities WHERE slug = 'sys:player_base'")
          .get() as { id: number };
        const prototypeId = playerBase ? playerBase.id : undefined;

        const newId = createEntity({
          name,
          kind: "ACTOR",
          ...(locationId !== undefined ? { location_id: locationId } : {}),
          ...(prototypeId !== undefined ? { prototype_id: prototypeId } : {}),
          props: { description: "A new player." },
        });

        const newPlayer = getEntity(newId)!;
        const resolvedPlayer = await evaluate(
          ["resolve_props", newPlayer.id],
          createScriptContext({ caller: newPlayer, this: newPlayer, sys }),
        );
        sendResponse({
          message: "Player created",
          player: resolvedPlayer,
        });
        return;
      }

      if (!ws.playerId) {
        sendError(-32000, "Not logged in");
        return;
      }

      const player = getEntity(ws.playerId);
      if (!player) {
        sendError(-32001, "Player entity not found");
        return;
      }

      // Command Routing
      if (method === "execute") {
        const verbName = args[0];
        const verbArgs = args.slice(1);

        if (typeof verbName !== "string") {
          sendError(
            -32602,
            "Invalid params: first argument must be a verb name (string)",
          );
          return;
        }

        // --- SCRIPTING ENGINE INTEGRATION ---

        // 1. Check verbs on 'me' (the player)
        let verb = getVerb(player.id, verbName);
        let targetEntity = player;

        // 2. Check verbs on room
        if (!verb && player.location_id) {
          verb = getVerb(player.location_id, verbName);
          if (verb) {
            const { getEntity } = await import("./repo");
            targetEntity = getEntity(player.location_id)!;
          }
        }

        // 3. Check verbs on items in room/inventory
        if (!verb) {
          // If we have "look apple", verbName is "look", verbArgs is ["apple"]
          // We check if "look" is a verb on "apple".

          // TODO: Use `evaluateTarget`
          if (verbArgs.length > 0) {
            const targetName = String(verbArgs[0]);

            const roomContents = player.location_id
              ? getContents(player.location_id)
              : [];
            const inventory = getContents(player.id);
            const allVisible = [...roomContents, ...inventory];

            const target = allVisible.find(
              (e) => e.name.toLowerCase() === targetName.toLowerCase(),
            );

            if (target) {
              const targetVerb = getVerb(target.id, verbName);
              if (targetVerb) {
                verb = targetVerb;
                targetEntity = target;
              }
            }
          }
        }

        if (verb) {
          try {
            const warnings: string[] = [];
            const result = await evaluate(verb.code, {
              caller: player,
              this: targetEntity,
              args: verbArgs,
              gas: GAS_LIMIT,
              warnings,
              sys,
              vars: {},
            });

            for (const warning of warnings) {
              ws.send(
                JSON.stringify({
                  jsonrpc: "2.0",
                  method: "warning",
                  params: { text: warning },
                }),
              );
            }

            sendResponse(result);
          } catch (e: any) {
            sendError(-32603, `Script error: ${e.message}`);
          }
          return;
        }

        sendError(-32601, `Verb not found: ${verbName}`);
        return;
      }

      if (method === "get_opcodes") {
        const { getOpcodeMetadata } = require("./scripting/interpreter");
        sendResponse(getOpcodeMetadata());
        return;
      }

      sendError(-32601, `Method not found: ${method}`);
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
