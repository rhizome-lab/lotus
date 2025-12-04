import { createEntity, addVerb, createCapability, updateEntity, getEntity } from "../repo";
import { transpile } from "@viwo/scripting";
import { extractVerb } from "../verb_loader";
import { resolve } from "path";

const verbsPath = resolve(__dirname, "verbs.ts");

export function seedHotel(lobbyId: number, voidId: number, entityBaseId: number) {
  // 1. Hotel Lobby (already exists as lobbyId, passed in)
  addVerb(lobbyId, "room_vacated", transpile(extractVerb(verbsPath, "hotel_lobby_room_vacated")));

  // 2. Elevator
  const elevatorId = createEntity(
    {
      name: "Glass Elevator",
      location: lobbyId,
      description: "A shiny glass elevator that can take you to any floor.",
      current_floor: 1,
      floors: {},
    },
    entityBaseId,
  );
  createCapability(elevatorId, "entity.control", { target_id: elevatorId });

  addVerb(elevatorId, "push", transpile(extractVerb(verbsPath, "elevator_push")));
  addVerb(elevatorId, "move", transpile(extractVerb(verbsPath, "elevator_move")));

  // 3. Floors and Rooms
  const floors = 5;
  const elevatorFloors: Record<string, number> = {};

  for (let f = 1; f <= floors; f++) {
    // Create Floor Lobby
    const floorLobbyId = createEntity(
      {
        name: `Floor ${f} Lobby`,
        location: voidId,
        description: `The lobby for the ${f}th floor.`,
      },
      entityBaseId,
    );
    createCapability(floorLobbyId, "entity.control", {
      target_id: floorLobbyId,
    });
    elevatorFloors[String(f)] = floorLobbyId;

    // Create West Wing
    const westWingId = createEntity(
      {
        name: `Floor ${f} West Wing`,
        location: voidId,
        description: `The West Wing of floor ${f}.`,
      },
      entityBaseId,
    );
    createCapability(westWingId, "entity.control", { target_id: westWingId });
    addVerb(westWingId, "on_enter", transpile(extractVerb(verbsPath, "wing_on_enter")));
    addVerb(westWingId, "enter", transpile(extractVerb(verbsPath, "wing_enter_room")));

    // Link Floor Lobby -> West Wing
    const westExitId = createEntity(
      {
        name: "west",
        location: floorLobbyId,
        direction: "west",
        destination: westWingId,
      },
      entityBaseId,
    );
    updateEntity({ ...getEntity(floorLobbyId)!, exits: [westExitId] });

    // Link West Wing -> Floor Lobby
    const westBackExitId = createEntity(
      {
        name: "back",
        location: westWingId,
        direction: "back",
        destination: floorLobbyId,
      },
      entityBaseId,
    );
    updateEntity({ ...getEntity(westWingId)!, exits: [westBackExitId] });

    // Create East Wing
    const eastWingId = createEntity(
      {
        name: `Floor ${f} East Wing`,
        location: voidId,
        description: `The East Wing of floor ${f}.`,
      },
      entityBaseId,
    );
    createCapability(eastWingId, "entity.control", { target_id: eastWingId });
    addVerb(eastWingId, "on_enter", transpile(extractVerb(verbsPath, "wing_on_enter")));
    addVerb(eastWingId, "enter", transpile(extractVerb(verbsPath, "wing_enter_room")));

    // Link Floor Lobby -> East Wing
    const eastExitId = createEntity(
      {
        name: "east",
        location: floorLobbyId,
        direction: "east",
        destination: eastWingId,
      },
      entityBaseId,
    );
    const lobbyExits = getEntity(floorLobbyId)!["exits"] as number[];
    updateEntity({
      ...getEntity(floorLobbyId)!,
      exits: [...lobbyExits, eastExitId],
    });

    // Link East Wing -> Floor Lobby
    const eastBackExitId = createEntity(
      {
        name: "back",
        location: eastWingId,
        direction: "back",
        destination: floorLobbyId,
      },
      entityBaseId,
    );
    updateEntity({ ...getEntity(eastWingId)!, exits: [eastBackExitId] });

    // Create Rooms
    // West Wing: 1-50 (Create just a few for testing)
    // Room 10 for West Wing Validation
    // Room 5 for Navigate Test
    const westRooms = [5, 10];
    const westRoomIds: number[] = [];
    for (const r of westRooms) {
      const roomNumber = r; // e.g. 5
      const roomId = createEntity(
        {
          name: `Room ${roomNumber}`,
          location: westWingId,
          description: "A standard hotel room.",
          room_number: roomNumber,
          owner: null,
        },
        entityBaseId,
      );
      westRoomIds.push(roomId);
      createCapability(roomId, "entity.control", { target_id: roomId });

      addVerb(
        roomId,
        "on_leave",
        transpile(
          extractVerb(verbsPath, "hotel_room_on_leave").replace(
            "HOTEL_LOBBY_ID_PLACEHOLDER",
            String(lobbyId),
          ),
        ),
      );

      const outExitId = createEntity(
        {
          name: "out",
          location: roomId,
          direction: "out",
          destination: westWingId,
        },
        entityBaseId,
      );
      updateEntity({ ...getEntity(roomId)!, exits: [outExitId] });

      // Add furnishings for Room 5 (Navigate Test)
      if (r === 5) {
        const bedId = createEntity({ name: "Bed", location: roomId }, entityBaseId);
        const lampId = createEntity({ name: "Lamp", location: roomId }, entityBaseId);
        const chairId = createEntity({ name: "Chair", location: roomId }, entityBaseId);
        updateEntity({
          ...getEntity(roomId)!,
          contents: [bedId, lampId, chairId],
        });
      }
    }
    updateEntity({ ...getEntity(westWingId)!, contents: westRoomIds });

    // East Wing: 51-99
    // Room 60 for East Wing Validation
    const eastRooms = [60];
    const eastRoomIds: number[] = [];
    for (const r of eastRooms) {
      const roomNumber = r;
      const roomId = createEntity(
        {
          name: `Room ${roomNumber}`,
          location: eastWingId,
          description: "A standard hotel room.",
          room_number: roomNumber,
          owner: null,
        },
        entityBaseId,
      );
      eastRoomIds.push(roomId);
      createCapability(roomId, "entity.control", { target_id: roomId });

      addVerb(
        roomId,
        "on_leave",
        transpile(
          extractVerb(verbsPath, "hotel_room_on_leave").replace(
            "HOTEL_LOBBY_ID_PLACEHOLDER",
            String(lobbyId),
          ),
        ),
      );

      const outExitId = createEntity(
        {
          name: "out",
          location: roomId,
          direction: "out",
          destination: eastWingId,
        },
        entityBaseId,
      );
      updateEntity({ ...getEntity(roomId)!, exits: [outExitId] });
    }
    updateEntity({ ...getEntity(eastWingId)!, contents: eastRoomIds });

    // Link Floor Lobby -> Elevator (enter)
    // Actually, elevator is "in" main lobby.
    // But we can have an "elevator" exit in Floor Lobby that teleports to Elevator?
    // The test does: CoreLib.call(caller, "move", "elevator")
    // So we need an exit named "elevator".
    const elevatorExitId = createEntity(
      {
        name: "elevator",
        location: floorLobbyId,
        direction: "elevator",
        destination: elevatorId,
      },
      entityBaseId,
    );
    const lobbyExitsFinal = getEntity(floorLobbyId)!["exits"] as number[];
    updateEntity({
      ...getEntity(floorLobbyId)!,
      exits: [...lobbyExitsFinal, elevatorExitId],
    });
  }

  // Update Elevator floors
  updateEntity({ ...getEntity(elevatorId)!, floors: elevatorFloors });

  // 4. NPCs
  const receptionistId = createEntity(
    {
      name: "Receptionist",
      location: lobbyId,
      description: "A friendly receptionist standing behind the desk.",
    },
    entityBaseId,
  );
  addVerb(receptionistId, "on_hear", transpile(extractVerb(verbsPath, "receptionist_on_hear")));

  const golemId = createEntity(
    {
      name: "Security Golem",
      location: lobbyId,
      description: "A massive stone golem guarding the entrance.",
    },
    entityBaseId,
  );
  addVerb(golemId, "on_hear", transpile(extractVerb(verbsPath, "golem_on_hear")));
}
