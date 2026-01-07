// oxlint-disable-next-line no-unassigned-import
import "../../generated_types";
import { EntityBase } from "./EntityBase";

export class HotelManager extends EntityBase {
  prototype_id!: number | null;
  active_rooms?: number[];
  lobby_id?: number;
  lobby_proto_id?: number;
  room_proto_id?: number;

  enter() {
    const player = std.caller();
    const lobbyId = this.lobby_id;

    if (lobbyId) {
      if (entity(lobbyId)) {
        call(player, "teleport", entity(lobbyId));
        return;
      }
    }

    // Lobby doesn't exist, create it.
    call(this, "create_lobby");
    // Refetch lobby_id after creation
    const newLobbyId = this.lobby_id;
    if (newLobbyId) {
      call(player, "teleport", entity(newLobbyId));
    } else {
      send(
        "message",
        "The Grand Hotel is currently closed for renovations (Lobby creation failed).",
      );
    }
  }

  create_lobby() {
    const createCap = get_capability("sys.create", {});
    const controlCap = get_capability("entity.control", { "*": true });

    if (!createCap) {
      send("message", "Hotel Manager missing capabilities.");
      return;
    }
    if (!controlCap) {
      send("message", "Hotel Manager missing capabilities.");
      return;
    }

    const lobbyProtoId = this.lobby_proto_id;
    const lobbyData: Record<string, any> = {};
    lobbyData["name"] = "Grand Hotel Lobby";
    lobbyData["description"] =
      "The opulent lobby of the Grand Hotel. Crystal chandeliers hang from the ceiling.";
    lobbyData["location"] = this.location;

    const lobbyId = createCap.create(lobbyData);
    if (lobbyProtoId) {
      controlCap.setPrototype(lobbyId, lobbyProtoId);
    }

    // Store lobby ID on manager
    controlCap.update(this, { lobby_id: lobbyId });

    // Tag the lobby so we know it belongs to the hotel
    const lobby = entity(lobbyId);
    if (lobby) {
      controlCap.update(lobby, {
        hotel_entity_type: "lobby",
        managed_by: this.id,
      });
    }

    // Manual location handling: Add lobby to manager's location (Void?)
    const locId = this.location;
    if (locId) {
      const loc = entity(locId);
      if (loc) {
        const contents = (loc["contents"] as number[]) ?? [];
        list.push(contents, lobbyId);
        controlCap.update(loc, { contents });
      }
    }

    send("message", "Grand Hotel Lobby created.");
    return lobbyId;
  }

  create_room() {
    const params = std.arg<Record<string, any>>(1) ?? {};

    const createCap = get_capability("sys.create", {});
    const controlCap = get_capability("entity.control", { "*": true });

    if (!createCap) {
      return null;
    }
    if (!controlCap) {
      return null;
    }

    const roomProtoId = this.room_proto_id;
    const roomId = createCap.create({
      description: params["description"] ?? "A generic hotel room.",
      location: this.location,
      name: params["name"] ?? "Hotel Room",
    });
    if (roomProtoId) {
      controlCap.setPrototype(roomId, roomProtoId);
    }

    const room = entity(roomId);
    if (room) {
      controlCap.update(room, {
        hotel_entity_type: "room",
        last_occupied: time.now(), // timestamp
        managed_by: this.id,
      });
    }

    // Select random theme using room ID as seed (multiply by prime for better distribution)
    const themes = ["modern", "victorian", "scifi", "rustic"];
    const themeIdx = (roomId * 7919) % list.len(themes);
    const selectedTheme = themes[themeIdx];

    call(this, "generate_content", roomId, selectedTheme);

    // Track the room
    const activeRooms = (this.active_rooms as number[]) ?? [];
    list.push(activeRooms, roomId);
    controlCap.update(this, { active_rooms: activeRooms });

    // Manual location handling: Add room to manager's location
    const locId = this.location;
    if (locId) {
      const loc = entity(locId);
      if (loc) {
        const contents = (loc["contents"] as number[]) ?? [];
        list.push(contents, roomId);
        controlCap.update(loc, { contents });
      }
    }

    return roomId;
  }

  cleanup_loop() {
    // 1. Find all entities managed by this manager
    // BETTER: Maintain a list of active_rooms on the manager.
    const activeRooms = (this.active_rooms as number[]) ?? [];
    const controlCap = get_capability("entity.control", { "*": true });

    if (!controlCap) {
      return;
    }

    const stillActiveRooms: number[] = [];
    const now = time.now();
    const CLEANUP_GRACE_PERIOD = 10_000; // 10 seconds for testing

    for (const roomId of activeRooms) {
      const room = entity(roomId);
      if (!room) {
        continue; // Already gone
      }

      const contents = (room["contents"] as number[]) ?? [];
      const lastOccupied = (room["last_occupied"] as string) ?? time.now();
      const isEmpty = list.len(contents) === 0; // Very naive for now

      if (isEmpty) {
        if (time.to_timestamp(now) - time.to_timestamp(lastOccupied) > CLEANUP_GRACE_PERIOD) {
          // Destroy!
          call(this, "gc", roomId);
          send("message", `[Manager] Cleaned up room ${roomId}`);
        } else {
          list.push(stillActiveRooms, roomId);
        }
      } else {
        list.push(stillActiveRooms, roomId);
      }
    }

    controlCap.update(this, { active_rooms: stillActiveRooms });
    schedule("cleanup_loop", [], 5000);
  }

  generate_content() {
    const roomId = std.arg<number>(0);
    const selectedTheme = std.arg<string>(1) ?? "modern";

    const createCap = get_capability("sys.create", {});
    const controlCap = get_capability("entity.control", { "*": true });

    if (!createCap) {
      return;
    }
    if (!controlCap) {
      return;
    }

    const room = entity(roomId);
    if (!room) {
      return;
    }

    // 1. Apply Theme Description
    let themeDesc = "";
    if (selectedTheme === "modern") {
      themeDesc = "Sleek lines and minimalist decor.";
    } else if (selectedTheme === "victorian") {
      themeDesc = "Ornate woodwork and heavy drapes.";
    } else if (selectedTheme === "scifi") {
      themeDesc = "Glowing panels and metallic surfaces.";
    } else if (selectedTheme === "rustic") {
      themeDesc = "Rough-hewn wood and cozy fabrics.";
    }

    controlCap.update(room, {
      description: `${room["description"]} It has a ${selectedTheme} style. ${themeDesc}`,
      theme: selectedTheme,
    });

    // 2. Generate Furniture (2-5 items, determined by roomId)
    const furnitureCount = 2 + ((roomId * 7919) % 4); // 2 to 5 items
    // Pick random furniture
    const common = ["Chair", "Table", "Lamp", "Rug"];
    let idx = 0;

    // Collect new item IDs here
    const newItems: number[] = [];

    while (idx < furnitureCount) {
      let specific: string[] = [];
      if (selectedTheme === "modern") {
        specific = ["Glass Desk", "Beanbag"];
      } else if (selectedTheme === "victorian") {
        specific = ["Armchair", "Grandfather Clock"];
      } else if (selectedTheme === "scifi") {
        specific = ["Holo-Projector", "Pod"];
      } else if (selectedTheme === "rustic") {
        specific = ["Rocking Chair", "Fireplace"];
      }

      const allOptions = list.concat(common, specific);
      const furnitureIdx = ((roomId + idx) * 7919) % list.len(allOptions);
      const furnitureType = list.get(allOptions, furnitureIdx) as string;

      const itemName = `${selectedTheme} ${furnitureType}`;

      const newItemId = createCap.create({
        adjectives: [`style:${selectedTheme}`, `type:${furnitureType}`],
        description: `A ${selectedTheme}-style ${furnitureType}.`,
        location: roomId,
        name: itemName,
      });

      list.push(newItems, newItemId);
      idx += 1;
    }

    // Batch update contents once
    const contents = (room["contents"] as number[]) ?? [];
    const newContents = list.concat(contents, newItems);
    controlCap.update(room, { contents: newContents });
  }

  gc() {
    const targetId = std.arg<number>(0);
    const controlCap = get_capability("entity.control", { "*": true });
    // In future: recursive destroy contents
    if (controlCap) {
      controlCap.destroy(targetId);
    }
  }

  start() {
    schedule("cleanup_loop", [], 1000);
  }
}

declare function schedule(verb: string, args: unknown[], delay: number): void;

export class HotelRoomPrototype implements Entity {
  id!: number;
  prototype_id!: number | null;
  managed_by?: number;
  [key: string]: unknown;

  on_enter() {
    const managerId = this.managed_by;
    if (managerId) {
      // const manager = entity(managerId);
      // call(manager, "room_occupied", this.id); // Valid future enhancement
    }
  }

  on_leave() {
    const managerId = this.managed_by;
    if (managerId) {
      // Uncomment when room_vacated is implemented
      // call(manager, "room_vacated", this.id);
    }
  }
}
