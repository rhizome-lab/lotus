import { createEntity, addVerb, updateVerb, getVerb } from "../repo";
import * as Core from "../scripting/lib/core";
import * as Object from "../scripting/lib/object";
import * as String from "../scripting/lib/string";
import * as List from "../scripting/lib/list";

export function seedHotel(lobbyId: number, voidId: number) {
  // 7. Hotel Implementation
  // 7. Hotel Implementation
  const exitPrototypeId = 1;

  // Hotel Lobby
  const hotelLobbyId = createEntity({
    name: "Grand Hotel Lobby",
    location: voidId,
    description:
      "The lavish lobby of the Grand Hotel. The elevator is to the side.",
  });

  // Connect Hotel Lobby to Main Lobby
  createEntity(
    {
      name: "hotel",
      location: lobbyId,
      direction: "hotel",
      destination: hotelLobbyId,
    },
    exitPrototypeId,
  );

  createEntity(
    {
      name: "out",
      location: hotelLobbyId,
      direction: "out",
      destination: lobbyId,
    },
    exitPrototypeId,
  );

  // Hotel Room Prototype (Hidden)
  const hotelRoomProtoId = createEntity({
    name: "Hotel Room Prototype",
    location: voidId,
    description: "A generic hotel room.",
  });

  // Verb: leave (on the prototype)
  // Moves player back to lobby and destroys the room
  addVerb(
    hotelRoomProtoId,
    "leave",
    Core["seq"](
      Core["call"](Core["caller"](), "move", hotelLobbyId), // Move player out first
      Core["call"](
        Core["caller"](),
        "tell",
        "You leave the room and it fades away behind you.",
      ),
      Core["destroy"](Core["this"]()), // Destroy the room
    ),
  );

  // Update 'leave' verb to use prop
  updateVerb(
    getVerb(hotelRoomProtoId, "leave")!.id,
    Core["seq"](
      Core["let"]("lobbyId", Object["obj.get"](Core["this"](), "lobby_id")),
      Core["call"](Core["caller"](), "move", Core["var"]("lobbyId")),
      Core["call"](
        Core["caller"](),
        "tell",
        "You leave the room and it fades away behind you.",
      ),
      // Destroy contents (furnishings)
      Core["let"](
        "contents",
        Object["obj.get"](Core["this"](), "contents", List["list.new"]()),
      ),
      Core["for"](
        "itemId",
        Core["var"]("contents"),
        Core["seq"](
          Core["let"]("item", Core["entity"](Core["var"]("itemId"))),
          Core["if"](Core["var"]("item"), Core["destroy"](Core["var"]("item"))),
        ),
      ),
      Core["destroy"](Core["this"]()),
    ),
  );

  // 8. Hotel Elevator & Floors

  // Elevator (Persistent)
  const elevatorId = createEntity({
    name: "Hotel Elevator",
    location: hotelLobbyId,
    description:
      "A polished brass elevator. Buttons for floors 1-100. Type 'push <floor>' to select.",
    current_floor: 1,
  });

  // Link Lobby -> Elevator
  createEntity(
    {
      name: "elevator",
      location: hotelLobbyId,
      direction: "elevator",
      destination_id: elevatorId,
    },
    exitPrototypeId,
  );

  // Floor Lobby Prototype (Ephemeral)
  const floorLobbyProtoId = createEntity({
    name: "Floor Lobby Proto",
    location: voidId,
    description: "A quiet carpeted lobby.",
  });

  // Wing Prototype (Ephemeral)
  const wingProtoId = createEntity({
    name: "Wing Proto",
    location: voidId,
    description: "A long hallway lined with doors.",
  });

  // --- Elevator Verbs ---

  // push <floor>
  addVerb(
    elevatorId,
    "push",
    Core["seq"](
      Core["let"]("floor", Core["arg"](0)),
      Object["obj.set"](Core["this"](), "current_floor", Core["var"]("floor")),
      Core["set_entity"](Core["this"]()),
      Core["call"](
        Core["caller"](),
        "tell",
        String["str.concat"](
          "The elevator hums and moves to floor ",
          Core["var"]("floor"),
          ".",
        ),
      ),
    ),
  );

  // out (Exit Elevator to Floor Lobby)
  addVerb(
    elevatorId,
    "out",
    Core["seq"](
      Core["let"]("floor", Object["obj.get"](Core["this"](), "current_floor")),
      // If floor 1, go to Main Hotel Lobby? Or just create Floor 1 Lobby?
      // Let's say Floor 1 is the Main Lobby.
      Core["if"](
        Core["=="](Core["var"]("floor"), 1),
        Core["seq"](
          Core["call"](Core["caller"](), "move", hotelLobbyId),
          Core["call"](
            Core["caller"](),
            "tell",
            "The doors open to the Grand Lobby.",
          ),
        ),
        Core["seq"](
          // Create Ephemeral Floor Lobby
          Core["let"]("lobbyData", {}),
          Object["obj.set"](
            Core["var"]("lobbyData"),
            "name",
            String["str.concat"]("Floor ", Core["var"]("floor"), " Lobby"),
          ),
          Object["obj.set"](Core["var"]("lobbyData"), "kind", "ROOM"),

          Object["obj.set"](
            Core["var"]("lobbyData"),
            "description",
            String["str.concat"](
              "The lobby of floor ",
              Core["var"]("floor"),
              ". West and East wings extend from here.",
            ),
          ),
          Object["obj.set"](
            Core["var"]("lobbyData"),
            "floor",
            Core["var"]("floor"),
          ),
          Object["obj.set"](
            Core["var"]("lobbyData"),
            "elevator_id",
            elevatorId,
          ),
          Core["let"]("lobbyId", Core["create"](Core["var"]("lobbyData"))),
          Core["set_prototype"](
            Core["entity"](Core["var"]("lobbyId")),
            floorLobbyProtoId,
          ),
          Core["call"](Core["caller"](), "move", Core["var"]("lobbyId")),
          Core["call"](
            Core["caller"](),
            "tell",
            String["str.concat"](
              "The doors open to Floor ",
              Core["var"]("floor"),
              ".",
            ),
          ),
        ),
      ),
    ),
  );

  // --- Floor Lobby Verbs ---

  // elevator (Return to Elevator)
  addVerb(
    floorLobbyProtoId,
    "elevator",
    Core["seq"](
      Core["let"]("elevId", Object["obj.get"](Core["this"](), "elevator_id")),
      Core["call"](Core["caller"](), "move", Core["var"]("elevId")),
      Core["call"](
        Core["caller"](),
        "tell",
        "You step back into the elevator.",
      ),
      Core["destroy"](Core["this"]()),
    ),
  );

  // west (Create Left Wing)
  addVerb(
    floorLobbyProtoId,
    "west",
    Core["seq"](
      Core["let"]("floor", Object["obj.get"](Core["this"](), "floor")),
      Core["let"]("wingData", {}),
      Object["obj.set"](
        Core["var"]("wingData"),
        "name",
        String["str.concat"]("Floor ", Core["var"]("floor"), " West Wing"),
      ),
      Object["obj.set"](Core["var"]("wingData"), "kind", "ROOM"),

      Object["obj.set"](
        Core["var"]("wingData"),
        "description",
        "A long hallway. Rooms 01-50 are here.",
      ),
      Object["obj.set"](Core["var"]("wingData"), "floor", Core["var"]("floor")),
      Object["obj.set"](Core["var"]("wingData"), "side", "West"),
      Object["obj.set"](
        Core["var"]("wingData"),
        "return_id",
        Object["obj.get"](Core["this"](), "id"),
      ), // Return to THIS lobby
      Core["let"]("wingId", Core["create"](Core["var"]("wingData"))),
      Core["set_prototype"](Core["entity"](Core["var"]("wingId")), wingProtoId),
      Core["call"](Core["caller"](), "move", Core["var"]("wingId")),
      Core["call"](Core["caller"](), "tell", "You walk down the West Wing."),
    ),
  );

  // east (Create Right Wing)
  addVerb(
    floorLobbyProtoId,
    "east",
    Core["seq"](
      Core["let"]("floor", Object["obj.get"](Core["this"](), "floor")),
      Core["let"]("wingData", Object["obj.new"]()),
      Object["obj.set"](
        Core["var"]("wingData"),
        "name",
        String["str.concat"]("Floor ", Core["var"]("floor"), " East Wing"),
      ),
      Object["obj.set"](Core["var"]("wingData"), "kind", "ROOM"),

      Object["obj.set"](
        Core["var"]("wingData"),
        "description",
        "A long hallway. Rooms 51-99 are here.",
      ),
      Object["obj.set"](Core["var"]("wingData"), "floor", Core["var"]("floor")),
      Object["obj.set"](Core["var"]("wingData"), "side", "East"),
      Object["obj.set"](
        Core["var"]("wingData"),
        "return_id",
        Object["obj.get"](Core["this"](), "id"),
      ),
      Core["let"]("wingId", Core["create"](Core["var"]("wingData"))),
      Core["set_prototype"](Core["entity"](Core["var"]("wingId")), wingProtoId),
      Core["call"](Core["caller"](), "move", Core["var"]("wingId")),
      Core["call"](Core["caller"](), "tell", "You walk down the East Wing."),
    ),
  );

  // Furnishings Prototypes
  const bedProtoId = createEntity({
    name: "Comfy Bed",
    location: voidId,
    description: "A soft, inviting bed with crisp white linens.",
  });

  const lampProtoId = createEntity({
    name: "Brass Lamp",
    location: voidId,
    description: "A polished brass lamp casting a warm glow.",
  });

  const chairProtoId = createEntity({
    name: "Velvet Chair",
    location: voidId,
    description: "A plush red velvet armchair.",
  });

  // --- Wing Verbs ---

  // back (Return to Floor Lobby)
  addVerb(
    wingProtoId,
    "back",
    Core["seq"](
      Core["let"]("returnId", Object["obj.get"](Core["this"](), "return_id")),
      Core["call"](Core["caller"](), "move", Core["var"]("returnId")),
      Core["call"](Core["caller"](), "tell", "You head back to the lobby."),
      Core["destroy"](Core["this"]()),
    ),
  );

  // enter <room_number>
  addVerb(
    wingProtoId,
    "enter",
    Core["seq"](
      Core["let"]("roomNum", Core["arg"](0)),
      Core["let"]("valid", true),
      // Validate room number matches wing side
      Core["let"]("side", Object["obj.get"](Core["this"](), "side")),
      Core["if"](
        Core["=="](Core["var"]("side"), "West"),
        Core["if"](
          Core["or"](
            Core["<"](Core["var"]("roomNum"), 1),
            Core[">"](Core["var"]("roomNum"), 50),
          ),
          Core["seq"](
            Core["call"](
              Core["caller"](),
              "tell",
              "Room numbers in the West Wing are 1-50.",
            ),
            Core["set"]("valid", false),
          ),
        ),
      ),
      Core["if"](
        Core["=="](Core["var"]("side"), "East"),
        Core["if"](
          Core["or"](
            Core["<"](Core["var"]("roomNum"), 51),
            Core[">"](Core["var"]("roomNum"), 99),
          ),
          Core["seq"](
            Core["call"](
              Core["caller"](),
              "tell",
              "Room numbers in the East Wing are 51-99.",
            ),
            Core["set"]("valid", false),
          ),
        ),
      ),
      // Execute if valid
      Core["if"](
        Core["var"]("valid"),
        Core["seq"](
          Core["let"]("roomData", Object["obj.new"]()),
          Object["obj.set"](
            Core["var"]("roomData"),
            "name",
            String["str.concat"]("Room ", Core["var"]("roomNum")),
          ),
          Object["obj.set"](Core["var"]("roomData"), "kind", "ROOM"),

          Object["obj.set"](
            Core["var"]("roomData"),
            "description",
            "A standard hotel room.",
          ),
          Object["obj.set"](
            Core["var"]("roomData"),
            "lobby_id",
            Object["obj.get"](Core["this"](), "id"),
          ), // Return to THIS wing
          Core["let"]("roomId", Core["create"](Core["var"]("roomData"))),
          Core["set_prototype"](
            Core["entity"](Core["var"]("roomId")),
            hotelRoomProtoId,
          ),
          // Furnish the room
          Core["let"]("bedData", Object["obj.new"]()),
          Object["obj.set"](Core["var"]("bedData"), "name", "Bed"),
          Object["obj.set"](Core["var"]("bedData"), "kind", "ITEM"),
          Object["obj.set"](
            Core["var"]("bedData"),
            "location",
            Core["var"]("roomId"),
          ),
          Core["let"]("bedId", Core["create"](Core["var"]("bedData"))),
          Core["set_prototype"](
            Core["entity"](Core["var"]("bedId")),
            bedProtoId,
          ),
          Core["let"]("lampData", Object["obj.new"]()),
          Object["obj.set"](Core["var"]("lampData"), "name", "Lamp"),
          Object["obj.set"](Core["var"]("lampData"), "kind", "ITEM"),
          Object["obj.set"](
            Core["var"]("lampData"),
            "location",
            Core["var"]("roomId"),
          ),
          Core["let"]("lampId", Core["create"](Core["var"]("lampData"))),
          Core["set_prototype"](
            Core["entity"](Core["var"]("lampId")),
            lampProtoId,
          ),
          Core["let"]("chairData", Object["obj.new"]()),
          Object["obj.set"](Core["var"]("chairData"), "name", "Chair"),
          Object["obj.set"](Core["var"]("chairData"), "kind", "ITEM"),
          Object["obj.set"](
            Core["var"]("chairData"),
            "location",
            Core["var"]("roomId"),
          ),
          Core["let"]("chairId", Core["create"](Core["var"]("chairData"))),
          Core["set_prototype"](
            Core["entity"](Core["var"]("chairId")),
            chairProtoId,
          ),

          // Update Room Contents
          Core["let"]("room", Core["entity"](Core["var"]("roomId"))),
          Core["let"]("contents", List["list.new"]()),
          List["list.push"](Core["var"]("contents"), Core["var"]("bedId")),
          List["list.push"](Core["var"]("contents"), Core["var"]("lampId")),
          List["list.push"](Core["var"]("contents"), Core["var"]("chairId")),
          Object["obj.set"](
            Core["var"]("room"),
            "contents",
            Core["var"]("contents"),
          ),
          Core["set_entity"](Core["var"]("room")),

          Core["call"](Core["caller"](), "move", Core["var"]("roomId")),
          Core["call"](
            Core["caller"](),
            "tell",
            String["str.concat"](
              "You enter Room ",
              Core["var"]("roomNum"),
              ".",
            ),
          ),
        ),
      ),
    ),
  );

  // 9. NPCs

  // Receptionist (in Hotel Lobby)
  const receptionistId = createEntity({
    name: "Receptionist",
    location: hotelLobbyId,
    description: "A friendly receptionist standing behind the desk.",
  });

  addVerb(
    receptionistId,
    "on_hear",
    Core["seq"](
      Core["let"]("msg", Core["arg"](0)),
      Core["let"]("speakerId", Core["arg"](1)),
      // Simple heuristics
      Core["if"](
        String["str.includes"](String["str.lower"](Core["var"]("msg")), "room"),
        Core["call"](
          Core["caller"](),
          "say",
          "We have lovely rooms available on floors 1-100. Just use the elevator!",
        ),
      ),
      Core["if"](
        String["str.includes"](
          String["str.lower"](Core["var"]("msg")),
          "hello",
        ),
        Core["call"](
          Core["caller"](),
          "say",
          "Welcome to the Grand Hotel! How may I help you?",
        ),
      ),
    ),
  );

  // Golem (in Void for now, maybe move to lobby?)
  // Let's put the Golem in the Hotel Lobby too for testing
  const golemId = createEntity({
    name: "Stone Golem",
    location: hotelLobbyId,
    description: "A massive stone golem. It seems to be listening.",
  });

  addVerb(
    golemId,
    "on_hear",
    Core["seq"](
      Core["let"]("msg", Core["arg"](0)),
      Core["let"]("type", Core["arg"](2)),
      Core["if"](
        Core["=="](Core["var"]("type"), "tell"),
        Core["call"](
          Core["caller"](),
          "say",
          String["str.concat"]("Golem echoes: ", Core["var"]("msg")),
        ),
      ),
    ),
  );
}
