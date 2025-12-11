import { resolve } from "node:path";
import { transpile } from "@viwo/scripting";
import { addVerb, createCapability, createEntity, getEntity, updateEntity } from "../../repo";
import { extractVerb } from "../../verb_loader";

export function seedHotel(voidId: number, lobbyId: number) {
  // 12. Hotel Seed (Stage 1)
  const hotelManagerPath = resolve(__dirname, "manager.ts");
  const hotelPrototypesPath = resolve(__dirname, "prototypes.ts");

  // Create Hotel Manager
  const hotelManagerId = createEntity({
    description: "The concierge of the Grand Hotel.",
    location: voidId,
    name: "Hotel Manager",
  });

  // Grant capabilities
  createCapability(hotelManagerId, "sys.create", {});
  createCapability(hotelManagerId, "entity.control", { "*": true });

  // Add Manager Verbs
  addVerb(hotelManagerId, "enter", transpile(extractVerb(hotelManagerPath, "manager_enter")));
  addVerb(
    hotelManagerId,
    "create_lobby",
    transpile(extractVerb(hotelManagerPath, "manager_create_lobby")),
  );
  addVerb(
    hotelManagerId,
    "create_room",
    transpile(extractVerb(hotelManagerPath, "manager_create_room")),
  );
  addVerb(
    hotelManagerId,
    "cleanup_loop",
    transpile(extractVerb(hotelManagerPath, "manager_cleanup_loop")),
  );
  addVerb(hotelManagerId, "gc", transpile(extractVerb(hotelManagerPath, "manager_gc")));
  addVerb(
    hotelManagerId,
    "generate_content",
    transpile(extractVerb(hotelManagerPath, "manager_generate_content")),
  );

  // Start Cleanup Loop
  addVerb(hotelManagerId, "start", transpile("schedule('cleanup_loop', [], 1000)")); // Simple inline start script

  // Prototypes
  const hotelRoomProtoId = createEntity({
    description: "A standard hotel room.",
    name: "Hotel Room Prototype",
  });
  addVerb(
    hotelRoomProtoId,
    "on_enter",
    transpile(extractVerb(hotelPrototypesPath, "room_on_enter")),
  );
  addVerb(
    hotelRoomProtoId,
    "on_leave",
    transpile(extractVerb(hotelPrototypesPath, "room_on_leave")),
  );

  const hotelLobbyProtoId = createEntity({
    description: "Points to the Hotel Manager.",
    name: "Hotel Lobby Prototype",
  });

  // Configure Manager with Prototypes
  updateEntity({
    ...getEntity(hotelManagerId)!,
    active_rooms: [],
    lobby_id: null,
    lobby_proto_id: hotelLobbyProtoId,
    room_proto_id: hotelRoomProtoId,
  });

  // Link Hotel Entry to Lobby (Optional/Temporary)
  // Let's add 'hotel' verb to Lobby to call manager:enter
  addVerb(lobbyId, "hotel", transpile(`call(entity(${hotelManagerId}), "enter")`));
}
