import { createEntity, addVerb } from "./repo";
import { db } from "./db";
import { seedHotel } from "./seeds/hotel";
import { seedItems } from "./seeds/items";

export function seed() {
  const root = db
    .query("SELECT id FROM entities WHERE slug = 'sys:root'")
    .get();
  if (root) {
    console.log("Database already seeded.");
    return;
  }

  console.log("Seeding database...");

  // 1. Create The Void (Root Zone)
  const voidId = createEntity({
    name: "The Void",
    slug: "sys:root",
    kind: "ZONE",
    props: {
      description: "An endless expanse of nothingness.",
    },
  });

  // 2. Create Player Prototype
  const playerBaseId = createEntity({
    name: "Player Base",
    slug: "sys:player_base",
    kind: "ACTOR",
    props: {
      description: "A generic adventurer.",
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
      ],
    },
  });

  // Add verbs to Player Base
  addVerb(playerBaseId, "say", ["say", ["str.join", ["args"], " "]]);

  addVerb(playerBaseId, "tell", [
    "tell",
    ["arg", 0],
    ["str.join", ["list.slice", ["args"], 1], " "],
  ]);

  addVerb(playerBaseId, "on_hear", [
    "tell",
    "me",
    [
      "str.concat",
      ["prop", ["arg", 1], "name"],
      " ",
      ["arg", 2], // type (say/tell)
      "s: ",
      ["arg", 0], // msg
    ],
  ]);

  addVerb(playerBaseId, "look", [
    "if",
    ["list.empty", ["args"]],
    [
      "seq",
      [
        "let",
        "room",
        ["resolve_props", ["entity", ["prop", "me", "location_id"]]],
      ],
      [
        "let",
        "richItems",
        [
          "map",
          ["contents", ["var", "room"]],
          ["lambda", ["item"], ["resolve_props", ["var", "item"]]],
        ],
      ],
      [
        "sys.send",
        [
          "obj.merge",
          ["var", "room"],
          ["object", "contents", ["var", "richItems"]],
        ],
      ],
    ],
    [
      "seq",
      ["let", "targetId", ["world.find", ["arg", 0]]],
      [
        "if",
        ["var", "targetId"],
        ["sys.send", ["resolve_props", ["entity", ["var", "targetId"]]]],
        [
          "tell",
          "me",
          ["str.join", ["list", "You don't see", ["arg", 0], "here."], " "],
        ],
      ],
    ],
  ]);

  addVerb(playerBaseId, "inventory", [
    "seq",
    [
      "sys.send",
      [
        "map",
        ["contents", "me"],
        ["lambda", ["item"], ["resolve_props", ["var", "item"]]],
      ],
    ],
  ]);

  addVerb(playerBaseId, "move", [
    "seq",
    ["let", "direction", ["arg", 0]],
    [
      "if",
      ["not", ["var", "direction"]],
      ["print", "Where do you want to go?"],
      [
        "seq",
        ["let", "exitId", ["world.find", ["var", "direction"]]],
        [
          "if",
          ["var", "exitId"],
          [
            "seq",
            [
              "move",
              ["prop", "me", "id"],
              ["prop", ["var", "exitId"], "destination_id"],
            ],
            [
              "sys.send",
              ["resolve_props", ["entity", ["prop", "me", "location_id"]]],
            ],
            ["print", ["str.concat", "You move ", ["var", "direction"], "."]],
          ],
          ["print", "You can't go that way."],
        ],
      ],
    ],
  ]);

  addVerb(playerBaseId, "dig", [
    "seq",
    ["let", "direction", ["arg", 0]],
    ["let", "roomName", ["str.join", ["list.slice", ["args"], 1], " "]],
    [
      "if",
      ["not", ["var", "direction"]],
      ["print", "Where do you want to dig?"],
      [
        "seq",
        [
          "if",
          ["sys.can_edit", ["prop", "me", "location_id"]],
          [
            "seq",
            [
              "let",
              "newRoomId",
              [
                "create",
                "ROOM",
                ["var", "roomName"],
                ["object", "description", "A newly dug room."],
              ],
            ],
            [
              "create",
              "EXIT",
              ["var", "direction"],
              [
                "object",
                "direction",
                ["var", "direction"],
                "destination_id",
                ["var", "newRoomId"],
              ],
              ["prop", "me", "location_id"],
            ],
            ["move", ["prop", "me", "id"], ["var", "newRoomId"]],
            ["sys.send", ["resolve_props", ["entity", ["var", "newRoomId"]]]],
            [
              "print",
              [
                "str.concat",
                "You dug",
                ["var", "direction"],
                "to",
                ["var", "roomName"],
                ".",
              ],
            ],
          ],
          ["print", "You can't dig here."],
        ],
      ],
    ],
  ]);

  addVerb(playerBaseId, "create", [
    "seq",
    ["let", "name", ["arg", 0]],
    [
      "if",
      ["not", ["var", "name"]],
      ["print", "What do you want to create?"],
      [
        "seq",
        [
          "if",
          ["sys.can_edit", ["prop", "me", "location_id"]],
          [
            "seq",
            [
              "let",
              "item_id",
              [
                "create",
                "ITEM",
                ["var", "name"],
                ["object"],
                ["prop", "me", "location_id"],
              ],
            ],
            [
              "sys.send",
              ["resolve_props", ["entity", ["prop", "me", "location_id"]]],
            ],
            ["print", ["str.concat", "Created ", ["var", "name"], "."]],
            ["var", "item_id"],
          ],
          ["print", "You can't create items here."],
        ],
      ],
    ],
  ]);

  addVerb(playerBaseId, "set", [
    "seq",
    ["let", "targetName", ["arg", 0]],
    ["let", "propName", ["arg", 1]],
    ["let", "value", ["arg", 2]],
    [
      "if",
      ["or", ["not", ["var", "targetName"]], ["not", ["var", "propName"]]],
      ["print", "Usage: set <target> <prop> <value>"],
      [
        "seq",
        ["let", "targetId", ["world.find", ["var", "targetName"]]],
        [
          "if",
          ["var", "targetId"],
          [
            "if",
            ["sys.can_edit", ["var", "targetId"]],
            [
              "seq",
              [
                "set_prop",
                ["var", "targetId"],
                ["var", "propName"],
                ["var", "value"],
              ],
              [
                "print",
                [
                  "str.concat",
                  "Set ",
                  ["var", "propName"],
                  " of ",
                  ["var", "targetName"],
                  " to ",
                  ["var", "value"],
                  ".",
                ],
              ],
              [
                "sys.send",
                ["resolve_props", ["entity", ["prop", "me", "location_id"]]],
              ],
            ],
            ["print", "You can't edit that."],
          ],
          ["print", "You don't see that here."],
        ],
      ],
    ],
  ]);

  // 3. Create a Lobby Room
  const lobbyId = createEntity({
    name: "Lobby",
    slug: "area:lobby",
    kind: "ROOM",
    location_id: voidId,
    props: {
      description: "A cozy lobby with a crackling fireplace.",
    },
  });

  // 4. Create a Test Player
  const playerId = createEntity({
    name: "Guest",
    kind: "ACTOR",
    location_id: lobbyId,
    prototype_id: playerBaseId,
    props: {
      description: "A confused looking guest.",
    },
  });

  // 5. Create some furniture (Table)
  const tableId = createEntity({
    name: "Oak Table",
    kind: "ITEM",
    location_id: lobbyId,
    props: {
      description: "A sturdy oak table.",
      slots: ["surface", "under"], // Generalizable slots!
    },
  });

  // 6. Create a Cup ON the table
  createEntity({
    name: "Ceramic Cup",
    kind: "ITEM",
    location_id: tableId,
    location_detail: "surface", // It's ON the table
    props: {
      description: "A chipped ceramic cup.",
    },
  });

  // 7. Create a Backpack
  const backpackId = createEntity({
    name: "Leather Backpack",
    kind: "ITEM",
    location_id: playerId,
    location_detail: "back", // Worn on back
    props: {
      description: "A worn leather backpack.",
      slots: ["main", "front_pocket"],
    },
  });

  // 8. Create a Badge ON the Backpack
  createEntity({
    name: "Scout Badge",
    kind: "ITEM",
    location_id: backpackId,
    location_detail: "surface", // Attached to the outside? Or maybe we define a slot for it.
    props: {
      description: "A merit badge.",
    },
  });

  // Create another room
  const gardenId = createEntity({
    name: "Garden",
    kind: "ROOM",
    props: { description: "A lush garden with blooming flowers." },
  });

  // Link Lobby and Garden
  createEntity({
    name: "north",
    kind: "EXIT",
    location_id: lobbyId,
    props: { direction: "north", destination_id: gardenId },
  });

  createEntity({
    name: "south",
    kind: "EXIT",
    location_id: gardenId,
    props: { direction: "south", destination_id: lobbyId },
  });

  // 9. Create a Gemstore
  const gemstoreId = createEntity({
    name: "Gemstore",
    kind: "ROOM",
    props: {
      description: "A glittering shop filled with rare stones and oddities.",
    },
  });

  // Link Lobby and Gemstore
  createEntity({
    name: "east",
    kind: "EXIT",
    location_id: lobbyId,
    props: { direction: "east", destination_id: gemstoreId },
  });

  createEntity({
    name: "west",
    kind: "EXIT",
    location_id: gemstoreId,
    props: { direction: "west", destination_id: lobbyId },
  });

  // Items in Gemstore
  createEntity({
    name: "Black Obsidian",
    kind: "ITEM",
    location_id: gemstoreId,
    props: {
      description: "A pitch black stone.",
      adjectives: [
        "color:black",
        "effect:shiny",
        "material:stone",
        "material:obsidian",
      ],
    },
  });

  createEntity({
    name: "Silver Dagger",
    kind: "ITEM",
    location_id: gemstoreId,
    props: {
      description: "A gleaming silver blade.",
      adjectives: ["color:silver", "material:metal", "material:silver"],
    },
  });

  createEntity({
    name: "Gold Coin",
    kind: "ITEM",
    location_id: gemstoreId,
    props: {
      description: "A heavy gold coin.",
      adjectives: [
        "color:gold",
        "weight:heavy",
        "material:metal",
        "material:gold",
      ],
    },
  });

  createEntity({
    name: "Platinum Ring",
    kind: "ITEM",
    location_id: gemstoreId,
    props: {
      description: "A precious platinum ring.",
      adjectives: [
        "color:platinum",
        "value:precious",
        "material:metal",
        "material:platinum",
      ],
    },
  });

  createEntity({
    name: "Radioactive Isotope",
    kind: "ITEM",
    location_id: gemstoreId,
    props: {
      description: "It glows with a sickly light.",
      adjectives: ["effect:radioactive", "effect:glowing"],
    },
  });

  createEntity({
    name: "Electric Blue Potion",
    kind: "ITEM",
    location_id: gemstoreId,
    props: {
      description: "A crackling blue liquid.",
      adjectives: ["color:electric blue", "effect:glowing"],
    },
  });

  createEntity({
    name: "Ethereal Mist",
    kind: "ITEM",
    location_id: gemstoreId,
    props: {
      description: "A swirling white mist.",
      adjectives: ["color:white", "effect:ethereal"],
    },
  });

  createEntity({
    name: "Transparent Cube",
    kind: "ITEM",
    location_id: gemstoreId,
    props: {
      description: "You can barely see it.",
      adjectives: ["effect:transparent", "material:glass"],
    },
  });

  const wigStandId = createEntity({
    name: "Wig Stand",
    kind: "ITEM",
    location_id: gemstoreId,
    props: { description: "A stand holding various wigs.", slots: ["surface"] },
  });

  if (wigStandId) {
    createEntity({
      name: "Auburn Wig",
      kind: "ITEM",
      location_id: wigStandId,
      location_detail: "surface",
      props: {
        description: "A reddish-brown wig.",
        adjectives: ["color:auburn"],
      },
    });

    createEntity({
      name: "Blonde Wig",
      kind: "ITEM",
      location_id: wigStandId,
      location_detail: "surface",
      props: {
        description: "A bright yellow wig.",
        adjectives: ["color:blonde"],
      },
    });

    createEntity({
      name: "Brunette Wig",
      kind: "ITEM",
      location_id: wigStandId,
      location_detail: "surface",
      props: {
        description: "A dark brown wig.",
        adjectives: ["color:brunette"],
      },
    });
  }

  // 10. Create Scripting Test Items (Lobby)

  // Watch Item
  const watchId = createEntity({
    name: "Golden Watch",
    kind: "ITEM",
    location_id: lobbyId,
    props: {
      description: "A beautiful golden pocket watch.",
      adjectives: ["color:gold", "material:gold"],
    },
  });

  addVerb(watchId, "tell", [
    "tell",
    "me",
    ["time.format", ["time.now"], "time"],
  ]);

  // Teleporter Item
  const teleporterId = createEntity({
    name: "Teleporter Stone",
    kind: "ITEM",
    location_id: lobbyId,
    props: {
      description: "A humming stone that vibrates with energy.",
      destination: gardenId,
      adjectives: ["effect:glowing", "material:stone"],
    },
  });

  addVerb(teleporterId, "teleport", [
    "move",
    "me",
    ["prop", "this", "destination"],
  ]);

  // Status Item
  const statusId = createEntity({
    name: "Status Orb",
    kind: "ITEM",
    location_id: lobbyId,
    props: {
      description: "A crystal orb that shows world statistics.",
      adjectives: ["effect:transparent", "material:crystal"],
    },
  });

  addVerb(statusId, "check", [
    "tell",
    "me",
    ["str.concat", "Total entities: ", ["list.len", ["world.entities"]]],
  ]);

  console.log("Seeding complete!");

  // Color Library
  const colorLibId = createEntity({
    name: "Color Library",
    kind: "ITEM", // Or a system object
    location_id: voidId, // Hidden
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

  addVerb(colorLibId, "random_color", [
    "list.get",
    ["prop", "this", "colors"],
    ["floor", ["*", ["random"], ["list.len", ["prop", "this", "colors"]]]],
  ]);

  // Mood Ring
  const moodRingId = createEntity({
    name: "Mood Ring",
    kind: "ITEM",
    location_id: lobbyId,
    props: {
      description: "A ring that changes color based on... something.",
      adjectives: ["color:grey", "material:silver"],
      color_lib: colorLibId,
    },
  });

  // Verb to update color
  // It calls random_color on the lib, sets its own color adjective, and schedules itself again.
  addVerb(moodRingId, "update_color", [
    "seq",
    ["let", "libId", ["prop", "this", "color_lib"]],
    ["let", "newColor", ["call", ["var", "libId"], "random_color"]],
    [
      "set",
      "this",
      "adjectives",
      [
        "list",
        ["str.concat", "color:", ["var", "newColor"]],
        "material:silver",
      ],
    ],
    ["schedule", "update_color", [], 5000], // Run again in 5s
  ]);

  // Kickoff
  // We need a way to start it. Let's add a 'touch' verb to start it.
  addVerb(moodRingId, "touch", ["schedule", "update_color", [], 0]);

  // --- Advanced Items ---

  // 1. Dynamic Mood Ring (Getter)
  const dynamicRingId = createEntity({
    name: "Dynamic Mood Ring",
    kind: "ITEM",
    location_id: lobbyId,
    props: {
      description: "A ring that shimmers with the current second.",
      // No static adjectives needed if we use getter
    },
  });

  // get_adjectives verb
  // Returns a list of adjectives.
  // We'll use the current second to determine color.
  addVerb(dynamicRingId, "get_adjectives", [
    "list",
    [
      "str.concat",
      "color:hsl(",
      ["str.concat", ["*", ["time.now"], 0.1], ", 100%, 50%)"],
    ], // Rotating hue
    "material:gold",
  ]);

  // 2. Special Watch (Local Broadcast)
  const specialWatchId = createEntity({
    name: "Broadcasting Watch",
    kind: "ITEM",
    location_id: lobbyId,
    props: { description: "A watch that announces the time to you." },
  });

  addVerb(specialWatchId, "tick", [
    "seq",
    [
      "broadcast",
      ["str.concat", "Tick Tock: ", ["time.format", ["time.now"], "time"]],
      ["prop", "this", "location_id"],
    ],
    ["schedule", "tick", [], 10000], // Every 10s for demo
  ]);
  addVerb(specialWatchId, "start", ["schedule", "tick", [], 0]);

  // 3. Clock (Room Broadcast)
  // Watch broadcasts to holder (Player), Clock broadcasts to Room.

  const clockId = createEntity({
    name: "Grandfather Clock",
    kind: "ITEM",
    location_id: lobbyId,
    props: { description: "A loud clock." },
  });

  addVerb(clockId, "tick", [
    "seq",
    [
      "broadcast",
      ["str.concat", "BONG! It is ", ["time.format", ["time.now"], "time"]],
      ["prop", "this", "location_id"],
    ],
    ["schedule", "tick", [], 15000],
  ]);
  addVerb(clockId, "start", ["schedule", "tick", [], 0]);

  // 4. Clock Tower (Global Broadcast)
  const towerId = createEntity({
    name: "Clock Tower",
    kind: "ITEM", // Or ROOM/BUILDING
    location_id: voidId, // Hidden, or visible somewhere
    props: { description: "The source of time." },
  });

  addVerb(towerId, "toll", [
    "seq",
    [
      "broadcast",
      [
        "str.concat",
        "The Clock Tower tolls: ",
        ["time.format", ["time.now"], "time"],
      ],
    ], // No location = global
    ["schedule", "toll", [], 60000], // Every minute
  ]);
  addVerb(towerId, "start", ["schedule", "toll", [], 0]);

  // 5. Mailbox
  // A prototype for mailboxes.
  const mailboxProtoId = createEntity({
    name: "Mailbox Prototype",
    kind: "ITEM",
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
    [
      "give",
      ["arg", 0], // The item to deposit
      "this", // The mailbox
    ],
    { call: "public" },
  ); // Anyone can call deposit

  // Give the player a mailbox
  createEntity({
    name: "My Mailbox",
    kind: "ITEM",
    location_id: playerId, // Carried by player
    prototype_id: mailboxProtoId,
    owner_id: playerId,
  });

  // 6. Items
  seedItems(lobbyId);

  // 7. Hotel
  seedHotel(lobbyId, voidId);
}
