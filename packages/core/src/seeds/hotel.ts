import { createEntity, addVerb, updateVerb, getVerb } from "../repo";

export function seedHotel(lobbyId: number, voidId: number) {
  // 7. Hotel Implementation

  // Hotel Lobby
  const hotelLobbyId = createEntity({
    name: "Grand Hotel Lobby",
    kind: "ROOM",
    location_id: voidId, // Or connect to main lobby? Let's connect it.
    props: {
      description:
        "The lavish lobby of the Grand Hotel. The elevator is to the side.",
    },
  });

  // Connect Hotel Lobby to Main Lobby
  createEntity({
    name: "hotel",
    kind: "EXIT",
    location_id: lobbyId,
    props: { direction: "hotel", destination_id: hotelLobbyId },
  });

  createEntity({
    name: "out",
    kind: "EXIT",
    location_id: hotelLobbyId,
    props: { direction: "out", destination_id: lobbyId },
  });

  // Hotel Room Prototype (Hidden)
  const hotelRoomProtoId = createEntity({
    name: "Hotel Room Prototype",
    kind: "ROOM",
    location_id: voidId,
    props: {
      description: "A generic hotel room.",
    },
  });

  // Verb: leave (on the prototype)
  // Moves player back to lobby and destroys the room
  addVerb(hotelRoomProtoId, "leave", [
    "seq",
    ["move", "me", hotelLobbyId], // Move player out first
    ["tell", "me", "You leave the room and it fades away behind you."],
    ["destroy", "this"], // Destroy the room
  ]);

  // Update 'leave' verb to use prop
  updateVerb(getVerb(hotelRoomProtoId, "leave")!.id, [
    "seq",
    ["let", "lobbyId", ["prop", "this", "lobby_id"]],
    ["move", "me", ["var", "lobbyId"]],
    ["tell", "me", "You leave the room and it fades away behind you."],

    // Destroy contents (furnishings)
    ["let", "contents", ["entity.contents", "this"]],
    [
      "for",
      "item",
      ["var", "contents"],
      [
        "if",
        ["!=", ["prop", ["var", "item"], "kind"], "ACTOR"],
        ["destroy", ["var", "item"]],
      ],
    ],

    ["destroy", "this"],
  ]);

  // 8. Hotel Elevator & Floors

  // Elevator (Persistent)
  const elevatorId = createEntity({
    name: "Hotel Elevator",
    kind: "ROOM",
    location_id: hotelLobbyId,
    props: {
      description:
        "A polished brass elevator. Buttons for floors 1-100. Type 'push <floor>' to select.",
      current_floor: 1,
    },
  });

  // Link Lobby -> Elevator
  createEntity({
    name: "elevator",
    kind: "EXIT",
    location_id: hotelLobbyId,
    props: { direction: "elevator", destination_id: elevatorId },
  });

  // Floor Lobby Prototype (Ephemeral)
  const floorLobbyProtoId = createEntity({
    name: "Floor Lobby Proto",
    kind: "ROOM",
    location_id: voidId,
    props: { description: "A quiet carpeted lobby." },
  });

  // Wing Prototype (Ephemeral)
  const wingProtoId = createEntity({
    name: "Wing Proto",
    kind: "ROOM",
    location_id: voidId,
    props: { description: "A long hallway lined with doors." },
  });

  // --- Elevator Verbs ---

  // push <floor>
  addVerb(elevatorId, "push", [
    "seq",
    ["let", "floor", ["arg", 0]],
    ["prop.set", "this", "current_floor", ["var", "floor"]],
    [
      "tell",
      "me",
      [
        "str.concat",
        "The elevator hums and moves to floor ",
        ["var", "floor"],
        ".",
      ],
    ],
  ]);

  // out (Exit Elevator to Floor Lobby)
  addVerb(elevatorId, "out", [
    "seq",
    ["let", "floor", ["prop", "this", "current_floor"]],
    // If floor 1, go to Main Hotel Lobby? Or just create Floor 1 Lobby?
    // Let's say Floor 1 is the Main Lobby.
    [
      "if",
      ["==", ["var", "floor"], 1],
      [
        "seq",
        ["move", "me", hotelLobbyId],
        ["tell", "me", "The doors open to the Grand Lobby."],
      ],
      [
        "seq",
        // Create Ephemeral Floor Lobby
        ["let", "lobbyData", {}],
        [
          "obj.set",
          ["var", "lobbyData"],
          "name",
          ["str.concat", "Floor ", ["var", "floor"], " Lobby"],
        ],
        ["obj.set", ["var", "lobbyData"], "kind", "ROOM"],
        ["obj.set", ["var", "lobbyData"], "prototype_id", floorLobbyProtoId],

        ["let", "props", {}],
        [
          "obj.set",
          ["var", "props"],
          "description",
          [
            "str.concat",
            "The lobby of floor ",
            ["var", "floor"],
            ". West and East wings extend from here.",
          ],
        ],
        ["obj.set", ["var", "props"], "floor", ["var", "floor"]],
        ["obj.set", ["var", "props"], "elevator_id", elevatorId], // Return point

        ["obj.set", ["var", "lobbyData"], "props", ["var", "props"]],

        ["let", "lobbyId", ["create", ["var", "lobbyData"]]],
        ["move", "me", ["var", "lobbyId"]],
        [
          "tell",
          "me",
          ["str.concat", "The doors open to Floor ", ["var", "floor"], "."],
        ],
      ],
    ],
  ]);

  // --- Floor Lobby Verbs ---

  // elevator (Return to Elevator)
  addVerb(floorLobbyProtoId, "elevator", [
    "seq",
    ["let", "elevId", ["prop", "this", "elevator_id"]],
    ["move", "me", ["var", "elevId"]],
    ["tell", "me", "You step back into the elevator."],
    ["destroy", "this"],
  ]);

  // west (Create Left Wing)
  addVerb(floorLobbyProtoId, "west", [
    "seq",
    ["let", "floor", ["prop", "this", "floor"]],

    ["let", "wingData", {}],
    [
      "obj.set",
      ["var", "wingData"],
      "name",
      ["str.concat", "Floor ", ["var", "floor"], " West Wing"],
    ],
    ["obj.set", ["var", "wingData"], "kind", "ROOM"],
    ["obj.set", ["var", "wingData"], "prototype_id", wingProtoId],

    ["let", "props", {}],
    [
      "obj.set",
      ["var", "props"],
      "description",
      "A long hallway. Rooms 01-50 are here.",
    ],
    ["obj.set", ["var", "props"], "floor", ["var", "floor"]],
    ["obj.set", ["var", "props"], "side", "West"],
    ["obj.set", ["var", "props"], "return_id", ["prop", "this", "id"]], // Return to THIS lobby

    ["obj.set", ["var", "wingData"], "props", ["var", "props"]],

    ["let", "wingId", ["create", ["var", "wingData"]]],
    ["move", "me", ["var", "wingId"]],
    ["tell", "me", "You walk down the West Wing."],
  ]);

  // east (Create Right Wing)
  addVerb(floorLobbyProtoId, "east", [
    "seq",
    ["let", "floor", ["prop", "this", "floor"]],

    ["let", "wingData", {}],
    [
      "obj.set",
      ["var", "wingData"],
      "name",
      ["str.concat", "Floor ", ["var", "floor"], " East Wing"],
    ],
    ["obj.set", ["var", "wingData"], "kind", "ROOM"],
    ["obj.set", ["var", "wingData"], "prototype_id", wingProtoId],

    ["let", "props", {}],
    [
      "obj.set",
      ["var", "props"],
      "description",
      "A long hallway. Rooms 51-99 are here.",
    ],
    ["obj.set", ["var", "props"], "floor", ["var", "floor"]],
    ["obj.set", ["var", "props"], "side", "East"],
    ["obj.set", ["var", "props"], "return_id", ["prop", "this", "id"]],

    ["obj.set", ["var", "wingData"], "props", ["var", "props"]],

    ["let", "wingId", ["create", ["var", "wingData"]]],
    ["move", "me", ["var", "wingId"]],
    ["tell", "me", "You walk down the East Wing."],
  ]);

  // Furnishings Prototypes
  const bedProtoId = createEntity({
    name: "Comfy Bed",
    kind: "ITEM",
    location_id: voidId,
    props: { description: "A soft, inviting bed with crisp white linens." },
  });

  const lampProtoId = createEntity({
    name: "Brass Lamp",
    kind: "ITEM",
    location_id: voidId,
    props: { description: "A polished brass lamp casting a warm glow." },
  });

  const chairProtoId = createEntity({
    name: "Velvet Chair",
    kind: "ITEM",
    location_id: voidId,
    props: { description: "A plush red velvet armchair." },
  });

  // --- Wing Verbs ---

  // back (Return to Floor Lobby)
  addVerb(wingProtoId, "back", [
    "seq",
    ["let", "returnId", ["prop", "this", "return_id"]],
    ["move", "me", ["var", "returnId"]],
    ["tell", "me", "You head back to the lobby."],
    ["destroy", "this"],
  ]);

  // enter <room_number>
  addVerb(wingProtoId, "enter", [
    "seq",
    ["let", "roomNum", ["arg", 0]],
    ["let", "valid", true],

    // Validate room number matches wing side
    ["let", "side", ["prop", "this", "side"]],
    [
      "if",
      ["==", ["var", "side"], "West"],
      [
        "if",
        ["or", ["<", ["var", "roomNum"], 1], [">", ["var", "roomNum"], 50]],
        [
          "seq",
          ["tell", "me", "Room numbers in the West Wing are 1-50."],
          ["set", "valid", false],
        ],
      ],
    ],
    [
      "if",
      ["==", ["var", "side"], "East"],
      [
        "if",
        ["or", ["<", ["var", "roomNum"], 51], [">", ["var", "roomNum"], 99]],
        [
          "seq",
          ["tell", "me", "Room numbers in the East Wing are 51-99."],
          ["set", "valid", false],
        ],
      ],
    ],

    // Execute if valid
    [
      "if",
      ["var", "valid"],
      [
        "seq",
        ["let", "roomData", {}],
        [
          "obj.set",
          ["var", "roomData"],
          "name",
          ["str.concat", "Room ", ["var", "roomNum"]],
        ],
        ["obj.set", ["var", "roomData"], "kind", "ROOM"],
        ["obj.set", ["var", "roomData"], "prototype_id", hotelRoomProtoId],

        ["let", "props", {}],
        ["obj.set", ["var", "props"], "description", "A standard hotel room."],
        ["obj.set", ["var", "props"], "lobby_id", ["prop", "this", "id"]], // Return to THIS wing

        ["obj.set", ["var", "roomData"], "props", ["var", "props"]],

        ["let", "roomId", ["create", ["var", "roomData"]]],

        // Furnish the room
        ["let", "bedData", {}],
        ["obj.set", ["var", "bedData"], "name", "Bed"],
        ["obj.set", ["var", "bedData"], "kind", "ITEM"],
        ["obj.set", ["var", "bedData"], "prototype_id", bedProtoId],
        ["obj.set", ["var", "bedData"], "location_id", ["var", "roomId"]],
        ["create", ["var", "bedData"]],

        ["let", "lampData", {}],
        ["obj.set", ["var", "lampData"], "name", "Lamp"],
        ["obj.set", ["var", "lampData"], "kind", "ITEM"],
        ["obj.set", ["var", "lampData"], "prototype_id", lampProtoId],
        ["obj.set", ["var", "lampData"], "location_id", ["var", "roomId"]],
        ["create", ["var", "lampData"]],

        ["let", "chairData", {}],
        ["obj.set", ["var", "chairData"], "name", "Chair"],
        ["obj.set", ["var", "chairData"], "kind", "ITEM"],
        ["obj.set", ["var", "chairData"], "prototype_id", chairProtoId],
        ["obj.set", ["var", "chairData"], "location_id", ["var", "roomId"]],
        ["create", ["var", "chairData"]],

        ["move", "me", ["var", "roomId"]],
        [
          "tell",
          "me",
          ["str.concat", "You enter Room ", ["var", "roomNum"], "."],
        ],
      ],
    ],
  ]);

  // 9. NPCs

  // Receptionist (in Hotel Lobby)
  const receptionistId = createEntity({
    name: "Receptionist",
    kind: "ACTOR",
    location_id: hotelLobbyId,
    props: {
      description: "A friendly receptionist standing behind the desk.",
    },
  });

  addVerb(receptionistId, "on_hear", [
    "seq",
    ["let", "msg", ["arg", 0]],
    ["let", "speakerId", ["arg", 1]],

    // Simple heuristics
    [
      "if",
      ["str.includes", ["str.lower", ["var", "msg"]], "room"],
      [
        "say",
        "We have lovely rooms available on floors 1-100. Just use the elevator!",
      ],
      [
        "if",
        ["str.includes", ["str.lower", ["var", "msg"]], "hello"],
        ["say", "Welcome to the Grand Hotel! How may I help you?"],
      ],
    ],
  ]);

  // Golem (in Void for now, maybe move to lobby?)
  // Let's put the Golem in the Hotel Lobby too for testing
  const golemId = createEntity({
    name: "Stone Golem",
    kind: "ACTOR",
    location_id: hotelLobbyId,
    props: {
      description: "A massive stone golem. It seems to be listening.",
    },
  });

  addVerb(golemId, "on_hear", [
    "seq",
    ["let", "msg", ["arg", 0]],
    ["let", "type", ["arg", 2]],
    [
      "if",
      ["==", ["var", "type"], "tell"],
      ["say", ["str.concat", "Golem echoes: ", ["var", "msg"]]],
    ],
  ]);
}
