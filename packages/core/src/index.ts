import * as CoreLib from "./runtime/lib/core";
import * as KernelLib from "./runtime/lib/kernel";
import { type CommandContext, PluginManager } from "./plugin";
import type {
  Entity,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
} from "@viwo/shared/jsonrpc";
import { GameOpcodes, registerGameLibrary } from "./runtime/opcodes";
import {
  addVerb,
  createCapability,
  createEntity,
  deleteEntity,
  getEntities,
  getEntity,
  getVerb,
  updateEntity,
  updateVerb,
} from "./repo";
import {
  compile,
  createScriptContext,
  decompile,
  evaluate,
  getOpcodeMetadata,
  transpile,
} from "@viwo/scripting";
import type { CoreInterface } from "./types";
import { resolveProps } from "./runtime/utils";
import { scheduler } from "./scheduler";
import { serve } from "bun";

export { PluginManager };
export type { CommandContext };
export type { Plugin, PluginContext } from "./plugin";
export { CoreLib };
export { db } from "./db";
export {
  createEntity,
  getEntity,
  addVerb,
  updateEntity,
  getCapability,
  createCapability,
  getEntities,
  getVerb,
} from "./repo";
export { checkCapability } from "./runtime/utils";
export { loadEntityDefinition } from "./seeds/loader";

// Path to shared entity definitions (EntityBase, etc.)
import { resolve as pathResolve } from "node:path";
export const CORE_DEFINITIONS_PATH = pathResolve(__dirname, "seeds/definitions");
export {
  BaseCapability,
  registerCapabilityClass,
  type CapabilityRegistry,
} from "./runtime/capabilities";
export { KernelLib };

// Opcodes for testing
export { GameOpcodes, registerGameLibrary } from "./runtime/opcodes";

// Scheduler is started by the application (server/client)
export { scheduler } from "./scheduler";

// Seed the database
export { seed } from "./seed";

const coreImpl: CoreInterface = {
  createEntity,
  deleteEntity,
  getEntity,
  getOnlinePlayers: () => Array.from(clients.keys()),
  getOpcodeMetadata: () => getOpcodeMetadata(GameOpcodes),
  registerLibrary: (library) => registerGameLibrary(library),
  resolveProps: (entity) =>
    resolveProps(
      entity,
      createScriptContext({
        args: [],
        caller: entity,
        ops: GameOpcodes,
        send: () => {}, // No-op send for internal resolution
        this: entity,
      }),
    ),
  updateEntity,
};

export const pluginManager = new PluginManager(coreImpl);

// Registry of connected clients: PlayerID -> WebSocket
const clients = new Map<number, Bun.ServerWebSocket<{ userId: number }>>();

// GameOpcodes initialized in runtime/opcodes.ts

// Initialize scheduler
// Initialize scheduler
const BOT_ENTITY_ID = 4;

scheduler.setOpcodes(GameOpcodes);

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
          payload,
          target: entityId,
          type,
        },
      };
      botWs.send(JSON.stringify(notification));
    };
  }

  // Fallback for entities without a connected client (e.g. NPCs, Rooms)
  return (type: string, payload: unknown) => {
    console.log(`[Scheduled Task Output for Entity ${entityId}]`, type, payload);
  };
});

/**
 * Starts the Viwo Core Server.
 * Sets up the WebSocket server and handles incoming connections.
 *
 * @param port - The port to listen on (default: 8080).
 */
export function startServer(port = 8080) {
  const server = serve<{ userId: number }>({
    fetch(req, server) {
      const url = new URL(req.url);
      if (url.pathname === "/" && req.headers.get("upgrade") === "websocket") {
        if (server.upgrade(req, { data: { userId: 0 } })) {
          return;
        }
        return new Response("Upgrade failed", { status: 500 });
      }
      return new Response("Hello from Viwo Core!");
    },
    port,
    websocket: {
      close(ws) {
        console.log("Client disconnected");
        clients.delete(ws.data.userId);
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
            const response = await handleJsonRpcRequest(data as JsonRpcRequest, ws.data.userId, ws);
            ws.send(JSON.stringify(response));
          } else if ("method" in data) {
            // It's a notification
            console.log("Received notification:", data);
          }
        } catch (error) {
          console.error("Failed to handle message", error);
        }
      },
      open(ws) {
        console.log("Client connected");
        // Create a temporary player for this session
        // In a real game, we'd handle login/auth
        const playerId = createEntity(
          {
            description: "A new player.",
            location: 7, // Start in Lobby (id 7 in seed order)
            name: "Player",
          },
          6, // Inherit from Player Base (id 6 in seed order)
        );

        // Mint capabilities for new player
        createCapability(playerId, "sys.create", {});
        // Wildcard capability to allow room interactions (moving between rooms)
        // This must come first so get_capability finds it before specific ones
        createCapability(playerId, "entity.control", { "*": true });

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
        error: { code: -32_000, message: "Player not found" },
        id: req.id,
        jsonrpc: "2.0",
      };
    }
  }

  switch (req.method) {
    case "login": {
      const params = req.params as { entityId: number };
      if (!params || typeof params.entityId !== "number") {
        return {
          error: { code: -32_602, message: "Invalid params: entityId required" },
          id: req.id,
          jsonrpc: "2.0",
        };
      }

      const targetId = params.entityId;
      const target = getEntity(targetId);

      if (!target) {
        return {
          error: { code: -32_000, message: "Entity not found" },
          id: req.id,
          jsonrpc: "2.0",
        };
      }

      // For now, we trust the entityId.

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
        id: req.id,
        jsonrpc: "2.0",
        result: { playerId: targetId, status: "ok" },
      };
    }
    case "execute": {
      const params = req.params as string[];
      if (!Array.isArray(params) || params.length === 0) {
        return {
          error: { code: -32_602, message: "Invalid params" },
          id: req.id,
          jsonrpc: "2.0",
        };
      }
      const [command, ...args] = params;
      console.log(`Command: ${command} args: ${args}`);

      const player = getEntity(playerId)!; // We checked this above
      const system = getEntity(3); // System ID is 3
      if (!system) {
        return {
          error: { code: -32_603, message: "System entity not found" },
          id: req.id,
          jsonrpc: "2.0",
        };
      }

      // Call system.get_available_verbs(player)
      const verbs = evaluate(
        CoreLib.call(system, "get_available_verbs", player),
        createScriptContext({
          args: [],
          caller: system,
          gas: 50000, // Verb retrieval needs high gas: ~30 gas/verb * 100+ verbs + loop overhead
          ops: GameOpcodes,
          send: createSendFunction(ws),
          this: system,
        }),
      );

      if (!Array.isArray(verbs)) {
        return {
          error: { code: -32_603, message: "Failed to retrieve verbs" },
          id: req.id,
          jsonrpc: "2.0",
        };
      }
      const verb = verbs.find((verb) => verb.name === command);

      if (verb) {
        try {
          executeVerb(player, verb, args, ws);
          return {
            id: req.id,
            jsonrpc: "2.0",
            result: { status: "ok" },
          };
        } catch (error: any) {
          return {
            error: { code: -32_000, message: error.message },
            id: req.id,
            jsonrpc: "2.0",
          };
        }
      } else {
        return {
          error: { code: -32_601, message: "Method not found (unknown verb)" },
          id: req.id,
          jsonrpc: "2.0",
        };
      }
    }
    case "get_opcodes": {
      return {
        id: req.id,
        jsonrpc: "2.0",
        result: getOpcodeMetadata(GameOpcodes),
      };
    }
    case "get_entities": {
      const params = req.params as { ids: number[] };
      if (!params || !Array.isArray(params.ids)) {
        return {
          error: { code: -32_602, message: "Invalid params: ids array required" },
          id: req.id,
          jsonrpc: "2.0",
        };
      }
      return {
        id: req.id,
        jsonrpc: "2.0",
        result: {
          entities: getEntities(params.ids),
        },
      };
    }

    case "get_verb": {
      const params = req.params as { entityId: number; name: string };
      if (!params || typeof params.entityId !== "number" || typeof params.name !== "string") {
        return {
          error: { code: -32_602, message: "Invalid params: entityId and name required" },
          id: req.id,
          jsonrpc: "2.0",
        };
      }

      const verb = getVerb(params.entityId, params.name);
      if (!verb) {
        return {
          error: { code: -32_000, message: "Verb not found" },
          id: req.id,
          jsonrpc: "2.0",
        };
      }

      try {
        const source = decompile(verb.code);
        return {
          id: req.id,
          jsonrpc: "2.0",
          result: { source },
        };
      } catch (error: any) {
        return {
          error: { code: -32_000, message: `Decompilation failed: ${error.message}` },
          id: req.id,
          jsonrpc: "2.0",
        };
      }
    }
    case "update_verb": {
      const params = req.params as { entityId: number; name: string; source: string };
      if (
        !params ||
        typeof params.entityId !== "number" ||
        typeof params.name !== "string" ||
        typeof params.source !== "string"
      ) {
        return {
          error: { code: -32_602, message: "Invalid params: entityId, name, source required" },
          id: req.id,
          jsonrpc: "2.0",
        };
      }

      try {
        const code = transpile(params.source);
        const existing = getVerb(params.entityId, params.name);
        if (existing) {
          updateVerb(existing.id, code);
        } else {
          addVerb(params.entityId, params.name, code);
        }
        return {
          id: req.id,
          jsonrpc: "2.0",
          result: { status: "ok" },
        };
      } catch (error: any) {
        return {
          error: { code: -32_000, message: `Compilation failed: ${error.message}` },
          id: req.id,
          jsonrpc: "2.0",
        };
      }
    }
    case "get_capability_metadata": {
      // Return metadata about all registered capability classes
      // This allows the block editor to auto-generate blocks from capability methods
      const metadata = pluginManager.getCapabilityMetadata();
      return {
        id: req.id,
        jsonrpc: "2.0",
        result: metadata,
      };
    }
    case "plugin_rpc": {
      const params = req.params as { method: string; params: any };
      if (!params || typeof params.method !== "string") {
        return {
          error: { code: -32_602, message: "Invalid params: method required" },
          id: req.id,
          jsonrpc: "2.0",
        };
      }

      const commandCtx: CommandContext = {
        args: [],
        command: params.method,
        player: { id: playerId, ws },
        send: createSendFunction(ws),
      };

      try {
        const result = await pluginManager.handleRpcMethod(
          params.method,
          params.params,
          commandCtx,
        );
        return {
          id: req.id,
          jsonrpc: "2.0",
          result,
        };
      } catch (error: any) {
        return {
          error: { code: -32_000, message: error.message },
          id: req.id,
          jsonrpc: "2.0",
        };
      }
    }
    default: {
      return {
        error: { code: -32_601, message: "Method not found" },
        id: req.id,
        jsonrpc: "2.0",
      };
    }
  }
}

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
    args,
    caller: player,
    gas: 50000, // High gas limit for verb execution
    ops: GameOpcodes,
    send: createSendFunction(ws),
    this: getEntity(verb.source)!,
  });

  // Check cache
  const codeKey = JSON.stringify(verb.code);
  let compiled = verbCache.get(codeKey);

  if (!compiled) {
    try {
      compiled = compile(verb.code, GameOpcodes);
      verbCache.set(codeKey, compiled!);
    } catch (error) {
      console.error("Failed to compile verb:", error);
      // Fallback to interpreter? Or just throw?
      // For now, let's fallback to evaluate to be safe, or just re-throw.
      // Given we want to move to compiler, let's throw but log it.
      throw error;
    }
  }

  if (compiled) {
    const result = compiled(ctx);
    // Auto-send rich return values
    if (result !== null && result !== undefined && typeof result === "object") {
      const type =
        typeof (result as Record<string, unknown>)["type"] === "string"
          ? ((result as Record<string, unknown>)["type"] as string)
          : "value";
      createSendFunction(ws)(type, result);
    }
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
    // Wrap "message" type to match MessageNotification format
    let params: any = payload;
    if (type === "message" && typeof payload === "string") {
      params = { text: payload, type: "info" };
    }

    const notification: JsonRpcNotification = {
      jsonrpc: "2.0",
      method: type,
      params,
    };
    ws.send(JSON.stringify(notification));
  };
}
