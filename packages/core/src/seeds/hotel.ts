import {
  createEntity,
  addVerb,
  updateVerb,
  getVerb,
  createCapability,
} from "../repo";
import {
  StdLib as Std,
  ObjectLib as Object,
  StringLib as String,
  ListLib as List,
  BooleanLib,
} from "@viwo/scripting";
import * as CoreLib from "../runtime/lib/core";
import * as KernelLib from "../runtime/lib/kernel";

export function seedHotel(
  lobbyId: number,
  voidId: number,
  entityBaseId: number,
) {
  // 7. Hotel Implementation
  // 7. Hotel Implementation
  const exitPrototypeId = 1;

  // Hotel Lobby
  const hotelLobbyId = createEntity(
    {
      name: "Grand Hotel Lobby",
      location: voidId,
      description:
        "The lavish lobby of the Grand Hotel. The elevator is to the side.",
    },
    entityBaseId,
  );

  createCapability(hotelLobbyId, "entity.control", { target_id: hotelLobbyId });

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
  const hotelRoomProtoId = createEntity(
    {
      name: "Hotel Room Prototype",
      location: voidId,
      description: "A generic hotel room.",
    },
    entityBaseId,
  );

  // Verb: leave (on the prototype)
  // Moves player back to lobby and destroys the room
  addVerb(
    hotelRoomProtoId,
    "leave",
    Std["seq"](
      CoreLib["call"](Std["caller"](), "move", hotelLobbyId), // Move player out first
      CoreLib["call"](
        Std["caller"](),
        "tell",
        "You leave the room and it fades away behind you.",
      ),
      Std["let"](
        "cap",
        KernelLib["get_capability"](
          "entity.control",
          Object["obj.new"]([
            "target_id",
            Object["obj.get"](Std["this"](), "id"),
          ]),
        ),
      ),
      CoreLib["destroy"](Std["var"]("cap"), Std["this"]()), // Destroy the room
    ),
  );

  // Update 'leave' verb to use prop
  updateVerb(
    getVerb(hotelRoomProtoId, "leave")!.id,
    Std["seq"](
      Std["let"]("lobbyId", Object["obj.get"](Std["this"](), "lobby_id")),
      CoreLib["call"](Std["caller"](), "move", Std["var"]("lobbyId")),
      CoreLib["call"](
        Std["caller"](),
        "tell",
        "You leave the room and it fades away behind you.",
      ),
      // Destroy contents (furnishings)
      Std["let"](
        "freshThis",
        CoreLib["entity"](Object["obj.get"](Std["this"](), "id")),
      ),
      Std["let"](
        "contents",
        Object["obj.get"](
          Std["var"]("freshThis"),
          "contents",
          List["list.new"](),
        ),
      ),
      Std["for"](
        "itemId",
        Std["var"]("contents"),
        Std["seq"](
          Std["let"]("item", CoreLib["entity"](Std["var"]("itemId"))),
          Std["if"](
            Std["var"]("item"),
            Std["seq"](
              Std["let"](
                "itemCap",
                KernelLib["get_capability"](
                  "entity.control",
                  Object["obj.new"]([
                    "target_id",
                    Object["obj.get"](Std["var"]("item"), "id"),
                  ]),
                ),
              ),
              CoreLib["destroy"](Std["var"]("itemCap"), Std["var"]("item")),
            ),
          ),
        ),
      ),
      Std["let"](
        "cap",
        KernelLib["get_capability"](
          "entity.control",
          Object["obj.new"]([
            "target_id",
            Object["obj.get"](Std["this"](), "id"),
          ]),
        ),
      ),
      CoreLib["destroy"](Std["var"]("cap"), Std["this"]()),
    ),
  );

  // 8. Hotel Elevator & Floors

  // Elevator (Persistent)
  const elevatorId = createEntity(
    {
      name: "Hotel Elevator",
      location: hotelLobbyId,
      description:
        "A polished brass elevator. Buttons for floors 1-100. Type 'push <floor>' to select.",
      current_floor: 1,
    },
    entityBaseId,
  );

  createCapability(elevatorId, "sys.create", {});
  createCapability(elevatorId, "entity.control", { "*": true });

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
  const floorLobbyProtoId = createEntity(
    {
      name: "Floor Lobby Proto",
      location: voidId,
      description: "A quiet carpeted lobby.",
    },
    entityBaseId,
  );

  // Wing Prototype (Ephemeral)
  const wingProtoId = createEntity(
    {
      name: "Wing Proto",
      location: voidId,
      description: "A long hallway lined with doors.",
    },
    entityBaseId,
  );

  // --- Elevator Verbs ---

  // push <floor>
  addVerb(
    elevatorId,
    "push",
    Std["seq"](
      Std["let"]("floor", Std["arg"](0)),
      Object["obj.set"](Std["this"](), "current_floor", Std["var"]("floor")),
      CoreLib["set_entity"](
        KernelLib["get_capability"]("entity.control"),
        Std["this"](),
      ),
      CoreLib["call"](
        Std["caller"](),
        "tell",
        String["str.concat"](
          "The elevator hums and moves to floor ",
          Std["var"]("floor"),
          ".",
        ),
      ),
    ),
  );

  // out (Exit Elevator to Floor Lobby)
  addVerb(
    elevatorId,
    "out",
    Std["seq"](
      Std["let"]("floor", Object["obj.get"](Std["this"](), "current_floor")),
      // If floor 1, go to Main Hotel Lobby? Or just create Floor 1 Lobby?
      // Let's say Floor 1 is the Main Lobby.
      Std["if"](
        BooleanLib["=="](Std["var"]("floor"), 1),
        Std["seq"](
          CoreLib["call"](Std["caller"](), "move", hotelLobbyId),
          CoreLib["call"](
            Std["caller"](),
            "tell",
            "The doors open to the Grand Lobby.",
          ),
        ),
        Std["seq"](
          // Create Ephemeral Floor Lobby
          Std["let"]("createCap", KernelLib["get_capability"]("sys.create")),
          Std["let"]("lobbyData", {}),
          Object["obj.set"](
            Std["var"]("lobbyData"),
            "name",
            String["str.concat"]("Floor ", Std["var"]("floor"), " Lobby"),
          ),
          Object["obj.set"](Std["var"]("lobbyData"), "kind", "ROOM"),

          Object["obj.set"](
            Std["var"]("lobbyData"),
            "description",
            String["str.concat"](
              "The lobby of floor ",
              Std["var"]("floor"),
              ". West and East wings extend from here.",
            ),
          ),
          Object["obj.set"](
            Std["var"]("lobbyData"),
            "floor",
            Std["var"]("floor"),
          ),
          Object["obj.set"](Std["var"]("lobbyData"), "elevator_id", elevatorId),
          Std["let"](
            "lobbyId",
            CoreLib["create"](Std["var"]("createCap"), Std["var"]("lobbyData")),
          ),
          Std["let"]("filter", Object["obj.new"]()),
          Object["obj.set"](
            Std["var"]("filter"),
            "target_id",
            Std["var"]("lobbyId"),
          ),
          CoreLib["set_prototype"](
            KernelLib["get_capability"]("entity.control", Std["var"]("filter")),
            CoreLib["entity"](Std["var"]("lobbyId")),
            floorLobbyProtoId,
          ),
          // Give capabilities to Lobby
          // 1. sys.create
          Std["let"](
            "lobbyCreateCap",
            KernelLib["delegate"](Std["var"]("createCap"), {}),
          ),
          KernelLib["give_capability"](
            Std["var"]("lobbyCreateCap"),
            CoreLib["entity"](Std["var"]("lobbyId")),
          ),
          // 2. entity.control (self)
          Std["let"](
            "lobbyControlCap",
            KernelLib["get_capability"]("entity.control", Std["var"]("filter")),
          ),
          KernelLib["give_capability"](
            Std["var"]("lobbyControlCap"),
            CoreLib["entity"](Std["var"]("lobbyId")),
          ),

          CoreLib["call"](Std["caller"](), "move", Std["var"]("lobbyId")),
          CoreLib["call"](
            Std["caller"](),
            "tell",
            String["str.concat"](
              "The doors open to Floor ",
              Std["var"]("floor"),
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
    Std["seq"](
      Std["let"]("elevId", Object["obj.get"](Std["this"](), "elevator_id")),
      CoreLib["call"](Std["caller"](), "move", Std["var"]("elevId")),
      CoreLib["call"](
        Std["caller"](),
        "tell",
        "You step back into the elevator.",
      ),
      Std["let"](
        "cap",
        KernelLib["get_capability"](
          "entity.control",
          Object["obj.new"]([
            "target_id",
            Object["obj.get"](Std["this"](), "id"),
          ]),
        ),
      ),
      CoreLib["destroy"](Std["var"]("cap"), Std["this"]()),
    ),
  );

  // west (Create Left Wing)
  addVerb(
    floorLobbyProtoId,
    "west",
    Std["seq"](
      Std["let"]("floor", Object["obj.get"](Std["this"](), "floor")),
      Std["let"]("createCap", KernelLib["get_capability"]("sys.create")),
      Std["let"]("wingData", {}),
      Object["obj.set"](
        Std["var"]("wingData"),
        "name",
        String["str.concat"]("Floor ", Std["var"]("floor"), " West Wing"),
      ),
      Object["obj.set"](Std["var"]("wingData"), "kind", "ROOM"),

      Object["obj.set"](
        Std["var"]("wingData"),
        "description",
        "A long hallway. Rooms 01-50 are here.",
      ),
      Object["obj.set"](Std["var"]("wingData"), "floor", Std["var"]("floor")),
      Object["obj.set"](Std["var"]("wingData"), "side", "West"),
      Object["obj.set"](
        Std["var"]("wingData"),
        "return_id",
        Object["obj.get"](Std["this"](), "id"),
      ), // Return to THIS lobby
      Std["let"](
        "wingId",
        CoreLib["create"](Std["var"]("createCap"), Std["var"]("wingData")),
      ),
      Std["let"]("filter", Object["obj.new"]()),
      Object["obj.set"](
        Std["var"]("filter"),
        "target_id",
        Std["var"]("wingId"),
      ),
      CoreLib["set_prototype"](
        KernelLib["get_capability"]("entity.control", Std["var"]("filter")),
        CoreLib["entity"](Std["var"]("wingId")),
        wingProtoId,
      ),
      // Give capabilities to Wing
      // 1. sys.create
      Std["let"](
        "wingCreateCap",
        KernelLib["delegate"](Std["var"]("createCap"), {}),
      ),
      KernelLib["give_capability"](
        Std["var"]("wingCreateCap"),
        CoreLib["entity"](Std["var"]("wingId")),
      ),
      // 2. entity.control (self)
      Std["let"](
        "wingControlCap",
        KernelLib["get_capability"]("entity.control", Std["var"]("filter")),
      ),
      KernelLib["give_capability"](
        Std["var"]("wingControlCap"),
        CoreLib["entity"](Std["var"]("wingId")),
      ),

      CoreLib["call"](Std["caller"](), "move", Std["var"]("wingId")),
      CoreLib["call"](Std["caller"](), "tell", "You walk down the West Wing."),
    ),
  );

  // east (Create Right Wing)
  addVerb(
    floorLobbyProtoId,
    "east",
    Std["seq"](
      Std["let"]("floor", Object["obj.get"](Std["this"](), "floor")),
      Std["let"]("createCap", KernelLib["get_capability"]("sys.create")),
      Std["let"]("wingData", Object["obj.new"]()),
      Object["obj.set"](
        Std["var"]("wingData"),
        "name",
        String["str.concat"]("Floor ", Std["var"]("floor"), " East Wing"),
      ),
      Object["obj.set"](Std["var"]("wingData"), "kind", "ROOM"),

      Object["obj.set"](
        Std["var"]("wingData"),
        "description",
        "A long hallway. Rooms 51-99 are here.",
      ),
      Object["obj.set"](Std["var"]("wingData"), "floor", Std["var"]("floor")),
      Object["obj.set"](Std["var"]("wingData"), "side", "East"),
      Object["obj.set"](
        Std["var"]("wingData"),
        "return_id",
        Object["obj.get"](Std["this"](), "id"),
      ),
      Std["let"](
        "wingId",
        CoreLib["create"](Std["var"]("createCap"), Std["var"]("wingData")),
      ),
      Std["let"]("filter", Object["obj.new"]()),
      Object["obj.set"](
        Std["var"]("filter"),
        "target_id",
        Std["var"]("wingId"),
      ),
      CoreLib["set_prototype"](
        KernelLib["get_capability"]("entity.control", Std["var"]("filter")),
        CoreLib["entity"](Std["var"]("wingId")),
        wingProtoId,
      ),
      // Give capabilities to Wing
      // 1. sys.create
      Std["let"](
        "wingCreateCap",
        KernelLib["delegate"](Std["var"]("createCap"), {}),
      ),
      KernelLib["give_capability"](
        Std["var"]("wingCreateCap"),
        CoreLib["entity"](Std["var"]("wingId")),
      ),
      // 2. entity.control (self)
      Std["let"](
        "wingControlCap",
        KernelLib["get_capability"]("entity.control", Std["var"]("filter")),
      ),
      KernelLib["give_capability"](
        Std["var"]("wingControlCap"),
        CoreLib["entity"](Std["var"]("wingId")),
      ),

      CoreLib["call"](Std["caller"](), "move", Std["var"]("wingId")),
      CoreLib["call"](Std["caller"](), "tell", "You walk down the East Wing."),
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
    Std["seq"](
      Std["let"]("returnId", Object["obj.get"](Std["this"](), "return_id")),
      CoreLib["call"](Std["caller"](), "move", Std["var"]("returnId")),
      CoreLib["call"](Std["caller"](), "tell", "You head back to the lobby."),
      Std["let"](
        "cap",
        KernelLib["get_capability"](
          "entity.control",
          Object["obj.new"]([
            "target_id",
            Object["obj.get"](Std["this"](), "id"),
          ]),
        ),
      ),
      CoreLib["destroy"](Std["var"]("cap"), Std["this"]()),
    ),
  );

  // enter <room_number>
  addVerb(
    wingProtoId,
    "enter",
    Std["seq"](
      Std["let"]("roomNum", Std["arg"](0)),
      Std["let"]("valid", true),
      // Validate room number matches wing side
      Std["let"]("side", Object["obj.get"](Std["this"](), "side")),
      Std["if"](
        BooleanLib["=="](Std["var"]("side"), "West"),
        Std["if"](
          BooleanLib["or"](
            BooleanLib["<"](Std["var"]("roomNum"), 1),
            BooleanLib[">"](Std["var"]("roomNum"), 50),
          ),
          Std["seq"](
            CoreLib["call"](
              Std["caller"](),
              "tell",
              "Room numbers in the West Wing are 1-50.",
            ),
            Std["set"]("valid", false),
          ),
        ),
      ),
      Std["if"](
        BooleanLib["=="](Std["var"]("side"), "East"),
        Std["if"](
          BooleanLib["or"](
            BooleanLib["<"](Std["var"]("roomNum"), 51),
            BooleanLib[">"](Std["var"]("roomNum"), 99),
          ),
          Std["seq"](
            CoreLib["call"](
              Std["caller"](),
              "tell",
              "Room numbers in the East Wing are 51-99.",
            ),
            Std["set"]("valid", false),
          ),
        ),
      ),
      // Execute if valid
      Std["if"](
        Std["var"]("valid"),
        Std["seq"](
          Std["let"]("createCap", KernelLib["get_capability"]("sys.create")),
          Std["let"]("roomData", Object["obj.new"]()),
          Object["obj.set"](
            Std["var"]("roomData"),
            "name",
            String["str.concat"]("Room ", Std["var"]("roomNum")),
          ),
          Object["obj.set"](Std["var"]("roomData"), "kind", "ROOM"),

          Object["obj.set"](
            Std["var"]("roomData"),
            "description",
            "A standard hotel room.",
          ),
          Object["obj.set"](
            Std["var"]("roomData"),
            "lobby_id",
            Object["obj.get"](Std["this"](), "id"),
          ), // Return to THIS wing
          Std["let"](
            "roomId",
            CoreLib["create"](Std["var"]("createCap"), Std["var"]("roomData")),
          ),
          Std["let"]("roomFilter", Object["obj.new"]()),
          Object["obj.set"](
            Std["var"]("roomFilter"),
            "target_id",
            Std["var"]("roomId"),
          ),
          CoreLib["set_prototype"](
            KernelLib["get_capability"](
              "entity.control",
              Std["var"]("roomFilter"),
            ),
            CoreLib["entity"](Std["var"]("roomId")),
            hotelRoomProtoId,
          ),
          // Furnish the room
          Std["let"]("bedData", Object["obj.new"]()),
          Object["obj.set"](Std["var"]("bedData"), "name", "Bed"),
          Object["obj.set"](Std["var"]("bedData"), "kind", "ITEM"),
          Object["obj.set"](
            Std["var"]("bedData"),
            "location",
            Std["var"]("roomId"),
          ),
          Std["let"](
            "bedId",
            CoreLib["create"](Std["var"]("createCap"), Std["var"]("bedData")),
          ),
          Std["let"]("bedFilter", Object["obj.new"]()),
          Object["obj.set"](
            Std["var"]("bedFilter"),
            "target_id",
            Std["var"]("bedId"),
          ),
          CoreLib["set_prototype"](
            KernelLib["get_capability"](
              "entity.control",
              Std["var"]("bedFilter"),
            ),
            CoreLib["entity"](Std["var"]("bedId")),
            bedProtoId,
          ),
          Std["let"]("lampData", Object["obj.new"]()),
          Object["obj.set"](Std["var"]("lampData"), "name", "Lamp"),
          Object["obj.set"](Std["var"]("lampData"), "kind", "ITEM"),
          Object["obj.set"](
            Std["var"]("lampData"),
            "location",
            Std["var"]("roomId"),
          ),
          Std["let"](
            "lampId",
            CoreLib["create"](Std["var"]("createCap"), Std["var"]("lampData")),
          ),
          Std["let"]("lampFilter", Object["obj.new"]()),
          Object["obj.set"](
            Std["var"]("lampFilter"),
            "target_id",
            Std["var"]("lampId"),
          ),
          CoreLib["set_prototype"](
            KernelLib["get_capability"](
              "entity.control",
              Std["var"]("lampFilter"),
            ),
            CoreLib["entity"](Std["var"]("lampId")),
            lampProtoId,
          ),
          Std["let"]("chairData", Object["obj.new"]()),
          Object["obj.set"](Std["var"]("chairData"), "name", "Chair"),
          Object["obj.set"](Std["var"]("chairData"), "kind", "ITEM"),
          Object["obj.set"](
            Std["var"]("chairData"),
            "location",
            Std["var"]("roomId"),
          ),
          Std["let"](
            "chairId",
            CoreLib["create"](Std["var"]("createCap"), Std["var"]("chairData")),
          ),
          Std["let"]("chairFilter", Object["obj.new"]()),
          Object["obj.set"](
            Std["var"]("chairFilter"),
            "target_id",
            Std["var"]("chairId"),
          ),
          CoreLib["set_prototype"](
            KernelLib["get_capability"](
              "entity.control",
              Std["var"]("chairFilter"),
            ),
            CoreLib["entity"](Std["var"]("chairId")),
            chairProtoId,
          ),

          // Update Room Contents
          Std["let"]("room", CoreLib["entity"](Std["var"]("roomId"))),
          Std["let"]("contents", List["list.new"]()),
          List["list.push"](Std["var"]("contents"), Std["var"]("bedId")),
          List["list.push"](Std["var"]("contents"), Std["var"]("lampId")),
          List["list.push"](Std["var"]("contents"), Std["var"]("chairId")),
          Object["obj.set"](
            Std["var"]("room"),
            "contents",
            Std["var"]("contents"),
          ),
          CoreLib["set_entity"](
            KernelLib["get_capability"](
              "entity.control",
              Std["var"]("roomFilter"),
            ),
            Std["var"]("room"),
          ),

          KernelLib["give_capability"](
            KernelLib["get_capability"](
              "entity.control",
              Std["var"]("roomFilter"),
            ),
            CoreLib["entity"](Std["var"]("roomId")),
          ),

          CoreLib["call"](Std["caller"](), "move", Std["var"]("roomId")),
          CoreLib["call"](
            Std["caller"](),
            "tell",
            String["str.concat"]("You enter Room ", Std["var"]("roomNum"), "."),
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
    Std["seq"](
      Std["let"]("msg", Std["arg"](0)),
      Std["let"]("speakerId", Std["arg"](1)),
      // Simple heuristics
      Std["if"](
        String["str.includes"](String["str.lower"](Std["var"]("msg")), "room"),
        CoreLib["call"](
          Std["caller"](),
          "say",
          "We have lovely rooms available on floors 1-100. Just use the elevator!",
        ),
      ),
      Std["if"](
        String["str.includes"](String["str.lower"](Std["var"]("msg")), "hello"),
        CoreLib["call"](
          Std["caller"](),
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
    Std["seq"](
      Std["let"]("msg", Std["arg"](0)),
      Std["let"]("type", Std["arg"](2)),
      Std["if"](
        BooleanLib["=="](Std["var"]("type"), "tell"),
        CoreLib["call"](
          Std["caller"](),
          "say",
          String["str.concat"]("Golem echoes: ", Std["var"]("msg")),
        ),
      ),
    ),
  );
}
