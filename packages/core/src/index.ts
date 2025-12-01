import { serve } from "bun";
import { createEntity, getEntity, getVerbs } from "./repo";
import {
  createScriptContext,
  evaluate,
  registerLibrary,
} from "./scripting/interpreter";
import * as Core from "./scripting/lib/core";
import * as List from "./scripting/lib/list";
import * as Object from "./scripting/lib/object";
import * as String from "./scripting/lib/string";
import * as Time from "./scripting/lib/time";
import { seed } from "./seed";
import { PluginManager, CommandContext } from "./plugin";
import { scheduler } from "./scheduler";
import {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  Entity,
} from "@viwo/shared/jsonrpc";

export { PluginManager };
export type { CommandContext };
export type { Plugin, PluginContext } from "./plugin";

export const pluginManager = new PluginManager();

registerLibrary(Core);
registerLibrary(List);
registerLibrary(Object);
registerLibrary(String);
registerLibrary(Time);

// Initialize scheduler
scheduler.setSendFactory(() => {
  // TODO: This is a hack. We need a way to send messages to the right client.
  // For now, we just log to console as scheduled tasks might not have a connected client.
  return (msg: unknown) => {
    console.log("[Scheduled Task Output]", msg);
  };
});

// Seed the database
seed();

/**
 * Starts the Viwo Core Server.
 * Sets up the WebSocket server and handles incoming connections.
 *
 * @param port - The port to listen on (default: 8080).
 */
export function startServer(port: number = 8080) {
  const server = serve<{ userId: number }>({
    port,
    async fetch(req, server) {
      const url = new URL(req.url);
      if (url.pathname === "/" && req.headers.get("upgrade") === "websocket") {
        if (server.upgrade(req, { data: { userId: 0 } })) {
          return;
        }
        return new Response("Upgrade failed", { status: 500 });
      }
      return new Response("Hello from Viwo Core!");
    },
    websocket: {
      async open(ws) {
        console.log("Client connected");
        // Create a temporary player for this session
        // In a real game, we'd handle login/auth
        const playerId = createEntity(
          {
            name: "Player",
            location: 1, // Start in The Void (or Lobby if seeded)
            description: "A new player.",
          },
          2, // Inherit from Player Base
        );

        ws.data = { userId: playerId };

        // Send initial state via notification
        const player = getEntity(playerId);
        if (player) {
          const msg: JsonRpcNotification = {
            jsonrpc: "2.0",
            method: "player_id",
            params: { playerId },
          };
          ws.send(JSON.stringify(msg));
        }
      },
      async message(ws, message) {
        try {
          const data = JSON.parse(message as string);
          // Basic JSON-RPC validation
          if (data.jsonrpc !== "2.0") {
            console.warn("Invalid JSON-RPC version");
            return;
          }

          if ("method" in data && "id" in data) {
            // It's a request
            const response = await handleJsonRpcRequest(
              data as JsonRpcRequest,
              ws.data.userId,
              ws,
            );
            ws.send(JSON.stringify(response));
          } else if ("method" in data) {
            // It's a notification
            console.log("Received notification:", data);
          }
        } catch (e) {
          console.error("Failed to handle message", e);
        }
      },
      close() {
        console.log("Client disconnected");
      },
    },
  });

  console.log(`Listening on localhost:${server.port}`);
  return server;
}

if (import.meta.main) {
  startServer();
}

/**
 * Handles incoming JSON-RPC requests from clients.
 *
 * @param req - The JSON-RPC request object.
 * @param playerId - The ID of the player making the request.
 * @param ws - The WebSocket connection.
 * @returns A promise that resolves to the JSON-RPC response.
 */
async function handleJsonRpcRequest(
  req: JsonRpcRequest,
  playerId: number,
  ws: any,
): Promise<JsonRpcResponse> {
  const player = getEntity(playerId);
  if (!player) {
    return {
      jsonrpc: "2.0",
      id: req.id,
      error: { code: -32000, message: "Player not found" },
    };
  }

  switch (req.method) {
    case "execute": {
      const params = req.params as string[];
      if (!Array.isArray(params) || params.length === 0) {
        return {
          jsonrpc: "2.0",
          id: req.id,
          error: { code: -32602, message: "Invalid params" },
        };
      }
      const [command, ...args] = params;
      console.log(`Command: ${command} args: ${args}`);

      const verbs = await getAvailableVerbs(player);
      const verb = verbs.find((v) => v.name === command);

      if (verb) {
        try {
          await executeVerb(player, verb, args, ws);
          return {
            jsonrpc: "2.0",
            id: req.id,
            result: { status: "ok" },
          };
        } catch (e: any) {
          return {
            jsonrpc: "2.0",
            id: req.id,
            error: { code: -32000, message: e.message },
          };
        }
      } else {
        return {
          jsonrpc: "2.0",
          id: req.id,
          error: { code: -32601, message: "Method not found (unknown verb)" },
        };
      }
    }
    case "get_opcodes": {
      const { getOpcodeMetadata } = require("./scripting/interpreter");
      return {
        jsonrpc: "2.0",
        id: req.id,
        result: getOpcodeMetadata(),
      };
    }
    default:
      return {
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32601, message: "Method not found" },
      };
  }
}

// TODO: Move this to scripting too
/**
 * Resolves all available verbs for a player based on their context (self, room, items, inventory).
 *
 * @param player - The player entity.
 * @returns A list of available verbs with their source entity ID.
 */
async function getAvailableVerbs(player: Entity) {
  const verbs: { name: string; code: any; source: number }[] = [];
  const seen = new Set<string>();

  const addVerbs = (entityId: number) => {
    const entityVerbs = getVerbs(entityId);
    for (const v of entityVerbs) {
      const key = `${v.name}:${entityId}`;
      if (!seen.has(key)) {
        seen.add(key);
        verbs.push({ ...v, source: entityId });
      }
    }
  };

  // 1. Player verbs
  addVerbs(player.id);

  // 2. Room verbs
  const locationId = player["location"];
  if (typeof locationId === "number") {
    addVerbs(locationId);

    // 3. Items in Room
    // We need to resolve contents manually
    const room = getEntity(locationId);
    if (room) {
      const contentIds = (room["contents"] as number[]) || [];
      for (const id of contentIds) {
        addVerbs(id);
      }
    }
  }

  // 4. Inventory verbs
  const inventoryIds = player["contents"];
  if (Array.isArray(inventoryIds)) {
    for (const id of inventoryIds) {
      if (typeof id === "number") {
        addVerbs(id);
      }
    }
  }

  return verbs;
}

/**
 * Executes a verb script.
 *
 * @param player - The player entity executing the verb.
 * @param verb - The verb definition.
 * @param args - Arguments passed to the verb.
 * @param ws - The WebSocket connection for sending messages.
 */
async function executeVerb(
  player: Entity,
  verb: { name: string; code: any; source: number },
  args: string[],
  ws: any,
) {
  const ctx = createScriptContext({
    caller: player,
    this: getEntity(verb.source)!,
    args,
    send: createSendFunction(ws),
  });

  await evaluate(verb.code, ctx);
}

/**
 * Creates a 'send' function for the scripting environment that wraps messages in JSON-RPC notifications.
 *
 * @param ws - The WebSocket connection.
 * @returns A function that sends messages to the client.
 */
function createSendFunction(ws: WebSocket): (msg: unknown) => void {
  return (msg: unknown) => {
    // If it's a string, wrap it in a message notification
    if (typeof msg === "string") {
      const notification: JsonRpcNotification = {
        jsonrpc: "2.0",
        method: "message",
        params: { type: "info", text: msg },
      };
      ws.send(JSON.stringify(notification));
    } else if (
      typeof msg === "object" &&
      msg !== null &&
      "type" in msg &&
      (msg as any).type === "update"
    ) {
      // Handle update messages specifically as notifications
      const notification: JsonRpcNotification = {
        jsonrpc: "2.0",
        method: "update",
        params: msg,
      };
      ws.send(JSON.stringify(notification));
    } else {
      // Fallback for other objects
      console.warn("Sending unstructured object:", msg);
      const notification: JsonRpcNotification = {
        jsonrpc: "2.0",
        method: "message",
        params: msg,
      };
      ws.send(JSON.stringify(notification));
    }
  };
}
