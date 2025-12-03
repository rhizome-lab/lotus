import {
  MathLib as Math,
  StringLib as Str,
  ListLib as List,
  TimeLib as Time,
  ObjectLib as Object,
  StdLib as Std,
  BooleanLib as Boolean,
} from "@viwo/scripting";
import * as Core from "./runtime/lib/core";
import * as Kernel from "./runtime/lib/kernel";
import { db } from "./db";
import { createEntity, addVerb, updateEntity, getEntity, createCapability } from "./repo";
import { seedItems } from "./seeds/items";
import { seedHotel } from "./seeds/hotel";

export function seed() {
  // Check for any row at all.
  const root = db.query("SELECT id FROM entities").get();
  if (root != null) {
    console.log("Database already seeded.");
    return;
  }

  console.log("Seeding database...");

  // 1. Create The Void (Root Zone)
  const voidId = createEntity({
    name: "The Void",
    description: "An endless expanse of nothingness.",
  });

  // 2. Create Entity Base
  const entityBaseId = createEntity({
    name: "Entity Base",
    description: "The base of all things.",
    location: voidId,
  });

  // 3. Create System Entity
  const systemId = createEntity({
    name: "System",
    description: "The system root object.",
    location: voidId,
  });

  // Grant System capabilities
  createCapability(systemId, "sys.mint", { namespace: "*" });
  createCapability(systemId, "sys.create", {});
  createCapability(systemId, "sys.sudo", {});
  createCapability(systemId, "entity.control", { "*": true });

  // 4. Create Discord Bot Entity
  const botId = createEntity({
    name: "Discord Bot",
    description: "The bridge to Discord.",
    location: voidId,
  });

  createCapability(botId, "sys.sudo", {});

  addVerb(
    botId,
    "sudo",
    Core["sudo"](
      Kernel["get_capability"]("sys.sudo"),
      Core["entity"](Std["arg"](0)),
      Std["arg"](1),
      Std["arg"](2),
    ),
  );

  addVerb(
    systemId,
    "get_available_verbs",
    Std["seq"](
      Std["let"]("player", Std["arg"](0)),
      Std["let"]("verbs", List["list.new"]()),
      Std["let"]("seen", Object["obj.new"]()),

      Std["let"](
        "addVerbs",
        Std["lambda"](
          ["entityId"],
          Std["seq"](
            Std["let"]("entityVerbs", Core["verbs"](Core["entity"](Std["var"]("entityId")))),
            Std["for"](
              "v",
              Std["var"]("entityVerbs"),
              Std["seq"](
                Std["let"](
                  "key",
                  Str["str.concat"](
                    Object["obj.get"](Std["var"]("v"), "name"),
                    ":",
                    Std["var"]("entityId"),
                  ),
                ),
                Std["if"](
                  Boolean["not"](Object["obj.has"](Std["var"]("seen"), Std["var"]("key"))),
                  Std["seq"](
                    Object["obj.set"](Std["var"]("seen"), Std["var"]("key"), true),
                    Object["obj.set"](Std["var"]("v"), "source", Std["var"]("entityId")),
                    List["list.push"](Std["var"]("verbs"), Std["var"]("v")),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),

      // 1. Player verbs
      Std["apply"](Std["var"]("addVerbs"), Object["obj.get"](Std["var"]("player"), "id")),

      // 2. Room verbs
      Std["let"]("locationId", Object["obj.get"](Std["var"]("player"), "location")),
      Std["if"](
        Std["var"]("locationId"),
        Std["seq"](
          Std["apply"](Std["var"]("addVerbs"), Std["var"]("locationId")),

          // 3. Items in Room
          Std["let"]("room", Core["entity"](Std["var"]("locationId"))),
          Std["let"](
            "contents",
            Object["obj.get"](Std["var"]("room"), "contents", List["list.new"]()),
          ),
          Std["for"](
            "itemId",
            Std["var"]("contents"),
            Std["apply"](Std["var"]("addVerbs"), Std["var"]("itemId")),
          ),
        ),
      ),

      // 4. Inventory verbs
      Std["let"](
        "inventory",
        Object["obj.get"](Std["var"]("player"), "contents", List["list.new"]()),
      ),
      Std["for"](
        "itemId",
        Std["var"]("inventory"),
        Std["apply"](Std["var"]("addVerbs"), Std["var"]("itemId")),
      ),

      Std["var"]("verbs"),
    ),
  );

  addVerb(
    entityBaseId,
    "find",
    Std["seq"](
      Std["let"]("query", Std["arg"](0)),
      Std["let"]("locationId", Object["obj.get"](Std["caller"](), "location")),
      Std["let"]("location", Core["entity"](Std["var"]("locationId"))),
      // Search contents only
      List["list.find"](
        Object["obj.get"](Std["var"]("location"), "contents", List["list.new"]()),
        Std["lambda"](
          ["id"],
          Std["seq"](
            Std["let"]("props", Core["resolve_props"](Core["entity"](Std["var"]("id")))),
            Boolean["=="](Object["obj.get"](Std["var"]("props"), "name"), Std["var"]("query")),
          ),
        ),
      ),
    ),
  );

  addVerb(
    entityBaseId,
    "find_exit",
    Std["seq"](
      Std["let"]("query", Std["arg"](0)),
      Std["let"]("locationId", Object["obj.get"](Std["caller"](), "location")),
      Std["let"]("location", Core["entity"](Std["var"]("locationId"))),
      // Search exits
      List["list.find"](
        Object["obj.get"](Std["var"]("location"), "exits"),
        Std["lambda"](
          ["id"],
          Std["seq"](
            Std["let"]("props", Core["resolve_props"](Core["entity"](Std["var"]("id")))),
            Boolean["or"](
              Boolean["=="](Object["obj.get"](Std["var"]("props"), "name"), Std["var"]("query")),
              Boolean["=="](
                Object["obj.get"](Std["var"]("props"), "direction"),
                Std["var"]("query"),
              ),
            ),
          ),
        ),
      ),
    ),
  );

  addVerb(
    entityBaseId,
    "on_enter",
    Std["seq"](
      Std["let"]("mover", Std["arg"](0)),
      Std["let"](
        "cap",
        Kernel["get_capability"](
          "entity.control",
          Object["obj.new"](["target_id", Object["obj.get"](Std["this"](), "id")]),
        ),
      ),
      Std["if"](
        Std["var"]("cap"),
        Std["seq"](
          Std["let"]("contents", Object["obj.get"](Std["this"](), "contents", List["list.new"]())),
          List["list.push"](Std["var"]("contents"), Object["obj.get"](Std["var"]("mover"), "id")),
          Core["set_entity"](
            Std["var"]("cap"),
            Object["obj.set"](Std["this"](), "contents", Std["var"]("contents")),
          ),
        ),
        Std["send"]("message", "The room refuses you."),
      ),
    ),
  );

  addVerb(
    entityBaseId,
    "on_leave",
    Std["seq"](
      Std["let"]("mover", Std["arg"](0)),
      Std["let"](
        "cap",
        Kernel["get_capability"](
          "entity.control",
          Object["obj.new"](["target_id", Object["obj.get"](Std["this"](), "id")]),
        ),
      ),
      Std["if"](
        Std["var"]("cap"),
        Std["seq"](
          Std["let"]("contents", Object["obj.get"](Std["this"](), "contents", List["list.new"]())),
          Std["let"](
            "newContents",
            List["list.filter"](
              Std["var"]("contents"),
              Std["lambda"](
                ["id"],
                Boolean["!="](Std["var"]("id"), Object["obj.get"](Std["var"]("mover"), "id")),
              ),
            ),
          ),
          Core["set_entity"](
            Std["var"]("cap"),
            Object["obj.set"](Std["this"](), "contents", Std["var"]("newContents")),
          ),
        ),
        Std["send"]("message", "The room refuses to let you go."),
      ),
    ),
  );

  addVerb(
    entityBaseId,
    "move",
    Std["seq"](
      Std["let"]("arg", Std["arg"](0)),
      Std["if"](
        Boolean["not"](Std["var"]("arg")),
        Std["send"]("message", "Where do you want to go?"),
        Std["seq"](
          Std["let"]("destId", null),
          Std["if"](
            Boolean["=="](Std["typeof"](Std["var"]("arg")), "number"),
            Std["let"]("destId", Std["var"]("arg")),
            Std["seq"](
              Std["let"]("exitId", Core["call"](Std["this"](), "find_exit", Std["var"]("arg"))),
              Std["if"](
                Std["var"]("exitId"),
                Std["let"](
                  "destId",
                  Object["obj.get"](
                    Core["resolve_props"](Core["entity"](Std["var"]("exitId"))),
                    "destination",
                  ),
                ),
              ),
            ),
          ),
          Std["if"](
            Std["var"]("destId"),
            Std["seq"](
              Std["let"]("mover", Std["caller"]()),
              // Recursive Check
              Std["let"]("checkId", Std["var"]("destId")),
              Std["let"]("isRecursive", false),
              Std["while"](
                Std["var"]("checkId"),
                Std["seq"](
                  Std["if"](
                    Boolean["=="](
                      Std["var"]("checkId"),
                      Object["obj.get"](Std["var"]("mover"), "id"),
                    ),
                    Std["seq"](
                      Std["set"]("isRecursive", true),
                      Std["set"]("checkId", null), // Break
                    ),
                    // Step up
                    Std["set"](
                      "checkId",
                      Object["obj.get"](Core["entity"](Std["var"]("checkId")), "location", null),
                    ),
                  ),
                ),
              ),
              Std["if"](
                Std["var"]("isRecursive"),
                Std["send"]("message", "You can't put something inside itself."),
                Std["seq"](
                  Std["let"]("oldLocId", Object["obj.get"](Std["var"]("mover"), "location")),
                  Std["let"]("oldLoc", Core["entity"](Std["var"]("oldLocId"))),
                  Std["let"]("newLoc", Core["entity"](Std["var"]("destId"))),

                  // Leave old loc
                  Core["call"](Std["var"]("oldLoc"), "on_leave", Std["var"]("mover")),

                  // Enter new loc
                  Core["call"](Std["var"]("newLoc"), "on_enter", Std["var"]("mover")),

                  // Update mover location (needs self control)
                  Std["let"](
                    "selfCap",
                    Kernel["get_capability"](
                      "entity.control",
                      Object["obj.new"]([
                        "target_id",
                        Object["obj.get"](Std["var"]("mover"), "id"),
                      ]),
                    ),
                  ),

                  Std["if"](
                    Std["var"]("selfCap"),
                    Std["seq"](
                      Object["obj.set"](Std["var"]("mover"), "location", Std["var"]("destId")),
                      Core["set_entity"](Std["var"]("selfCap"), Std["var"]("mover")),
                    ),
                    Std["send"]("message", "You cannot move yourself."),
                  ),

                  Std["send"]("room_id", Object["obj.new"](["roomId", Std["var"]("destId")])),
                  Core["call"](Std["caller"](), "look"),
                ),
              ),
            ),
            Std["send"]("message", "That way leads nowhere."),
          ),
        ),
      ),
    ),
  );

  addVerb(entityBaseId, "say", Std["send"]("message", "Say is not yet implemented."));

  addVerb(
    entityBaseId,
    "tell",
    Std["seq"](Std["let"]("msg", Std["arg"](0)), Std["send"]("message", Std["var"]("msg"))),
  );

  // 3. Create Humanoid Base
  const humanoidBaseId = createEntity(
    {
      name: "Humanoid Base",
      description: "A humanoid creature.",
      body_type: "humanoid",
      // Slots are just definitions of where things can go
      slots: [
        // Head & Neck
        "head",
        "face",
        "ears",
        "neck",
        // Torso & Back
        "torso",
        "back",
        "waist",
        // Arms
        "l_shoulder",
        "r_shoulder",
        "l_arm",
        "r_arm",
        "l_wrist",
        "r_wrist",
        "l_hand",
        "r_hand",
        // Fingers (Rings)
        "l_finger_thumb",
        "l_finger_index",
        "l_finger_middle",
        "l_finger_ring",
        "l_finger_pinky",
        "r_finger_thumb",
        "r_finger_index",
        "r_finger_middle",
        "r_finger_ring",
        "r_finger_pinky",
        // Legs
        "l_leg",
        "r_leg",
        "l_ankle",
        "r_ankle",
        // Feet
        "l_foot",
        "r_foot",
        "l_foot",
      ],
    },
    entityBaseId,
  );

  // 4. Create Player Prototype
  const playerBaseId = createEntity(
    {
      name: "Player Base",
      description: "A generic adventurer.",
    },
    humanoidBaseId,
  );

  // Add verbs to Player Base

  addVerb(
    playerBaseId,
    "look",
    Std["if"](
      List["list.empty"](Std["args"]()),
      Std["seq"](
        Std["let"](
          "room",
          Core["resolve_props"](Core["entity"](Object["obj.get"](Std["caller"](), "location"))),
        ),
        Std["let"](
          "contents",
          Object["obj.get"](Std["var"]("room"), "contents", List["list.new"]()),
        ),
        Std["let"]("exits", Object["obj.get"](Std["var"]("room"), "exits", List["list.new"]())),
        Std["let"](
          "resolvedContents",
          List["list.map"](
            Std["var"]("contents"),
            Std["lambda"](["id"], Core["resolve_props"](Core["entity"](Std["var"]("id")))),
          ),
        ),
        Std["let"](
          "resolvedExits",
          List["list.map"](
            Std["var"]("exits"),
            Std["lambda"](["id"], Core["resolve_props"](Core["entity"](Std["var"]("id")))),
          ),
        ),
        Std["send"](
          "update",
          Object["obj.new"]([
            "entities",
            List["list.concat"](
              List["list.new"](Std["var"]("room")),
              List["list.concat"](Std["var"]("resolvedContents"), Std["var"]("resolvedExits")),
            ),
          ]),
        ),
      ),
      Std["seq"](
        Std["let"]("targetName", Std["arg"](0)),
        Std["let"]("targetId", Core["call"](Std["caller"](), "find", Std["var"]("targetName"))),
        Std["if"](
          Std["var"]("targetId"),
          Std["seq"](
            Std["let"]("target", Core["resolve_props"](Core["entity"](Std["var"]("targetId")))),
            Std["send"](
              "update",
              Object["obj.new"](["entities", List["list.new"](Std["var"]("target"))]),
            ),
          ),
          Std["send"]("message", "You don't see that here."),
        ),
      ),
    ),
  );

  addVerb(
    playerBaseId,
    "inventory",
    Std["seq"](
      Std["let"]("player", Core["resolve_props"](Std["caller"]())),
      Std["let"](
        "contents",
        Object["obj.get"](Std["var"]("player"), "contents", List["list.new"]()),
      ),
      Std["let"](
        "resolvedItems",
        List["list.map"](
          Std["var"]("contents"),
          Std["lambda"](["id"], Core["resolve_props"](Core["entity"](Std["var"]("id")))),
        ),
      ),
      Std["let"](
        "finalList",
        List["list.concat"](List["list.new"](Std["var"]("player")), Std["var"]("resolvedItems")),
      ),
      Std["send"]("update", Object["obj.new"](["entities", Std["var"]("finalList")])),
    ),
  );

  addVerb(
    playerBaseId,
    "whoami",
    Std["send"](
      "player_id",
      Object["obj.new"](["playerId", Object["obj.get"](Std["caller"](), "id")]),
    ),
  );

  addVerb(
    playerBaseId,
    "dig",
    Std["seq"](
      Std["let"]("direction", Std["arg"](0)),
      Std["let"]("roomName", Str["str.join"](List["list.slice"](Std["args"](), 1), " ")),
      Std["if"](
        Boolean["not"](Std["var"]("direction")),
        Std["send"]("message", "Where do you want to dig?"),
        Std["seq"](
          // Get Capabilities
          Std["let"]("createCap", Kernel["get_capability"]("sys.create")),
          Std["let"](
            "controlCap",
            Kernel["get_capability"](
              "entity.control",
              Object["obj.new"](["target_id", Object["obj.get"](Std["caller"](), "location")]),
            ),
          ),
          // Try wildcard if specific control cap missing
          Std["if"](
            Boolean["not"](Std["var"]("controlCap")),
            Std["set"](
              "controlCap",
              Kernel["get_capability"]("entity.control", Object["obj.new"](["*", true])),
            ),
          ),

          Std["if"](
            Boolean["and"](Std["var"]("createCap"), Std["var"]("controlCap")),
            Std["seq"](
              Std["let"]("newRoomData", Object["obj.new"]()),
              Object["obj.set"](Std["var"]("newRoomData"), "name", Std["var"]("roomName")),
              Std["let"](
                "newRoomId",
                Core["create"](Std["var"]("createCap"), Std["var"]("newRoomData")),
              ),

              // Create exit
              Std["let"]("exitData", Object["obj.new"]()),
              Object["obj.set"](Std["var"]("exitData"), "name", Std["var"]("direction")),
              Object["obj.set"](
                Std["var"]("exitData"),
                "location",
                Object["obj.get"](Std["caller"](), "location"),
              ),
              Object["obj.set"](Std["var"]("exitData"), "direction", Std["var"]("direction")),
              Object["obj.set"](Std["var"]("exitData"), "destination", Std["var"]("newRoomId")),
              Std["let"]("exitId", Core["create"](Std["var"]("createCap"), Std["var"]("exitData"))),
              // Set prototype to Entity Base
              Core["set_prototype"](
                Std["var"]("controlCap"),
                Core["entity"](Std["var"]("newRoomId")),
                entityBaseId,
              ),

              // Update current room exits
              Std["let"](
                "currentRoom",
                Core["entity"](Object["obj.get"](Std["caller"](), "location")),
              ),
              Std["let"](
                "currentExits",
                Object["obj.get"](Std["var"]("currentRoom"), "exits", List["list.new"]()),
              ),
              List["list.push"](Std["var"]("currentExits"), Std["var"]("exitId")),
              Core["set_entity"](
                Std["var"]("controlCap"),
                Object["obj.set"](Std["var"]("currentRoom"), "exits", Std["var"]("currentExits")),
              ),

              // Move player
              Core["call"](Std["caller"](), "move", Std["var"]("direction")),
            ),
            Std["send"]("message", "You do not have permission to dig here."),
          ),
        ),
      ),
    ),
  );

  addVerb(
    playerBaseId,
    "create",
    Std["seq"](
      Std["let"]("name", Std["arg"](0)),
      Std["if"](
        Boolean["not"](Std["var"]("name")),
        Std["send"]("message", "What do you want to create?"),
        Std["seq"](
          // Get Capabilities
          Std["let"]("createCap", Kernel["get_capability"]("sys.create")),
          Std["let"](
            "controlCap",
            Kernel["get_capability"](
              "entity.control",
              Object["obj.new"](["target_id", Object["obj.get"](Std["caller"](), "location")]),
            ),
          ),
          // Try wildcard
          Std["if"](
            Boolean["not"](Std["var"]("controlCap")),
            Std["set"](
              "controlCap",
              Kernel["get_capability"]("entity.control", Object["obj.new"](["*", true])),
            ),
          ),

          Std["if"](
            Boolean["and"](Std["var"]("createCap"), Std["var"]("controlCap")),
            Std["seq"](
              Std["let"]("itemData", Object["obj.new"]()),
              Object["obj.set"](Std["var"]("itemData"), "name", Std["var"]("name")),
              Object["obj.set"](
                Std["var"]("itemData"),
                "location",
                Object["obj.get"](Std["caller"](), "location"),
              ),
              Std["let"]("itemId", Core["create"](Std["var"]("createCap"), Std["var"]("itemData"))),
              // Set prototype to Entity Base
              Core["set_prototype"](
                Std["var"]("controlCap"),
                Core["entity"](Std["var"]("itemId")),
                entityBaseId,
              ),

              // Update room contents
              Std["let"]("room", Core["entity"](Object["obj.get"](Std["caller"](), "location"))),
              Std["let"](
                "contents",
                Object["obj.get"](Std["var"]("room"), "contents", List["list.new"]()),
              ),
              List["list.push"](Std["var"]("contents"), Std["var"]("itemId")),
              Core["set_entity"](
                Std["var"]("controlCap"),
                Object["obj.set"](Std["var"]("room"), "contents", Std["var"]("contents")),
              ),

              Std["send"]("message", Str["str.concat"]("You create ", Std["var"]("name"), ".")),
              Core["call"](Std["caller"](), "look"),
              // Return item ID
              Std["var"]("itemId"),
            ),
            Std["send"]("message", "You do not have permission to create here."),
          ),
        ),
      ),
    ),
  );

  addVerb(
    playerBaseId,
    "set",
    Std["seq"](
      Std["let"]("targetName", Std["arg"](0)),
      Std["let"]("propName", Std["arg"](1)),
      Std["let"]("value", Std["arg"](2)),
      Std["if"](
        Boolean["or"](
          Boolean["not"](Std["var"]("targetName")),
          Boolean["not"](Std["var"]("propName")),
        ),
        Std["send"]("message", "Usage: set <target> <prop> <value>"),
        Std["seq"](
          Std["let"]("targetId", Core["call"](Std["this"](), "find", Std["var"]("targetName"))),
          Std["if"](
            Std["var"]("targetId"),
            Std["seq"](
              Std["seq"](
                // Get Capability
                Std["let"](
                  "controlCap",
                  Kernel["get_capability"](
                    "entity.control",
                    Object["obj.new"](["target_id", Std["var"]("targetId")]),
                  ),
                ),
                Std["if"](
                  Boolean["not"](Std["var"]("controlCap")),
                  Std["set"](
                    "controlCap",
                    Kernel["get_capability"]("entity.control", Object["obj.new"](["*", true])),
                  ),
                ),
                Std["if"](
                  Std["var"]("controlCap"),
                  Std["seq"](
                    Core["set_entity"](
                      Std["var"]("controlCap"),
                      Object["obj.merge"](
                        Core["entity"](Std["var"]("targetId")),
                        Object["obj.new"]([Std["var"]("propName"), Std["var"]("value")]),
                      ),
                    ),
                    Std["send"]("message", "Property set."),
                  ),
                  Std["send"]("message", "You do not have permission to modify this object."),
                ),
              ),
            ),
            Std["send"]("message", "I don't see that here."),
          ),
        ),
      ),
    ),
  );

  // 3. Create a Lobby Room
  const lobbyId = createEntity(
    {
      name: "Lobby",
      location: voidId,
      description: "A cozy lobby with a crackling fireplace.",
    },
    entityBaseId,
  );

  // 4. Create a Test Player
  const playerId = createEntity(
    {
      name: "Guest",
      location: lobbyId,
      description: "A confused looking guest.",
    },
    playerBaseId,
  );

  // 5. Create some furniture (Table)
  const tableId = createEntity({
    name: "Oak Table",
    location: lobbyId,
    description: "A sturdy oak table.",
    slots: ["surface", "under"], // Generalizable slots!
  });

  // 6. Create a Cup ON the table
  createEntity({
    name: "Ceramic Cup",
    location: tableId,
    description: "A chipped ceramic cup.",
    location_detail: "surface", // It's ON the table
  });

  // 7. Create a Backpack
  const backpackId = createEntity({
    name: "Leather Backpack",
    location: playerId,
    description: "A worn leather backpack.",
    slots: ["main", "front_pocket"],
    location_detail: "back", // Worn on back
  });

  // 8. Create a Badge ON the Backpack
  createEntity({
    name: "Scout Badge",
    location: backpackId,
    description: "A merit badge.",
    location_detail: "surface", // Attached to the outside? Or maybe we define a slot for it.
  });

  // Create another room
  const gardenId = createEntity({
    name: "Garden",
    description: "A lush garden with blooming flowers.",
  });

  // Link Lobby and Garden
  const northExitId = createEntity({
    name: "north",
    location: lobbyId,
    direction: "north",
    destination: gardenId,
  });
  const lobby = getEntity(lobbyId)!;
  updateEntity({
    ...lobby,
    exits: [northExitId],
  });

  const southExitId = createEntity({
    name: "south",
    location: gardenId,
    direction: "south",
    destination: lobbyId,
  });
  const garden = getEntity(gardenId)!;
  updateEntity({
    ...garden,
    exits: [southExitId],
  });

  // 9. Create a Gemstore
  const gemstoreId = createEntity({
    name: "Gemstore",
    description: "A glittering shop filled with rare stones and oddities.",
  });

  // Link Lobby and Gemstore
  // Link Lobby and Gemstore
  const eastExitId = createEntity({
    name: "east",
    location: lobbyId,
    direction: "east",
    destination: gemstoreId,
  });
  // Note: We need to append to existing exits if any
  // But here we know Lobby only has north so far (actually we just added it above)
  // Let's do a cleaner way: update Lobby with both exits
  const lobbyExits = [northExitId, eastExitId];
  const lobbyUpdated = getEntity(lobbyId)!;
  updateEntity({
    ...lobbyUpdated,
    exits: lobbyExits,
  });

  const westExitId = createEntity({
    name: "west",
    location: gemstoreId,
    direction: "west",
    destination: lobbyId,
  });
  const gemstore = getEntity(gemstoreId)!;
  updateEntity({
    ...gemstore,
    exits: [westExitId],
  });

  // Items in Gemstore
  createEntity({
    name: "Black Obsidian",
    location: gemstoreId,
    description: "A pitch black stone.",
    adjectives: ["color:black", "effect:shiny", "material:stone", "material:obsidian"],
  });

  createEntity({
    name: "Silver Dagger",
    location: gemstoreId,
    description: "A gleaming silver blade.",
    adjectives: ["color:silver", "material:metal", "material:silver"],
  });

  createEntity({
    name: "Gold Coin",
    location: gemstoreId,
    description: "A heavy gold coin.",
    adjectives: ["color:gold", "weight:heavy", "material:metal", "material:gold"],
  });

  createEntity({
    name: "Platinum Ring",
    location: gemstoreId,
    description: "A precious platinum ring.",
    adjectives: ["color:platinum", "value:precious", "material:metal", "material:platinum"],
  });

  createEntity({
    name: "Radioactive Isotope",
    location: gemstoreId,
    description: "It glows with a sickly light.",
    adjectives: ["effect:radioactive", "effect:glowing"],
  });

  createEntity({
    name: "Electric Blue Potion",
    location: gemstoreId,
    description: "A crackling blue liquid.",
    adjectives: ["color:electric blue", "effect:glowing"],
  });

  createEntity({
    name: "Ethereal Mist",
    location: gemstoreId,
    description: "A swirling white mist.",
    adjectives: ["color:white", "effect:ethereal"],
  });

  createEntity({
    name: "Transparent Cube",
    location: gemstoreId,
    description: "You can barely see it.",
    adjectives: ["effect:transparent", "material:glass"],
  });

  const wigStandId = createEntity({
    name: "Wig Stand",
    location: gemstoreId,
    description: "A stand holding various wigs.",
    slots: ["surface"],
  });

  if (wigStandId) {
    createEntity({
      name: "Auburn Wig",
      location: wigStandId,
      description: "A reddish-brown wig.",
      adjectives: ["color:auburn"],
      location_detail: "surface",
    });

    createEntity({
      name: "Blonde Wig",
      location: wigStandId,
      description: "A bright yellow wig.",
      adjectives: ["color:blonde"],
      location_detail: "surface",
    });

    createEntity({
      name: "Brunette Wig",
      location: wigStandId,
      description: "A dark brown wig.",
      adjectives: ["color:brunette"],
      location_detail: "surface",
    });
  }

  // 10. Create Scripting Test Items (Lobby)

  // Watch Item
  const watchId = createEntity({
    name: "Golden Watch",
    location: lobbyId,
    props: {
      description: "A beautiful golden pocket watch.",
      adjectives: ["color:gold", "material:gold"],
    },
  });

  addVerb(watchId, "tell", Std["send"]("message", Time["time.format"](Time["time.now"](), "time")));

  // Teleporter Item
  const teleporterId = createEntity({
    name: "Teleporter Stone",
    location: lobbyId,
    props: {
      description: "A humming stone that vibrates with energy.",
      destination: gardenId,
      adjectives: ["effect:glowing", "material:stone"],
    },
  });

  addVerb(
    teleporterId,
    "teleport",
    Std["seq"](
      Std["let"]("mover", Std["caller"]()),
      Std["let"]("destId", Object["obj.get"](Std["this"](), "destination")),
      Std["let"]("oldLocId", Object["obj.get"](Std["var"]("mover"), "location")),
      Std["let"]("oldLoc", Core["entity"](Std["var"]("oldLocId"))),
      Std["let"]("newLoc", Core["entity"](Std["var"]("destId"))),
      Core["set_entity"](
        // Update mover
        Object["obj.merge"](
          Std["var"]("mover"),
          Object["obj.new"](["location", Std["var"]("destId")]),
        ),
        // Update old location
        Object["obj.merge"](
          Std["var"]("oldLoc"),
          Object["obj.new"]([
            "contents",
            List["list.filter"](
              Object["obj.get"](Std["var"]("oldLoc"), "contents"),
              Std["lambda"](
                ["id"],
                Boolean["!="](Std["var"]("id"), Object["obj.get"](Std["var"]("mover"), "id")),
              ),
            ),
          ]),
        ),
        // Update new location
        Object["obj.merge"](
          Std["var"]("newLoc"),
          Object["obj.new"]([
            "contents",
            List["list.concat"](
              Object["obj.get"](Std["var"]("newLoc"), "contents"),
              List["list.new"](Object["obj.get"](Std["var"]("mover"), "id")),
            ),
          ]),
        ),
      ),
      Std["send"]("message", "Whoosh! You have been teleported."),
    ),
  );

  // Status Item
  const statusId = createEntity({
    name: "Status Orb",
    location: lobbyId,
    props: {
      description: "A crystal orb that shows world statistics.",
      adjectives: ["effect:transparent", "material:crystal"],
    },
  });

  addVerb(
    statusId,
    "check",
    // world.entities missing
    Std["send"]("message", "Status check disabled."),
  );

  console.log("Seeding complete!");

  // Color Library
  const colorLibId = createEntity({
    name: "Color Library", // Or a system object
    location: voidId, // Hidden
    props: {
      colors: ["red", "green", "blue", "purple", "orange", "yellow", "cyan", "magenta"],
    },
  });

  addVerb(
    colorLibId,
    "random_color",
    List["list.get"](
      Object["obj.get"](Std["this"](), "colors"),
      // random(0, len-1)
      Math["random"](0, Math["-"](List["list.len"](Object["obj.get"](Std["this"](), "colors")), 1)),
    ),
  );

  // Mood Ring
  const moodRingId = createEntity({
    name: "Mood Ring",
    location: lobbyId,
    props: {
      description: "A ring that changes color based on... something.",
      adjectives: ["color:grey", "material:silver"],
      color_lib: colorLibId,
    },
  });

  // Verb to update color
  // It calls random_color on the lib, sets its own color adjective, and schedules itself again.
  addVerb(
    moodRingId,
    "update_color",
    Std["seq"](
      Std["let"]("libId", Object["obj.get"](Std["this"](), "color_lib")),
      Std["let"]("newColor", Core["call"](Std["var"]("libId"), "random_color")),
      Core["set_entity"](
        Object["obj.set"](
          Std["this"](),
          "adjectives",
          List["list.new"](Str["str.concat"]("color:", Std["var"]("newColor")), "material:silver"),
        ),
      ),
      Core["schedule"]("update_color", List["list.new"](), 5000),
    ),
  );

  // Kickoff
  // We need a way to start it. Let's add a 'touch' verb to start it.
  addVerb(moodRingId, "touch", Core["schedule"]("update_color", List["list.new"](), 0));

  // --- Advanced Items ---

  // 1. Dynamic Mood Ring (Getter)
  const dynamicRingId = createEntity({
    name: "Dynamic Mood Ring",
    location: lobbyId,
    props: {
      description: "A ring that shimmers with the current second.",
      // No static adjectives needed if we use getter
    },
  });

  // get_adjectives verb
  // Returns a list of adjectives.
  // We'll use the current second to determine color.
  addVerb(
    dynamicRingId,
    "get_adjectives",
    List["list.new"](
      Str["str.concat"](
        "color:hsl(",
        Str["str.concat"](
          Math["*"](Time["time.to_timestamp"](Time["time.now"]()), 0.1),
          ", 100%, 50%)",
        ),
      ), // Rotating hue
      "material:gold",
    ),
  );

  // 2. Special Watch (Local Broadcast)
  const specialWatchId = createEntity({
    name: "Broadcasting Watch",
    location: lobbyId,
    props: { description: "A watch that announces the time to you." },
  });

  addVerb(
    specialWatchId,
    "tick",
    Std["seq"](
      // broadcast missing
      Std["send"](
        "message",
        Str["str.concat"]("Tick Tock: ", Time["time.format"](Time["time.now"](), "time")),
      ),
      Core["schedule"]("tick", List["list.new"](), 10000),
    ),
  );
  addVerb(specialWatchId, "start", Core["schedule"]("tick", List["list.new"](), 0));

  // 3. Clock (Room Broadcast)
  // Watch broadcasts to holder (Player), Clock broadcasts to Room.

  const clockId = createEntity({
    name: "Grandfather Clock",
    location: lobbyId,
    props: { description: "A loud clock." },
  });

  addVerb(
    clockId,
    "tick",
    Std["seq"](
      // broadcast missing
      Std["send"](
        "message",
        Str["str.concat"]("BONG! It is ", Time["time.format"](Time["time.now"](), "time")),
      ),
      Core["schedule"]("tick", List["list.new"](), 15000),
    ),
  );
  addVerb(clockId, "start", Core["schedule"]("tick", List["list.new"](), 0));

  // 4. Clock Tower (Global Broadcast)
  const towerId = createEntity({
    name: "Clock Tower", // Or ROOM/BUILDING
    location: voidId, // Hidden, or visible somewhere
    props: { description: "The source of time." },
  });

  addVerb(
    towerId,
    "toll",
    Std["seq"](
      // broadcast missing
      Std["send"](
        "message",
        Str["str.concat"](
          "The Clock Tower tolls: ",
          Time["time.format"](Time["time.now"](), "time"),
        ),
      ),
      Core["schedule"]("toll", List["list.new"](), 60000),
    ),
  );
  addVerb(towerId, "start", Core["schedule"]("toll", List["list.new"](), 0));

  // 5. Mailbox
  // A prototype for mailboxes.
  const mailboxProtoId = createEntity({
    name: "Mailbox Prototype",
    props: {
      description: "A secure mailbox.",
      permissions: {
        view: ["owner"], // Only owner can see contents
        enter: [], // No one can manually put things in (must use deposit)
      },
    },
  });

  addVerb(
    mailboxProtoId,
    "deposit",
    // give missing
    Std["send"]("message", "Deposit disabled."),
    { call: "public" },
  ); // Anyone can call deposit

  // Give the player a mailbox
  createEntity(
    {
      name: "My Mailbox",
      location: playerId, // Carried by player
      owner_id: playerId,
    },
    mailboxProtoId,
  );
  // 5. Create Items
  seedItems(voidId);

  // 6. Create Hotel
  seedHotel(voidId, voidId, entityBaseId);

  console.log("Database seeded successfully.");
}
