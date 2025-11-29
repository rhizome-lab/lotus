import { serve } from "bun";
import { createEntity, getEntity, Entity, getVerbs } from "./repo";
import {
  createScriptContext,
  evaluate,
  registerLibrary,
  ScriptError,
  ScriptSystemContext,
  resolveProps,
} from "./scripting/interpreter";
import { CoreLibrary } from "./scripting/lib/core";
import { ListLibrary } from "./scripting/lib/list";
import { ObjectLibrary } from "./scripting/lib/object";
import { StringLibrary } from "./scripting/lib/string";
import { TimeLibrary } from "./scripting/lib/time";
import { seed } from "./seed";
import { PluginManager, CommandContext } from "./plugin";

export { PluginManager };
export type { CommandContext };
export type { Plugin, PluginContext } from "./plugin";

export const pluginManager = new PluginManager();

// Register libraries
registerLibrary(CoreLibrary);
registerLibrary(ListLibrary);
registerLibrary(ObjectLibrary);
registerLibrary(StringLibrary);
registerLibrary(TimeLibrary);

// Seed the database
seed();

const server = serve<{ userId: number }>({
  port: 8080,
  async fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
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
          kind: "ACTOR",
          location_id: 1, // Start in The Void (or Lobby if seeded)
          description: "A new player.",
        },
        2, // Inherit from Player Base
      );

      ws.data = { userId: playerId };

      // Send initial state
      const player = await getEntity(playerId);
      if (player) {
        sendToClient(ws, {
          type: "welcome",
          payload: {
            message: "Welcome to Viwo!",
            playerId,
          },
        });
        await look(ws, player);
      }
    },
    async message(ws, message) {
      const data = JSON.parse(message as string);
      const player = getEntity(ws.data.userId);

      if (!player) return;

      if (data.type === "command") {
        const { command, args } = data.payload;
        console.log(`Command: ${command} args: ${args}`);

        // Handle built-in commands or scriptable verbs
        // We'll try to find a verb on the player, room, or items
        const verbs = await getAvailableVerbs(player);
        const verb = verbs.find((v) => v.name === command);

        if (verb) {
          try {
            await executeVerb(player, verb, args, ws);
          } catch (e: any) {
            sendToClient(ws, {
              type: "error",
              payload: { message: e.message },
            });
          }
        } else {
          sendToClient(ws, {
            type: "error",
            payload: { message: "Unknown command." },
          });
        }
      }
    },
    close() {
      console.log("Client disconnected");
    },
  },
});

console.log(`Listening on localhost:${server.port}`);

function sendToClient(ws: any, message: any) {
  ws.send(JSON.stringify(message));
}

async function look(ws: any, player: Entity) {
  // We need to resolve props for the room and items
  const roomId = player["location_id"];
  if (!roomId) {
    sendToClient(ws, {
      type: "info",
      payload: { message: "You are floating in nothingness." },
    });
    return;
  }

  const room = await getEntity(roomId);
  if (!room) return;

  const resolvedRoom = await resolveProps(
    room,
    createScriptContext({
      caller: player,
      this: room,
      sys: createSystemContext(ws),
    }),
  );

  // Get contents
  // We need to manually resolve contents since getContents is gone
  const contentIds: number[] = resolvedRoom["contents"] || [];
  const contents: Entity[] = [];
  for (const id of contentIds) {
    const entity = getEntity(id);
    if (entity) {
      const resolvedItem = await resolveProps(
        entity,
        createScriptContext({
          caller: player,
          this: entity,
          sys: createSystemContext(ws),
        }),
      );
      contents.push(resolvedItem);
    }
  }

  sendToClient(ws, {
    type: "room_info",
    payload: {
      room: resolvedRoom,
      contents,
    },
  });
}

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
  if (player["location_id"]) {
    addVerbs(player["location_id"]);

    // 3. Items in Room
    // We need to resolve contents manually
    const room = await getEntity(player["location_id"]);
    if (room) {
      const contentIds: number[] = room["contents"] || [];
      for (const id of contentIds) {
        addVerbs(id);
      }
    }
  }

  // 4. Inventory verbs
  const inventoryIds: number[] = player["contents"] || [];
  for (const id of inventoryIds) {
    addVerbs(id);
  }

  return verbs;
}

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
    sys: createSystemContext(ws),
  });

  await evaluate(verb.code, ctx);
}

function createSystemContext(ws: any): ScriptSystemContext {
  return {
    create: (data: any) => {
      return createEntity(data);
    },
    send: (msg: unknown) => {
      if (typeof msg === "string") {
        sendToClient(ws, { type: "info", payload: { message: msg } });
      } else {
        // Assume it's an object to send directly
        sendToClient(ws, msg);
      }
    },
    call: async (caller, targetId, verbName, args, warnings) => {
      const target = getEntity(targetId);
      if (!target) {
        throw new ScriptError(`Target ${targetId} not found`);
      }
      const verbs = getVerbs(targetId);
      const verb = verbs.find((v) => v.name === verbName);
      if (!verb) {
        throw new ScriptError(`Verb ${verbName} not found on ${targetId}`);
      }
      return await evaluate(
        verb.code,
        createScriptContext({
          caller,
          this: target,
          args,
          sys: createSystemContext(ws),
          warnings,
        }),
      );
    },
    getVerbs: async (entityId) => getVerbs(entityId),
    getEntity: async (id) => getEntity(id),
  };
}
