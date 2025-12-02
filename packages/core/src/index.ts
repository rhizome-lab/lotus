import { serve } from "bun";
import { createEntity, getEntity, updateEntity } from "./repo";
import {
  createScriptContext,
  evaluate,
  getOpcodeMetadata,
  registerLibrary,
  ListLib,
  ObjectLib,
  StringLib,
  TimeLib,
  MathLib,
  BooleanLib,
  StdLib,
  compile,
} from "@viwo/scripting";
import * as Core from "./runtime/lib/core";

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
export { Core as CoreLib };
export { db } from "./db";
export { createEntity, getEntity, addVerb, updateEntity } from "./repo";

// Scheduler is started by the application (server/client)
export { scheduler } from "./scheduler";

// Seed the database
export { seed } from "./seed";

export const pluginManager = new PluginManager();

// Registry of connected clients: PlayerID -> WebSocket
const clients = new Map<number, Bun.ServerWebSocket<{ userId: number }>>();

registerLibrary(StdLib);
registerLibrary(Core);
registerLibrary(ListLib);
registerLibrary(ObjectLib);
registerLibrary(StringLib);
registerLibrary(TimeLib);
registerLibrary(MathLib);
registerLibrary(BooleanLib);

// Initialize scheduler
// Initialize scheduler
const BOT_ENTITY_ID = 4;

scheduler.setSendFactory((entityId: number) => {
  const ws = clients.get(entityId);
  if (ws) {
    return createSendFunction(ws);
  }

  // If no direct connection, check if Bot is connected
  const botWs = clients.get(BOT_ENTITY_ID);
  if (botWs) {
    return (type: string, payload: unknown) => {
      // Forward to Bot
      const notification: JsonRpcNotification = {
        jsonrpc: "2.0",
        method: "forward",
        params: {
          target: entityId,
          type,
          payload,
        },
      };
      botWs.send(JSON.stringify(notification));
    };
  }

  // Fallback for entities without a connected client (e.g. NPCs, Rooms)
  return (type: string, payload: unknown) => {
    console.log(
      `[Scheduled Task Output for Entity ${entityId}]`,
      type,
      payload,
    );
  };
});

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
        clients.set(playerId, ws);

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
      close(ws) {
        console.log("Client disconnected");
        clients.delete(ws.data.userId);
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
export async function handleJsonRpcRequest(
  req: JsonRpcRequest,
  playerId: number,
  ws: any,
): Promise<JsonRpcResponse> {
  // Allow login without a valid player ID (since that's how we get one)
  if (req.method !== "login") {
    const player = getEntity(playerId);
    if (!player) {
      return {
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32000, message: "Player not found" },
      };
    }
  }

  switch (req.method) {
    case "login": {
      const params = req.params as { entityId: number };
      if (!params || typeof params.entityId !== "number") {
        return {
          jsonrpc: "2.0",
          id: req.id,
          error: { code: -32602, message: "Invalid params: entityId required" },
        };
      }

      const targetId = params.entityId;
      const target = getEntity(targetId);

      if (!target) {
        return {
          jsonrpc: "2.0",
          id: req.id,
          error: { code: -32000, message: "Entity not found" },
        };
      }

      // In a real system, we would check authentication here.
      // For now, we trust the entityId (as per TODO context).

      // Update session
      // Remove old mapping if exists
      if (ws.data.userId) {
        clients.delete(ws.data.userId);
      }
      ws.data.userId = targetId;
      clients.set(targetId, ws);

      console.log(`Client logged in as Entity ${targetId}`);

      // Send player_id notification
      const msg: JsonRpcNotification = {
        jsonrpc: "2.0",
        method: "player_id",
        params: { playerId: targetId },
      };
      ws.send(JSON.stringify(msg));

      // Send initial state
      // We can trigger 'look' and 'inventory' or just let the client do it.
      // The client usually does it on connect, but if we switch users, we might want to refresh.
      // For now, let's just confirm success.

      return {
        jsonrpc: "2.0",
        id: req.id,
        result: { status: "ok", playerId: targetId },
      };
    }
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

      const player = getEntity(playerId)!; // We checked this above
      const system = getEntity(3); // System ID is 3
      if (!system) {
        return {
          jsonrpc: "2.0",
          id: req.id,
          error: { code: -32603, message: "System entity not found" },
        };
      }

      // Call system.get_available_verbs(player)
      const verbs = evaluate(
        {
          type: "call",
          args: [
            { type: "entity", args: [{ type: "value", value: system.id }] },
            { type: "value", value: "get_available_verbs" },
            { type: "entity", args: [{ type: "value", value: player.id }] },
          ],
        },
        createScriptContext({
          caller: system,
          this: system,
          args: [],
          send: createSendFunction(ws),
        }),
      );

      if (!Array.isArray(verbs)) {
        return {
          jsonrpc: "2.0",
          id: req.id,
          error: { code: -32603, message: "Failed to retrieve verbs" },
        };
      }
      const verb = verbs.find((v) => v.name === command);

      if (verb) {
        try {
          executeVerb(player, verb, args, ws);
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
      return {
        jsonrpc: "2.0",
        id: req.id,
        result: getOpcodeMetadata(),
      };
    }
    case "plugin_rpc": {
      const params = req.params as { method: string; params: any };
      if (!params || typeof params.method !== "string") {
        return {
          jsonrpc: "2.0",
          id: req.id,
          error: { code: -32602, message: "Invalid params: method required" },
        };
      }

      const player = getEntity(playerId)!;
      // Create a context for the plugin
      const ctx: CommandContext = {
        player: { id: playerId, ws },
        command: params.method, // Not strictly a command, but useful for logging
        args: [], // No args for RPC in the traditional sense
        send: createSendFunction(ws),
        core: {
          getEntity,
          createEntity,
          updateEntity,
          deleteEntity: (id) => {
            /* TODO */
          },
          resolveProps: (e) => e, // TODO: Implement
          getOpcodeMetadata: () => [], // TODO: Implement
        },
      };

      // We need to construct a proper context.
      // The existing createScriptContext is for scripts.
      // The Plugin system expects a CommandContext.
      // Let's reuse the one we create for commands, but we need to expose the Core API better.
      // For now, let's just pass a minimal context that satisfies the type, or improve the context creation.

      // Actually, let's look at how we can get a proper context.
      // In `index.ts`, we don't have a helper to create CommandContext easily without duplicating logic.
      // Let's implement a minimal one inline or refactor.

      // Re-implementing minimal context for now to unblock.
      const commandCtx: CommandContext = {
        player: { id: playerId, ws },
        command: params.method,
        args: [],
        send: createSendFunction(ws),
        core: {
          getEntity,
          createEntity,
          updateEntity,
          deleteEntity: (id) => {
            /* TODO */
          },
          resolveProps: (e) => e, // TODO: Implement
          getOpcodeMetadata: () => [], // TODO: Implement
        },
      };

      // Wait, I can't easily implement all core methods here without importing them.
      // `repo.ts` exports `createEntity`, `getEntity`, `updateEntity`.
      // Let's check `packages/core/src/index.ts` imports.
      // It imports `createEntity`, `getEntity` from `./repo`.
      // It imports `Core` from `./runtime/lib/core`.

      // I should probably just use `pluginManager.handleRpcMethod` and pass a context that I can construct.
      // The `CommandContext` interface requires `core` object.
      // I'll define the `core` object using the available imports.

      try {
        const result = await pluginManager.handleRpcMethod(
          params.method,
          params.params,
          commandCtx,
        );
        return {
          jsonrpc: "2.0",
          id: req.id,
          result,
        };
      } catch (e: any) {
        return {
          jsonrpc: "2.0",
          id: req.id,
          error: { code: -32000, message: e.message },
        };
      }
    }
    default:
      return {
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32601, message: "Method not found" },
      };
  }
}

/**
 * Executes a verb script.
 *
 * @param player - The player entity executing the verb.
 * @param verb - The verb definition.
 * @param args - Arguments passed to the verb.
 * @param ws - The WebSocket connection for sending messages.
 */
// Cache for compiled verbs: JSON string -> Compiled Function
const verbCache = new Map<string, (ctx: any) => any>();

/**
 * Executes a verb script.
 *
 * @param player - The player entity executing the verb.
 * @param verb - The verb definition.
 * @param args - Arguments passed to the verb.
 * @param ws - The WebSocket connection for sending messages.
 */
function executeVerb(
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

  // Check cache
  const codeKey = JSON.stringify(verb.code);
  let compiled = verbCache.get(codeKey);

  if (!compiled) {
    try {
      compiled = compile(verb.code);
      verbCache.set(codeKey, compiled!);
    } catch (e) {
      console.error("Failed to compile verb:", e);
      // Fallback to interpreter? Or just throw?
      // For now, let's fallback to evaluate to be safe, or just re-throw.
      // Given we want to move to compiler, let's throw but log it.
      throw e;
    }
  }

  if (compiled) {
    compiled(ctx);
  }
}

/**
 * Creates a 'send' function for the scripting environment that wraps messages in JSON-RPC notifications.
 *
 * @param ws - The WebSocket connection.
 * @returns A function that sends messages to the client.
 */
function createSendFunction(ws: any): (type: string, payload: unknown) => void {
  return (type: string, payload: unknown) => {
    const notification: JsonRpcNotification = {
      jsonrpc: "2.0",
      method: type,
      params: payload as any,
    };
    ws.send(JSON.stringify(notification));
  };
}
