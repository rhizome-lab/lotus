import { createEntity, addVerb, updateEntity, getEntity } from "./repo";
import { db } from "./db";
import * as Core from "./scripting/lib/core";
import * as List from "./scripting/lib/list";
import * as Str from "./scripting/lib/string";
import * as Time from "./scripting/lib/time";
import * as Object from "./scripting/lib/object";

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

  addVerb(
    entityBaseId,
    "find",
    Core["seq"](
      Core["let"]("query", Core["arg"](0)),
      Core["let"](
        "locationId",
        Object["obj.get"](Core["caller"](), "location"),
      ),
      Core["let"]("location", Core["entity"](Core["var"]("locationId"))),
      // Search contents only
      List["list.find"](
        Object["obj.get"](Core["var"]("location"), "contents"),
        Core["lambda"](
          ["id"],
          Core["seq"](
            Core["let"](
              "props",
              Core["resolve_props"](Core["entity"](Core["var"]("id"))),
            ),
            Core["=="](
              Object["obj.get"](Core["var"]("props"), "name"),
              Core["var"]("query"),
            ),
          ),
        ),
      ),
    ),
  );

  addVerb(
    entityBaseId,
    "find_exit",
    Core["seq"](
      Core["let"]("query", Core["arg"](0)),
      Core["let"](
        "locationId",
        Object["obj.get"](Core["caller"](), "location"),
      ),
      Core["let"]("location", Core["entity"](Core["var"]("locationId"))),
      // Search exits
      List["list.find"](
        Object["obj.get"](Core["var"]("location"), "exits"),
        Core["lambda"](
          ["id"],
          Core["seq"](
            Core["let"](
              "props",
              Core["resolve_props"](Core["entity"](Core["var"]("id"))),
            ),
            Core["or"](
              Core["=="](
                Object["obj.get"](Core["var"]("props"), "name"),
                Core["var"]("query"),
              ),
              Core["=="](
                Object["obj.get"](Core["var"]("props"), "direction"),
                Core["var"]("query"),
              ),
            ),
          ),
        ),
      ),
    ),
  );

  addVerb(
    entityBaseId,
    "move",
    Core["seq"](
      Core["let"]("direction", Core["arg"](0)),
      Core["if"](
        Core["not"](Core["var"]("direction")),
        Core["send"]("Where do you want to go?"),
        Core["seq"](
          Core["let"](
            "exitId",
            Core["call"](Core["this"](), "find_exit", Core["var"]("direction")),
          ),
          Core["if"](
            Core["var"]("exitId"),
            Core["seq"](
              Core["let"](
                "destId",
                Object["obj.get"](
                  Core["resolve_props"](Core["entity"](Core["var"]("exitId"))),
                  "destination",
                ),
              ),
              Core["if"](
                Core["var"]("destId"),
                Core["seq"](
                  Core["let"]("mover", Core["caller"]()),
                  Core["let"](
                    "oldLocId",
                    Object["obj.get"](Core["var"]("mover"), "location"),
                  ),
                  Core["let"](
                    "oldLoc",
                    Core["entity"](Core["var"]("oldLocId")),
                  ),
                  Core["let"]("newLoc", Core["entity"](Core["var"]("destId"))),
                  Core["set_entity"](
                    // Update mover
                    Object["obj.merge"](
                      Core["var"]("mover"),
                      Object["obj.new"]("location", Core["var"]("destId")),
                    ),
                    // Update old location
                    Object["obj.merge"](
                      Core["var"]("oldLoc"),
                      Object["obj.new"](
                        "contents",
                        List["list.filter"](
                          Object["obj.get"](Core["var"]("oldLoc"), "contents"),
                          Core["lambda"](
                            ["id"],
                            Core["!="](
                              Core["var"]("id"),
                              Object["obj.get"](Core["var"]("mover"), "id"),
                            ),
                          ),
                        ),
                      ),
                    ),
                    // Update new location
                    Object["obj.merge"](
                      Core["var"]("newLoc"),
                      Object["obj.new"](
                        "contents",
                        List["list.concat"](
                          Object["obj.get"](Core["var"]("newLoc"), "contents"),
                          List["list.new"](
                            Object["obj.get"](Core["var"]("mover"), "id"),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                Core["send"]("That way leads nowhere."),
              ),
            ),
            Core["send"]("You can't go that way."),
          ),
        ),
      ),
    ),
  );

  addVerb(entityBaseId, "say", Core["send"]("Say is not yet implemented."));

  addVerb(entityBaseId, "tell", Core["send"]("Tell is not yet implemented."));

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
    Core["if"](
      List["list.empty"](Core["args"]()),
      Core["seq"](
        Core["let"](
          "room",
          Core["resolve_props"](
            Core["entity"](Object["obj.get"](Core["caller"](), "location")),
          ),
        ),
        Core["let"](
          "contents",
          Core["or"](
            Object["obj.get"](Core["var"]("room"), "contents"),
            List["list.new"](),
          ),
        ),
        Core["let"](
          "exits",
          Core["or"](
            Object["obj.get"](Core["var"]("room"), "exits"),
            List["list.new"](),
          ),
        ),
        Core["let"](
          "resolvedContents",
          List["list.map"](
            Core["var"]("contents"),
            Core["lambda"](
              ["id"],
              Core["resolve_props"](Core["entity"](Core["var"]("id"))),
            ),
          ),
        ),
        Core["let"](
          "resolvedExits",
          List["list.map"](
            Core["var"]("exits"),
            Core["lambda"](
              ["id"],
              Core["resolve_props"](Core["entity"](Core["var"]("id"))),
            ),
          ),
        ),
        Object["obj.merge"](
          Core["var"]("room"),
          Object["obj.new"](
            "contents",
            Core["var"]("resolvedContents"),
            "exits",
            Core["var"]("resolvedExits"),
          ),
        ),
      ),
      Core["seq"](
        // world.find is missing.
        // Core["letOp"]("targetId", ["world.find", ["arg", 0]]),
        // Commenting out the else branch logic that relies on world.find
        Core["send"]("You don't see that here."),
      ),
    ),
  );

  addVerb(
    playerBaseId,
    "inventory",
    Core["seq"](
      List["list.map"](
        Object["obj.get"](Core["caller"](), "contents"),
        Core["lambda"](
          ["id"],
          Core["resolve_props"](Core["entity"](Core["var"]("id"))),
        ),
      ),
    ),
  );

  addVerb(
    playerBaseId,
    "dig",
    Core["seq"](
      Core["let"]("direction", Core["arg"](0)),
      Core["let"](
        "roomName",
        Str["str.join"](List["list.slice"](Core["args"](), 1), " "),
      ),
      Core["if"](
        Core["not"](Core["var"]("direction")),
        Core["send"]("Where do you want to dig?"),
        Core["seq"](
          // sys.can_edit missing
          Core["send"]("Digging disabled."),
        ),
      ),
    ),
  );

  addVerb(
    playerBaseId,
    "create",
    Core["seq"](
      Core["let"]("name", Core["arg"](0)),
      Core["if"](
        Core["not"](Core["var"]("name")),
        Core["send"]("What do you want to create?"),
        Core["seq"](
          // sys.can_edit missing
          Core["send"]("Creation disabled."),
        ),
      ),
    ),
  );

  addVerb(
    playerBaseId,
    "set",
    Core["seq"](
      Core["let"]("targetName", Core["arg"](0)),
      Core["let"]("propName", Core["arg"](1)),
      Core["let"]("value", Core["arg"](2)),
      Core["if"](
        Core["or"](
          Core["not"](Core["var"]("targetName")),
          Core["not"](Core["var"]("propName")),
        ),
        Core["send"]("Usage: set <target> <prop> <value>"),
        Core["seq"](
          // world.find missing
          Core["send"]("Set disabled."),
        ),
      ),
    ),
  );

  // 3. Create a Lobby Room
  const lobbyId = createEntity({
    name: "Lobby",
    location: voidId,
    description: "A cozy lobby with a crackling fireplace.",
  });

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
    adjectives: [
      "color:black",
      "effect:shiny",
      "material:stone",
      "material:obsidian",
    ],
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
    adjectives: [
      "color:gold",
      "weight:heavy",
      "material:metal",
      "material:gold",
    ],
  });

  createEntity({
    name: "Platinum Ring",
    location: gemstoreId,
    description: "A precious platinum ring.",
    adjectives: [
      "color:platinum",
      "value:precious",
      "material:metal",
      "material:platinum",
    ],
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

  addVerb(
    watchId,
    "tell",
    Core["send"](Time["time.format"](Time["time.now"](), "time")),
  );

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
    Core["seq"](
      Core["let"]("mover", Core["caller"]()),
      Core["let"]("destId", Object["obj.get"](Core["this"](), "destination")),
      Core["let"](
        "oldLocId",
        Object["obj.get"](Core["var"]("mover"), "location"),
      ),
      Core["let"]("oldLoc", Core["entity"](Core["var"]("oldLocId"))),
      Core["let"]("newLoc", Core["entity"](Core["var"]("destId"))),
      Core["set_entity"](
        // Update mover
        Object["obj.merge"](
          Core["var"]("mover"),
          Object["obj.new"]("location", Core["var"]("destId")),
        ),
        // Update old location
        Object["obj.merge"](
          Core["var"]("oldLoc"),
          Object["obj.new"](
            "contents",
            List["list.filter"](
              Object["obj.get"](Core["var"]("oldLoc"), "contents"),
              Core["lambda"](
                ["id"],
                Core["!="](
                  Core["var"]("id"),
                  Object["obj.get"](Core["var"]("mover"), "id"),
                ),
              ),
            ),
          ),
        ),
        // Update new location
        Object["obj.merge"](
          Core["var"]("newLoc"),
          Object["obj.new"](
            "contents",
            List["list.concat"](
              Object["obj.get"](Core["var"]("newLoc"), "contents"),
              List["list.new"](Object["obj.get"](Core["var"]("mover"), "id")),
            ),
          ),
        ),
      ),
      Core["send"]("Whoosh! You have been teleported."),
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
    Core["send"]("Status check disabled."),
  );

  console.log("Seeding complete!");

  // Color Library
  const colorLibId = createEntity({
    name: "Color Library", // Or a system object
    location: voidId, // Hidden
    props: {
      colors: [
        "red",
        "green",
        "blue",
        "purple",
        "orange",
        "yellow",
        "cyan",
        "magenta",
      ],
    },
  });

  addVerb(
    colorLibId,
    "random_color",
    List["list.get"](
      Object["obj.get"](Core["this"](), "colors"),
      // floor missing? Math.floor?
      // seed.ts used "floor". core.ts doesn't have it.
      // I'll use random(min, max) which floors if ints.
      // random(0, len-1)
      Core["random"](
        0,
        Core["-"](
          List["list.len"](Object["obj.get"](Core["this"](), "colors")),
          1,
        ),
      ),
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
    Core["seq"](
      Core["let"]("libId", Object["obj.get"](Core["this"](), "color_lib")),
      Core["let"](
        "newColor",
        Core["call"](Core["var"]("libId"), "random_color"),
      ),
      Core["set_entity"](
        Object["obj.set"](
          Core["this"](),
          "adjectives",
          List["list.new"](
            Str["str.concat"]("color:", Core["var"]("newColor")),
            "material:silver",
          ),
        ),
      ),
      Core["schedule"]("update_color", [], 5000),
    ),
  );

  // Kickoff
  // We need a way to start it. Let's add a 'touch' verb to start it.
  addVerb(moodRingId, "touch", Core["schedule"]("update_color", [], 0));

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
          Core["*"](Time["time.to_timestamp"](Time["time.now"]()), 0.1),
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
    Core["seq"](
      // broadcast missing
      Core["send"](
        Str["str.concat"](
          "Tick Tock: ",
          Time["time.format"](Time["time.now"](), "time"),
        ),
      ),
      Core["schedule"]("tick", [], 10000),
    ),
  );
  addVerb(specialWatchId, "start", Core["schedule"]("tick", [], 0));

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
    Core["seq"](
      // broadcast missing
      Core["send"](
        Str["str.concat"](
          "BONG! It is ",
          Time["time.format"](Time["time.now"](), "time"),
        ),
      ),
      Core["schedule"]("tick", [], 15000),
    ),
  );
  addVerb(clockId, "start", Core["schedule"]("tick", [], 0));

  // 4. Clock Tower (Global Broadcast)
  const towerId = createEntity({
    name: "Clock Tower", // Or ROOM/BUILDING
    location: voidId, // Hidden, or visible somewhere
    props: { description: "The source of time." },
  });

  addVerb(
    towerId,
    "toll",
    Core["seq"](
      // broadcast missing
      Core["send"](
        Str["str.concat"](
          "The Clock Tower tolls: ",
          Time["time.format"](Time["time.now"](), "time"),
        ),
      ),
      Core["schedule"]("toll", [], 60000),
    ),
  );
  addVerb(towerId, "start", Core["schedule"]("toll", [], 0));

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
    Core["send"]("Deposit disabled."),
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
}
