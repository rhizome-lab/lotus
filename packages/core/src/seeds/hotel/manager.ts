// oxlint-disable-next-line no-unassigned-import
import "../../generated_types";
// oxlint-disable-next-line no-unassigned-import
import "../../plugin_types";

export function manager_enter(this: Entity) {
  const player = std.caller();
  const lobbyId = this["lobby_id"] as number;

  if (lobbyId && entity(lobbyId)) {
    call(player, "teleport", entity(lobbyId));
    return;
  }

  // Lobby doesn't exist, create it.
  call(this, "create_lobby");
  // Refetch lobby_id after creation
  const newLobbyId = this["lobby_id"] as number;
  if (newLobbyId) {
    call(player, "teleport", entity(newLobbyId));
  } else {
    send("message", "The Grand Hotel is currently closed for renovations (Lobby creation failed).");
  }
}

export function manager_create_lobby(this: Entity) {
  const createCap = get_capability("sys.create", {});
  const controlCap = get_capability("entity.control", { "*": true });

  if (!createCap || !controlCap) {
    send("message", "Hotel Manager missing capabilities.");
    return;
  }

  const lobbyProtoId = this["lobby_proto_id"] as number;
  const lobbyData: Record<string, any> = {};
  lobbyData["name"] = "Grand Hotel Lobby";
  lobbyData["description"] =
    "The opulent lobby of the Grand Hotel. Crystal chandeliers hang from the ceiling.";
  // Located in Void initially? Or wherever the manager thinks is best.
  // Ideally, it's floating until connected.
  lobbyData["location"] = this["location"];

  const lobbyId = std.call_method(createCap, "create", lobbyData);
  if (lobbyProtoId) {
    std.call_method(controlCap, "setPrototype", lobbyId, lobbyProtoId);
  }

  // Store lobby ID on manager
  std.call_method(controlCap, "update", this.id, { lobby_id: lobbyId });

  // Tag the lobby so we know it belongs to the hotel
  std.call_method(controlCap, "update", lobbyId, {
    hotel_entity_type: "lobby",
    managed_by: this.id,
  });

  send("message", "Grand Hotel Lobby created.");
  return lobbyId;
}

export function manager_create_room(this: Entity) {
  const params = std.arg<Record<string, any>>(1) || {};

  const createCap = get_capability("sys.create", {});
  const controlCap = get_capability("entity.control", { "*": true });

  if (!createCap || !controlCap) {
    return null;
  }

  const roomProtoId = this["room_proto_id"] as number;
  const roomData: Record<string, any> = {};
  roomData["name"] = params["name"] ?? "Hotel Room";
  roomData["description"] = params["description"] ?? "A generic hotel room.";
  roomData["location"] = this["location"]; // Temporary location

  const roomId = std.call_method(createCap, "create", roomData);
  if (roomProtoId) {
    std.call_method(controlCap, "setPrototype", roomId, roomProtoId);
  }

  std.call_method(controlCap, "update", roomId, {
    hotel_entity_type: "room",
    last_occupied: time.now(), // timestamp
    managed_by: this.id,
  });

  // Generate content
  // Pick a random theme
  const themes = ["modern", "victorian", "scifi", "rustic"];
  const themeCount = list.len(themes);
  const maxThemeIdx = themeCount - 1;
  const themeIdx = random.between(0, maxThemeIdx);
  const selectedTheme = list.get(themes, themeIdx);

  call(this, "generate_content", roomId, selectedTheme);

  // Track the room
  const activeRooms = (this["active_rooms"] as number[]) ?? [];
  list.push(activeRooms, roomId);
  std.call_method(controlCap, "update", this.id, { active_rooms: activeRooms });

  return roomId;
}

export function manager_cleanup_loop(this: Entity) {
  // 1. Find all entities managed by this manager
  // In a real DB we'd query by prop, but here we might need to track them in a list or scan.
  // For Stage 1 failure-resistance, let's just scan 'hotel_entities' list if we maintain one,
  // OR rely on a recursive scan of the Hotel structure if linked.

  // BETTER: Maintain a list of active_rooms on the manager.
  const activeRooms = (this["active_rooms"] as number[]) ?? [];
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
    // Check for players (assuming players are the only things that matter for now)
    // We can check if any content has a 'player' tag or just check if it's a connection.
    // Simplest: check if contents is empty (excluding furniture?)
    // For Stage 1: if contents is empty, destroy.

    // Actually, 'on_leave' should update 'last_occupied'.
    // If 'last_occupied' is > X seconds ago AND empty, destroy.

    const lastOccupied = (room["last_occupied"] as string) ?? time.now();
    const isEmpty = list.len(contents) === 0; // Very naive for now

    if (
      isEmpty &&
      time.to_timestamp(now) - time.to_timestamp(lastOccupied) > CLEANUP_GRACE_PERIOD
    ) {
      // Destroy!
      call(this, "gc", roomId);
      send("message", `[Manager] Cleaned up room ${roomId}`);
    } else {
      list.push(stillActiveRooms, roomId);
    }
  }

  std.call_method(controlCap, "update", this.id, { active_rooms: stillActiveRooms });
  schedule("cleanup_loop", [], 5000);
}

export function manager_generate_content() {
  const roomId = std.arg<number>(0);
  const selectedTheme = std.arg<string>(1) ?? "modern";

  const createCap = get_capability("sys.create", {});
  const controlCap = get_capability("entity.control", { "*": true });

  if (!createCap || !controlCap) {
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

  const room = entity(roomId);
  if (room) {
    std.call_method(controlCap, "update", roomId, {
      description: `${room["description"]} It has a ${selectedTheme} style. ${themeDesc}`,
      theme: selectedTheme,
    });
  }

  // 2. Generate Furniture
  const furnitureCount = random.between(2, 5); // 2 to 5 items

  for (let idx = 0; idx < furnitureCount; idx += 1) {
    // Pick random furniture
    const common = ["Chair", "Table", "Lamp", "Rug"];
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
    const count = list.len(allOptions);
    const maxIdx = count - 1;
    const idx = random.between(0, maxIdx);
    const furnitureType = list.get(allOptions, idx) as string;

    const itemName = `${selectedTheme} ${furnitureType}`;

    std.call_method(createCap, "create", {
      adjectives: [`style:${selectedTheme}`, `type:${furnitureType}`],
      description: `A ${selectedTheme}-style ${furnitureType}.`,
      location: roomId,
      name: itemName,
    });
  }
}

export function manager_gc() {
  const targetId = std.arg<number>(0);
  const controlCap = get_capability("entity.control", { "*": true });
  // In future: recursive destroy contents
  if (controlCap) {
    std.call_method(controlCap, "destroy", targetId);
  }
}
