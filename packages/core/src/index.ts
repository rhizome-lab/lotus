import { WebSocketServer, WebSocket } from "ws";
import { db } from "./db";
import { seed } from "./seed";
import {
  getEntity,
  getContents,
  moveEntity,
  createEntity,
  updateEntity,
} from "./repo";
import { PluginManager, CommandContext } from "./plugin";

export { PluginManager };
export type { CommandContext };
export type { Plugin, PluginContext } from "./plugin";

export const pluginManager = new PluginManager();

export function startServer(port: number = 8080) {
  seed();

  const wss = new WebSocketServer({ port });

  console.log(`Viwo Core Server running on port ${port}`);

  interface Client extends WebSocket {
    playerId?: number;
  }

  wss.on("connection", (ws: Client) => {
    console.log("New client connected");

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

      const [command, ...args] = data as [string, ...any[]];
      console.log(
        `[Player ${ws.playerId}] Command: ${command}, Args: ${JSON.stringify(
          args,
        )}`,
      );

      if (!ws.playerId) return;

      const player = getEntity(ws.playerId);
      if (!player) return;

      // Helper to send room update
      const sendRoom = (roomId: number) => {
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
        const richContents = contents.map((item) => {
          const richItem: any = {
            id: item.id,
            name: item.name,
            kind: item.kind,
            location_detail: item.location_detail,
            adjectives: item.props["adjectives"],
            custom_css: item.props["custom_css"],
            contents: getContents(item.id).map((sub) => ({
              id: sub.id,
              name: sub.name,
              kind: sub.kind,
              contents: [],
              custom_css: sub.props["custom_css"],
            })),
          };

          if (item.kind === "EXIT" && item.props["destination_id"]) {
            const dest = getEntity(item.props["destination_id"]);
            if (dest) {
              richItem.destination_name = dest.name;
            }
          }

          return richItem;
        });

        ws.send(
          JSON.stringify({
            type: "room",
            name: room.name,
            description: room.props["description"] || "Nothing special.",
            custom_css: customCss,
            contents: richContents,
          }),
        );
      };

      // Plugin Hook
      const ctx: CommandContext = {
        player: { id: player.id, ws },
        command,
        args,
        send: (msg) => ws.send(JSON.stringify(msg)),
        core: {
          getEntity,
          getContents,
          moveEntity,
          createEntity,
          updateEntity,
          sendRoom,
        },
      };

      if (await pluginManager.handleCommand(ctx)) {
        return;
      }

      if (command === "look") {
        // ... (existing look target logic) ...
        if (args.length > 0) {
          // ... (keep existing target look logic) ...
          const targetName = args[0].toString().toLowerCase();
          // ... (copy existing recursive search) ...
          // Helper to recursively find an item by name
          const findRecursive = (
            containerId: number,
            name: string,
          ): { id: number; name: string; kind: string; props: any } | null => {
            const contents = getContents(containerId);
            for (const item of contents) {
              if (item.name.toLowerCase() === name) return item;
              const found = findRecursive(item.id, name);
              if (found) return found;
            }
            return null;
          };

          let target = null;
          if (player.location_id)
            target = findRecursive(player.location_id, targetName);
          if (!target) target = findRecursive(player.id, targetName);

          if (!target) {
            ws.send(
              JSON.stringify({
                type: "message",
                text: `You don't see '${args[0]}' here.`,
              }),
            );
            return;
          }

          const richContents = getContents(target.id).map((sub) => ({
            id: sub.id,
            name: sub.name,
            kind: sub.kind,
            contents: [],
            location_detail: sub.location_detail,
            adjectives: sub.props["adjectives"],
            custom_css: sub.props["custom_css"],
          }));

          ws.send(
            JSON.stringify({
              type: "item",
              name: target.name,
              description: target.props["description"] || "It's just a thing.",
              contents: richContents,
              adjectives: target.props["adjectives"],
              custom_css: target.props["custom_css"],
            }),
          );
          return;
        }

        if (!player.location_id) {
          ws.send(
            JSON.stringify({ type: "message", text: "You are in the void." }),
          );
          return;
        }
        sendRoom(player.location_id);
      } else if (command === "inventory") {
        // ... (keep existing inventory logic) ...
        const items = getContents(player.id);
        const richItems = items.map((item) => ({
          id: item.id,
          name: item.name,
          kind: item.kind,
          location_detail: item.location_detail,
          adjectives: item.props["adjectives"],
          custom_css: item.props["custom_css"],
          contents: getContents(item.id).map((sub) => ({
            id: sub.id,
            name: sub.name,
            kind: sub.kind,
            contents: [],
            custom_css: sub.props["custom_css"],
          })),
        }));

        ws.send(
          JSON.stringify({
            type: "inventory",
            items: richItems,
          }),
        );
      } else if (command === "move" || command === "go") {
        if (!args[0]) {
          ws.send(JSON.stringify({ type: "message", text: "Move where?" }));
          return;
        }
        const direction = args[0].toLowerCase();

        if (!player.location_id) {
          ws.send(
            JSON.stringify({ type: "message", text: "You are in the void." }),
          );
          return;
        }

        const roomContents = getContents(player.location_id);
        const exit = roomContents.find(
          (e) => e.kind === "EXIT" && e.props["direction"] === direction,
        );

        if (exit) {
          moveEntity(player.id, exit.props["destination_id"]);
          ws.send(
            JSON.stringify({
              type: "message",
              text: `You move ${direction}...`,
            }),
          );
          sendRoom(exit.props["destination_id"]);
        } else {
          ws.send(
            JSON.stringify({ type: "message", text: "You can't go that way." }),
          );
        }
      } else if (command === "dig") {
        if (args.length < 2) {
          ws.send(
            JSON.stringify({
              type: "message",
              text: "Usage: dig <direction> <room name>",
            }),
          );
          return;
        }
        const direction = args[0].toLowerCase();
        const roomName = args.slice(1).join(" ");

        if (!player.location_id) {
          ws.send(
            JSON.stringify({ type: "message", text: "You can't dig here." }),
          );
          return;
        }

        const currentRoomId = player.location_id;

        // Create new room
        const newRoomId = createEntity({
          name: roomName,
          kind: "ROOM",
          props: { description: "A newly dug room." },
        });

        // Create exit from current to new
        createEntity({
          name: direction,
          kind: "EXIT",
          location_id: currentRoomId,
          props: { direction, destination_id: newRoomId },
        });

        // Create exit from new to current
        const opposites: Record<string, string> = {
          north: "south",
          south: "north",
          east: "west",
          west: "east",
          up: "down",
          down: "up",
          in: "out",
          out: "in",
          northeast: "southwest",
          southwest: "northeast",
          northwest: "southeast",
          southeast: "northwest",
          ne: "sw",
          sw: "ne",
          nw: "se",
          se: "nw",
          n: "s",
          s: "n",
          e: "w",
          w: "e",
          u: "d",
          d: "u",
        };

        const opposite = opposites[direction];

        if (opposite) {
          createEntity({
            name: opposite,
            kind: "EXIT",
            location_id: newRoomId,
            props: { direction: opposite, destination_id: currentRoomId },
          });
        }

        ws.send(
          JSON.stringify({
            type: "message",
            text: `You dug ${direction} to '${roomName}'.`,
          }),
        );

        // Auto-move to new room
        moveEntity(player.id, newRoomId);
        sendRoom(newRoomId);
      } else if (command === "create") {
        if (args.length < 1) {
          ws.send(
            JSON.stringify({
              type: "message",
              text: "Usage: create <name> [props_json]",
            }),
          );
          return;
        }
        const name = args[0];
        let props = {};
        if (args.length > 1) {
          try {
            props = JSON.parse(args.slice(1).join(" "));
          } catch {
            ws.send(
              JSON.stringify({ type: "message", text: "Invalid props JSON." }),
            );
            return;
          }
        }

        if (!player.location_id) {
          ws.send(
            JSON.stringify({ type: "message", text: "You are in the void." }),
          );
          return;
        }

        createEntity({
          name,
          kind: "ITEM",
          location_id: player.location_id,
          props,
        });

        ws.send(
          JSON.stringify({
            type: "message",
            text: `Created '${name}'.`,
          }),
        );
        sendRoom(player.location_id);
      } else if (command === "set") {
        // ... (keep set logic) ...
        if (args.length < 3) {
          ws.send(
            JSON.stringify({
              type: "message",
              text: "Usage: set <target> <prop> <value>",
            }),
          );
          return;
        }
        const targetName = args[0].toLowerCase();
        const prop = args[1];
        const value = args.slice(2).join(" ");

        // Find target (recursive)
        const findRecursive = (
          containerId: number,
          name: string,
        ): { id: number; name: string; props: any } | null => {
          const contents = getContents(containerId);
          for (const item of contents) {
            if (item.name.toLowerCase() === name) return item;
            const found = findRecursive(item.id, name);
            if (found) return found;
          }
          return null;
        };

        let target = null;
        if (targetName === "here" || targetName === "room") {
          target = player.location_id ? getEntity(player.location_id) : null;
        } else if (targetName === "me" || targetName === "self") {
          target = player;
        } else {
          if (player.location_id)
            target = findRecursive(player.location_id, targetName);
          if (!target) target = findRecursive(player.id, targetName);
        }

        if (!target) {
          ws.send(
            JSON.stringify({
              type: "message",
              text: `You don't see '${targetName}' here.`,
            }),
          );
          return;
        }

        // Update props
        // Update props
        let parsedValue = value;
        try {
          parsedValue = JSON.parse(value);
        } catch {}

        const newProps = { ...target.props, [prop]: parsedValue };
        db.query("UPDATE entity_data SET props = ? WHERE entity_id = ?").run(
          JSON.stringify(newProps),
          target.id,
        );

        ws.send(
          JSON.stringify({
            type: "message",
            text: `Set ${prop} of '${target.name}' to '${value}'.`,
          }),
        );

        // If we updated the room, refresh it
        if (player.location_id && target.id === player.location_id) {
          sendRoom(player.location_id);
        }
      } else if (command === "login") {
        const id = parseInt(args[0]);
        if (isNaN(id)) {
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
        if (!name) {
          ws.send(
            JSON.stringify({
              type: "error",
              text: "Usage: create_player <name>",
            }),
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
