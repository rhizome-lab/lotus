import "../generated_types";

export function bot_sudo() {
  const targetId = arg<number>(0);
  const verb = arg<string>(1);
  const argsList = arg<any[]>(2);
  sudo(get_capability("sys.sudo", {})!, entity(targetId), verb, argsList);
}

export function system_get_available_verbs() {
  const player = arg<Entity>(0);
  const verbsList: any[] = [];
  const seen: Record<string, boolean> = {};

  const addVerbs = (entityId: number) => {
    const entityVerbs = verbs(entity(entityId));
    for (const v of entityVerbs) {
      const key = `${v.name}:${entityId}`;
      if (!seen[key]) {
        seen[key] = true;
        (v as any)["source"] = entityId;
        list.push(verbsList, v);
      }
    }
  };

  // 1. Player verbs
  addVerbs(player.id);

  // 2. Room verbs
  const locationId = player["location"] as number;
  if (locationId) {
    addVerbs(locationId);

    // 3. Items in Room
    const room = entity(locationId);
    const contents = (room["contents"] as number[]) ?? [];
    for (const itemId of contents) {
      addVerbs(itemId);
    }
  }

  // 4. Inventory verbs
  const inventory = (player["contents"] as number[]) ?? [];
  for (const itemId of inventory) {
    addVerbs(itemId);
  }

  return verbsList;
}

export function entity_base_find() {
  const query = arg<string>(0);
  const locationId = caller()["location"] as number;
  const location = entity(locationId);
  list.find((location["contents"] as number[]) ?? [], (id: number) => {
    const props = resolve_props(entity(id));
    return props["name"] === query;
  });
}

export function entity_base_find_exit() {
  const query = arg<string>(0);
  const locationId = caller()["location"] as number;
  const location = entity(locationId);
  list.find((location["exits"] as number[]) ?? [], (id: number) => {
    const props = resolve_props(entity(id));
    return props["name"] === query || props["direction"] === query;
  });
}

export function entity_base_on_enter(this: Entity) {
  const mover = arg<Entity>(0);
  const cap = get_capability("entity.control", { target_id: this.id });
  if (cap) {
    const contents = (this["contents"] as number[]) ?? [];
    list.push(contents, mover.id);
    this["contents"] = contents;
    set_entity(cap, this);
  } else {
    send("message", "The room refuses you.");
  }
}

export function entity_base_on_leave(this: Entity) {
  const mover = arg<Entity>(0);
  const cap = get_capability("entity.control", { target_id: this.id });
  if (cap) {
    const contents = (this["contents"] as number[]) ?? [];
    const newContents = list.filter(contents, (id: number) => id !== mover.id);
    this["contents"] = newContents;
    set_entity(cap, this);
  } else {
    send("message", "The room refuses to let you go.");
  }
}

export function entity_base_teleport() {
  const destEntity = arg<Entity>(0);
  if (!destEntity) {
    send("message", "Where do you want to teleport to?");
  } else {
    const destId = destEntity.id;
    if (destId) {
      const mover = caller();
      let checkId: number | null = destId;
      let isRecursive = false;
      while (checkId) {
        if (checkId === mover.id) {
          isRecursive = true;
          checkId = null;
        } else {
          const checkEnt = entity(checkId);
          checkId = (checkEnt["location"] as number) || null;
        }
      }

      if (isRecursive) {
        send("message", "You can't put something inside itself.");
      } else {
        const oldLocId = mover["location"] as number;
        const oldLoc = entity(oldLocId);
        const newLoc = entity(destId);

        call(oldLoc, "on_leave", mover);
        call(newLoc, "on_enter", mover);

        const selfCap = get_capability("entity.control", {
          target_id: mover.id,
        });
        if (selfCap) {
          mover["location"] = destId;
          set_entity(selfCap, mover);
        } else {
          send("message", "You cannot move yourself.");
        }

        send("room_id", { roomId: destId });
        call(caller(), "look");
      }
    } else {
      send("message", "Invalid destination.");
    }
  }
}

export function entity_base_go(this: Entity) {
  const direction = arg<string>(0);
  if (!direction) {
    send("message", "Where do you want to go?");
  } else {
    const exitId = call(this, "find_exit", direction);
    if (exitId) {
      const destId = resolve_props(entity(exitId))["destination"] as number;
      call(caller(), "teleport", entity(destId));
    } else {
      send("message", "That way leads nowhere.");
    }
  }
}

export function entity_base_say() {
  send("message", "Say is not yet implemented.");
}

export function entity_base_tell() {
  const msg = arg<string>(0);
  send("message", msg);
}

export function player_look() {
  const argsList = args();
  if (list.empty(argsList)) {
    const room = resolve_props(entity(caller()["location"] as number));
    const contents = (room["contents"] as number[]) ?? [];
    const exits = (room["exits"] as number[]) ?? [];
    const resolvedContents = list.map(contents, (id: number) => resolve_props(entity(id)));
    const resolvedExits = list.map(exits, (id: number) => resolve_props(entity(id)));

    send("update", {
      entities: list.concat([room], list.concat(resolvedContents, resolvedExits)),
    });
  } else {
    const targetName = arg(0);
    const targetId = call(caller(), "find", targetName);
    if (targetId) {
      const target = resolve_props(entity(targetId));
      send("update", { entities: [target] });
    } else {
      send("message", "You don't see that here.");
    }
  }
}

export function player_inventory() {
  const player = resolve_props(caller());
  const contents = (player["contents"] as number[]) ?? [];
  const resolvedItems = list.map(contents, (id: number) => resolve_props(entity(id)));
  const finalList = list.concat([player], resolvedItems);
  send("update", { entities: finalList });
}

export function player_whoami() {
  send("player_id", { playerId: caller().id });
}

declare const ENTITY_BASE_ID_PLACEHOLDER: number;

export function player_dig() {
  const direction = arg(0);
  const roomName = str.join(list.slice(args(), 1), " ");
  if (!direction) {
    send("message", "Where do you want to dig?");
  } else {
    const createCap = get_capability("sys.create", {});
    let controlCap = get_capability("entity.control", {
      target_id: caller()["location"],
    });
    if (!controlCap) {
      controlCap = get_capability("entity.control", { "*": true });
    }

    if (createCap && controlCap) {
      const newRoomData: Record<string, any> = {};
      newRoomData["name"] = roomName;
      const newRoomId = create(createCap, newRoomData);

      const exitData: Record<string, any> = {};
      exitData["name"] = direction;
      exitData["location"] = caller()["location"];
      exitData["direction"] = direction;
      exitData["destination"] = newRoomId;
      const exitId = create(createCap, exitData);

      // The original code used template literals to inject the ID.
      // We can't do that with a static file unless we do a replace after extraction.
      // Let's use a placeholder and replace it in seed.ts.

      set_prototype(controlCap, entity(newRoomId), ENTITY_BASE_ID_PLACEHOLDER);

      const currentRoom = entity(caller()["location"] as number);
      const exits = (currentRoom["exits"] as number[]) ?? [];
      list.push(exits, exitId);
      currentRoom["exits"] = exits;
      set_entity(controlCap, currentRoom);

      // Back exit
      const backExitData: Record<string, any> = {};
      backExitData["name"] = "back";
      backExitData["location"] = newRoomId;
      backExitData["direction"] = "back";
      backExitData["destination"] = caller()["location"];
      const backExitId = create(createCap, backExitData);

      const newRoom = entity(newRoomId);
      const newExits: number[] = [];
      list.push(newExits, backExitId);

      // We need a capability to control the new room. We just created it, so we should have minted a capability?
      // create() mints a capability for the creator.
      // But we are the caller (player).
      // The player should have received the capability.
      // But here we are using controlCap which is for the CURRENT room.
      // We need the capability for the NEW room.
      // When we called create(createCap, newRoomData), it returned newRoomId.
      // And it gave the capability to the caller (player).
      // So the player has the capability.
      // We need to find it.

      const newRoomCap = get_capability("entity.control", {
        target_id: newRoomId,
      });
      if (newRoomCap) {
        newRoom["exits"] = newExits;
        set_entity(newRoomCap, newRoom);
      }

      send("message", "You dig a new room.");
      call(caller(), "teleport", entity(newRoomId));
    } else {
      send("message", "You cannot dig here.");
    }
  }
}

export function player_create() {
  const name = arg<string>(0);
  if (!name) {
    send("message", "What do you want to create?");
  } else {
    const createCap = get_capability("sys.create");
    let controlCap = get_capability("entity.control", {
      target_id: caller()["location"],
    });
    if (!controlCap) {
      controlCap = get_capability("entity.control", { "*": true });
    }

    if (createCap && controlCap) {
      const itemData: Record<string, any> = {};
      itemData["name"] = name;
      itemData["location"] = caller()["location"];
      const itemId = create(createCap, itemData);
      set_prototype(controlCap, entity(itemId), ENTITY_BASE_ID_PLACEHOLDER);

      const room = entity(caller()["location"] as number);
      const contents = (room["contents"] as number[]) ?? [];
      list.push(contents, itemId);
      room["contents"] = contents;
      set_entity(controlCap, room);

      send("message", `You create ${name}.`);
      call(caller(), "look");
      return itemId;
    } else {
      send("message", "You do not have permission to create here.");
    }
  }
  return;
}

export function player_set(this: Entity) {
  const targetName = arg<string>(0);
  const propName = arg<string>(1);
  const value = arg<unknown>(2);
  if (!targetName || !propName) {
    send("message", "Usage: set <target> <prop> <value>");
  } else {
    const targetId = call(this, "find", targetName);
    if (targetId) {
      let controlCap = get_capability("entity.control", {
        target_id: targetId,
      });
      if (!controlCap) {
        controlCap = get_capability("entity.control", { "*": true });
      }
      if (controlCap) {
        const target = entity(targetId);
        target[propName] = value;
        set_entity(controlCap, target);
        send("message", "Property set.");
      } else {
        send("message", "You do not have permission to modify this object.");
      }
    } else {
      send("message", "I don't see that here.");
    }
  }
}

export function watch_tell() {
  send("message", time.format(time.now(), "time"));
}

export function teleporter_teleport(this: Entity) {
  const destId = this["destination"];
  if (destId) {
    call(caller(), "teleport", entity(destId as number));
    send("message", "Whoosh! You have been teleported.");
  } else {
    send("message", "The stone is dormant.");
  }
}

export function status_check() {
  send("message", "Status check disabled.");
}

export function color_lib_random_color(this: Entity) {
  const colors = (this["colors"] as any[]) ?? [];
  list.get(colors, random(0, list.len(colors) - 1));
}

export function mood_ring_update_color(this: Entity) {
  const libId = this["color_lib"] as number;
  const newColor = call(entity(libId), "random_color");
  const cap = get_capability("entity.control", { target_id: this.id });
  if (cap) {
    this["adjectives"] = [`color:${newColor}`, "material:silver"];
    set_entity(cap, this);
  }
  schedule("update_color", [], 5000);
}

export function mood_ring_touch() {
  schedule("update_color", [], 0);
}

export function dynamic_ring_get_adjectives() {
  return [`color:hsl(${mul(time.to_timestamp(time.now()), 0.1)}, 100%, 50%)`, "material:gold"];
}

export function special_watch_tick() {
  send("message", `Tick Tock: ${time.format(time.now(), "time")}`);
  schedule("tick", [], 10000);
}

export function special_watch_start() {
  schedule("tick", [], 0);
}

export function clock_tick() {
  send("message", `BONG! It is ${time.format(time.now(), "time")}`);
  schedule("tick", [], 15000);
}

export function clock_start() {
  schedule("tick", [], 0);
}

export function clock_tower_toll() {
  send("message", `The Clock Tower tolls: ${time.format(time.now(), "time")}`);
  schedule("toll", [], 60000);
}

export function clock_tower_start() {
  schedule("toll", [], 0);
}

export function mailbox_deposit() {
  send("message", "Deposit disabled.");
}

export function book_read(this: Entity) {
  const index = arg<number>(0);
  if (index === null) throw "Please specify a chapter index (0-based).";
  const chapters = this["chapters"] as any[];
  const chapter = list.get(chapters, index);
  if (!chapter) throw "Chapter not found.";
  call(caller(), "tell", `Reading: ${chapter["title"]}\n\n${chapter["content"]}`);
}

export function book_list_chapters(this: Entity) {
  const chapters = this["chapters"] as any[];
  call(
    caller(),
    "tell",
    `Chapters:\n${str.join(
      list.map(chapters, (c: any) => c["title"]),
      "\n",
    )}`,
  );
}

export function book_add_chapter(this: Entity) {
  const title = arg(0);
  const content = arg(1);
  if (!title || !content) throw "Usage: add_chapter <title> <content>";
  const chapters = this["chapters"] as any[];
  const newChapter: Record<string, any> = {};
  newChapter["title"] = title;
  newChapter["content"] = content;
  list.push(chapters, newChapter);
  this["chapters"] = chapters;
  call(caller(), "tell", "Chapter added.");
}

export function book_search_chapters(this: Entity) {
  const query = str.lower(arg(0));
  const chapters = this["chapters"] as any[];
  const results = list.filter(chapters, (c: any) => {
    return (
      str.includes(str.lower(c["title"]), query) || str.includes(str.lower(c["content"]), query)
    );
  });
  call(
    caller(),
    "tell",
    `Found ${list.len(results)} matches:\n${str.join(
      list.map(results, (c: any) => c["title"]),
      "\n",
    )}`,
  );
}

declare const HOTEL_LOBBY_ID_PLACEHOLDER: number;
declare const HOTEL_ROOM_PROTO_ID_PLACEHOLDER: number;
declare const WING_PROTO_ID_PLACEHOLDER: number;

export function hotel_room_on_leave(this: Entity) {
  const mover = arg<Entity>(0);
  const cap = get_capability("entity.control", { target_id: this.id });
  if (cap) {
    const contents = (this["contents"] as number[]) ?? [];
    const newContents = list.filter(contents, (id: number) => id !== mover.id);
    this["contents"] = newContents;
    set_entity(cap, this);

    // Auto-lock logic
    const occupants = list.len(newContents);
    if (occupants === 0) {
      // Destroy room
      call(this, "destroy", this);
    }
  } else {
    send("message", "The room refuses to let you go.");
  }
}

export function hotel_lobby_room_vacated() {
  const roomNumber = arg<number>(0);
  send("message", `Room ${roomNumber} is now available.`);
}

export function hotel_room_leave_updated(this: Entity) {
  const mover = arg<Entity>(0);
  const cap = get_capability("entity.control", { target_id: this.id });
  if (cap) {
    const contents = (this["contents"] as number[]) ?? [];
    const newContents = list.filter(contents, (id: number) => id !== mover.id);
    this["contents"] = newContents;
    set_entity(cap, this);

    // Auto-lock logic
    const occupants = list.len(newContents);
    if (occupants === 0) {
      // Reset owner
      this["owner"] = null;
      // Reset name
      const roomNumber = this["room_number"];
      this["name"] = `Room ${roomNumber}`;
      // Reset description
      this["description"] = "A standard hotel room.";
      set_entity(cap, this);

      // Notify lobby
      const lobby = entity(HOTEL_LOBBY_ID_PLACEHOLDER);
      call(lobby, "room_vacated", roomNumber);
    }
  } else {
    send("message", "The room refuses to let you go.");
  }
}

export function elevator_push(this: Entity) {
  const floor = arg(0);
  this["current_floor"] = floor;
  set_entity(get_capability("entity.control", { target_id: this.id })!, this);
  call(caller(), "tell", `The elevator hums and moves to floor ${floor}.`);
}

export function elevator_go(this: Entity) {
  const direction = arg<string>(0);
  if (direction === "out") {
    const currentFloor = this["current_floor"];
    const floors = (this["floors"] as Record<string, number>) || {};
    let destId = floors[`${currentFloor}`];

    if (!destId) {
      // Create Floor on demand
      const createCap = get_capability("sys.create", {});
      const controlCap = get_capability("entity.control", {
        target_id: this.id,
      });

      if (createCap && controlCap) {
        // 1. Create Floor Lobby
        const lobbyData: Record<string, any> = {};
        lobbyData["name"] = `Floor ${currentFloor} Lobby`;
        lobbyData["location"] = ENTITY_BASE_ID_PLACEHOLDER; // Void
        lobbyData["description"] = `The lobby for the ${currentFloor}th floor.`;
        const lobbyId = create(createCap, lobbyData);
        set_prototype(createCap, entity(lobbyId), ENTITY_BASE_ID_PLACEHOLDER);

        // 2. Create West Wing
        const westData: Record<string, any> = {};
        westData["name"] = `Floor ${currentFloor} West Wing`;
        westData["location"] = ENTITY_BASE_ID_PLACEHOLDER;
        westData["description"] = `The West Wing of floor ${currentFloor}.`;
        const westId = create(createCap, westData);
        set_prototype(createCap, entity(westId), WING_PROTO_ID_PLACEHOLDER);

        // 3. Create East Wing
        const eastData: Record<string, any> = {};
        eastData["name"] = `Floor ${currentFloor} East Wing`;
        eastData["location"] = ENTITY_BASE_ID_PLACEHOLDER;
        eastData["description"] = `The East Wing of floor ${currentFloor}.`;
        const eastId = create(createCap, eastData);
        set_prototype(createCap, entity(eastId), WING_PROTO_ID_PLACEHOLDER);

        // 4. Link Lobby -> West
        const westExitData: Record<string, any> = {};
        westExitData["name"] = "west";
        westExitData["location"] = lobbyId;
        westExitData["direction"] = "west";
        westExitData["destination"] = westId;
        const westExitId = create(createCap, westExitData);

        // 5. Link West -> Lobby
        const westBackExitData: Record<string, any> = {};
        westBackExitData["name"] = "back";
        westBackExitData["location"] = westId;
        westBackExitData["direction"] = "back";
        westBackExitData["destination"] = lobbyId;
        const westBackExitId = create(createCap, westBackExitData);

        // 6. Link Lobby -> East
        const eastExitData: Record<string, any> = {};
        eastExitData["name"] = "east";
        eastExitData["location"] = lobbyId;
        eastExitData["direction"] = "east";
        eastExitData["destination"] = eastId;
        const eastExitId = create(createCap, eastExitData);

        // 7. Link East -> Lobby
        const eastBackExitData: Record<string, any> = {};
        eastBackExitData["name"] = "back";
        eastBackExitData["location"] = eastId;
        eastBackExitData["direction"] = "back";
        eastBackExitData["destination"] = lobbyId;
        const eastBackExitId = create(createCap, eastBackExitData);

        // 8. Link Lobby -> Elevator
        const elevatorExitData: Record<string, any> = {};
        elevatorExitData["name"] = "elevator";
        elevatorExitData["location"] = lobbyId;
        elevatorExitData["direction"] = "elevator";
        elevatorExitData["destination"] = this.id;
        const elevatorExitId = create(createCap, elevatorExitData);

        // Update Lobby Exits
        const lobby = entity(lobbyId);
        lobby["exits"] = [westExitId, eastExitId, elevatorExitId];
        // We (Elevator) have control of Lobby because we created it.
        const lobbyCap = get_capability("entity.control", {
          target_id: lobbyId,
        });
        set_entity(lobbyCap, lobby);

        // Update Wings Exits
        const westWing = entity(westId);
        westWing["exits"] = [westBackExitId];
        const westCap = get_capability("entity.control", { target_id: westId });
        set_entity(westCap, westWing);

        const eastWing = entity(eastId);
        eastWing["exits"] = [eastBackExitId];
        const eastCap = get_capability("entity.control", { target_id: eastId });
        set_entity(eastCap, eastWing);

        destId = lobbyId;
        floors[`${currentFloor}`] = destId;
        this["floors"] = floors;
        set_entity(controlCap, this);

        // Store wing IDs on the lobby so we can find them later for destruction
        lobby["wings"] = [westId, eastId];
        set_entity(lobbyCap, lobby);
      } else {
        send("message", "Elevator malfunction: Cannot create floor.");
        return;
      }
    }

    if (destId) {
      call(caller(), "teleport", entity(destId));
      send("message", "You step out of the elevator.");
    }
  } else {
    send("message", "You can only move 'out' of the elevator.");
  }
}

export function elevator_on_enter(this: Entity) {
  const floors = (this["floors"] as Record<string, number>) || {};
  const controlCap = get_capability("entity.control", { target_id: this.id });

  if (controlCap) {
    let i = 0;
    // Iterate 1 to 100 to find active floors
    while (i < 100) {
      i = i + 1;
      const f = String(i);
      const lobbyId = floors[f];
      if (lobbyId) {
        const lobby = entity(lobbyId);
        const lobbyContents = (lobby["contents"] as number[]) ?? [];

        // Check wings
        const wings = (lobby["wings"] as number[]) ?? [];
        let wingsEmpty = true;
        for (const wId of wings) {
          const wing = entity(wId);
          const wContents = (wing["contents"] as number[]) ?? [];
          if (list.len(wContents) > 0) {
            wingsEmpty = false;
          }
        }

        if (list.len(lobbyContents) === 0 && wingsEmpty) {
          // Destroy everything
          for (const wId of wings) {
            call(this, "destroy", entity(wId));
          }
          call(this, "destroy", lobby);

          // Remove from floors (set to null/undefined)
          // We can't delete keys, but we can set to null.
          // But the type is number.
          // We can set to 0? Or just leave it and check for truthiness?
          // If we set to 0, `if (destId)` will be false.
          floors[f] = 0;
        }
      }
    }
    this["floors"] = floors;
    set_entity(controlCap, this);
  }
}

export function wing_on_enter(this: Entity) {
  const mover = arg<Entity>(0);
  const cap = get_capability("entity.control", { target_id: this.id });
  if (cap) {
    const contents = (this["contents"] as number[]) ?? [];
    list.push(contents, mover.id);
    this["contents"] = contents;
    set_entity(cap, this);
    call(caller(), "tell", "You enter the hallway. It smells of carpet cleaner.");
  } else {
    send("message", "The wing is closed for cleaning.");
  }
}

export function wing_enter_room(this: Entity) {
  const roomNumber = arg<number>(0);
  if (!roomNumber) {
    send("message", "Which room?");
    return;
  }

  // Validate range based on wing name
  const name = this["name"] as string;
  let min = 0;
  let max = 0;
  if (str.includes(name, "West")) {
    min = 1;
    max = 50;
  } else if (str.includes(name, "East")) {
    min = 51;
    max = 99;
  }

  let wingType = "East Wing";
  if (str.includes(name, "West")) {
    wingType = "West Wing";
  }

  if (min > 0 && (roomNumber < min || roomNumber > max)) {
    send("message", `Room numbers in the ${wingType} are ${min}-${max}`);
    return;
  }

  const contents = (this["contents"] as number[]) ?? [];
  let roomId = list.find(contents, (id: number) => {
    const props = resolve_props(entity(id));
    return (props["room_number"] as number) === roomNumber;
  });

  if (!roomId) {
    // Create Room on demand
    const createCap = get_capability("sys.create", {});
    const controlCap = get_capability("entity.control", { target_id: this.id });

    if (createCap && controlCap) {
      const roomData: Record<string, any> = {};
      roomData["name"] = `Room ${roomNumber}`;
      roomData["location"] = this.id;
      roomData["description"] = "A standard hotel room.";
      roomData["room_number"] = roomNumber;
      roomData["owner"] = null;

      roomId = create(createCap, roomData);
      set_prototype(createCap, entity(roomId), HOTEL_ROOM_PROTO_ID_PLACEHOLDER);

      // Link Room -> Wing (out)
      const outExitData: Record<string, any> = {};
      outExitData["name"] = "out";
      outExitData["location"] = roomId;
      outExitData["direction"] = "out";
      outExitData["destination"] = this.id;
      const outExitId = create(createCap, outExitData);

      const room = entity(roomId);
      room["exits"] = [outExitId];
      const roomCap = get_capability("entity.control", { target_id: roomId });
      set_entity(roomCap, room);

      // Add 'on_leave' verb
      // Again, we need a prototype or a way to add verbs.
      // I will assume ROOM_BASE_ID_PLACEHOLDER exists.
      // set_prototype(createCap, entity(roomId), ROOM_BASE_ID_PLACEHOLDER);

      // Add to Wing contents
      list.push(contents, roomId);
      this["contents"] = contents;
      set_entity(controlCap, this);
    } else {
      send("message", "Cannot create room: Permission denied.");
      return;
    }
  }

  if (roomId) {
    call(caller(), "teleport", entity(roomId));
  } else {
    send("message", "Room not found.");
  }
}

export function receptionist_on_hear() {
  const speaker = arg<Entity>(0);
  const message = arg<string>(1);
  if (str.includes(str.lower(message), "room")) {
    call(speaker, "tell", "We have lovely rooms available on all floors.");
  }
}

export function golem_on_hear() {
  const speaker = arg<Entity>(0);
  const message = arg<string>(1);
  if (str.includes(str.lower(message), "hello")) {
    call(speaker, "tell", "GREETINGS. I AM GOLEM.");
  }
}

export function entity_base_get_llm_prompt(this: Entity) {
  let prompt = `You are ${this["name"]}.`;
  if (this["description"]) prompt += `\n${this["description"]}`;

  if (this["prose_mood"]) {
    prompt += `\n${this["prose_mood"]}`;
  } else if (this["mood"]) {
    prompt += `\nYou are feeling: ${this["mood"]}`;
  }

  if (this["prose_personality"]) {
    prompt += `\n${this["prose_personality"]}`;
  } else if (this["personality"]) {
    prompt += `\nYou behave like: ${this["personality"]}`;
  }
  return prompt;
}

export function entity_base_get_image_gen_prompt(this: Entity) {
  let parts: string[] = [];
  if (this["image_gen_prefix"]) parts.push(this["image_gen_prefix"] as string);
  if (this["description"]) parts.push(this["description"] as string);
  if (this["adjectives"]) parts.push(str.join(this["adjectives"] as string[], ", "));
  return str.join(parts, ", ");
}

import "../plugin_types";

export function director_tick(this: Entity) {
  // 1. Pick a target room (Lobby for now)
  // We can't easily find players without get_online_players or iterating everything.
  // So we'll just target the Lobby.
  // const lobbyId = call(this, "find", "Lobby"); // Director is in Void, Lobby is in Void.
  // Wait, Director is in Void. Lobby is in Void.
  // But 'find' searches 'contents' of location.
  // Director location is Void. Void contents includes Lobby.
  // So 'find' should work if Director has 'find' verb?
  // Director has 'entity.control' {*} so it can do anything?
  // No, 'find' is a verb on Entity Base. Director doesn't inherit from Entity Base?
  // Director was created with no prototype?
  // In seed.ts: createEntity({ name: "Director", ... }) -> no prototype specified?
  // createEntity defaults to null prototype if not specified?
  // Actually createEntity takes prototypeId as 2nd arg.
  // In seed.ts: const directorId = createEntity({...}); // No 2nd arg.
  // So Director has no verbs.
  // We added 'tick' and 'start' manually.

  // We need to find the Lobby ID.
  // We can hardcode it if we knew it, but we don't.
  // However, we can use 'entity(1)' if we assume Lobby is 1? No, Void is 1.
  // Let's assume we can't find it easily.
  // But wait, we are writing a script.
  // We can use `get_verb` to check if we have `find`.

  // Let's just try to find "Lobby" assuming we are in Void.
  // But Director is in Void.
  // We need 'find' verb.
  // Let's just iterate Void contents manually.
  const voidId = this["location"] as number;
  const voidEnt = entity(voidId);
  const contents = (voidEnt["contents"] as number[]) ?? [];

  let lobbyId: number | null = null;
  for (const id of contents) {
    const ent = resolve_props(entity(id));
    if (ent["name"] === "Lobby") {
      lobbyId = id;
      break;
    }
  }

  if (!lobbyId) {
    schedule("tick", [], 60000);
    return;
  }

  const room = resolve_props(entity(lobbyId));

  // 4. Generate ambient event
  const prompt = `Location: "${room["name"]}"
Description: "${room["description"]}"

Generate a single sentence of atmospheric prose describing a subtle event in this location.`;

  const eventText = ai.text("openai:gpt-3.5-turbo", prompt);

  // 5. Send to all players in the room
  const roomContents = (room["contents"] as number[]) ?? [];
  for (const id of roomContents) {
    try {
      const ent = entity(id);
      call(ent, "tell", `[Director] ${eventText}`);
    } catch {
      // Ignore
    }
  }

  // Schedule next tick
  const delay = random(20000, 60000);
  schedule("tick", [], delay);
}

export function director_start() {
  schedule("tick", [], 1000);
}

export function combat_start(this: Entity) {
  const participants = arg<Entity[]>(0);
  if (!participants || list.len(participants) < 2) {
    return null;
  }

  const createCap = get_capability("sys.create", {});
  const controlCap = get_capability("entity.control", { "*": true });

  if (!createCap || !controlCap) {
    send("message", "Combat Manager missing capabilities.");
    return null;
  }

  const participantIds = list.map(participants, (p: Entity) => p.id);

  const sessionData: Record<string, any> = {};
  sessionData["name"] = "Combat Session";
  sessionData["participants"] = participantIds;
  sessionData["turn_order"] = participantIds;
  sessionData["current_turn_index"] = 0;
  sessionData["round"] = 1;
  sessionData["location"] = this["location"];

  const sessionId = create(createCap, sessionData);
  return sessionId;
}

export function combat_next_turn(this: Entity) {
  const sessionId = arg<number>(0);
  const session = entity(sessionId);
  // Combat Manager needs control over the session it created
  const controlCap = get_capability("entity.control", { target_id: sessionId });

  if (!controlCap) return null;

  let index = session["current_turn_index"] as number;
  const order = session["turn_order"] as number[];

  let nextId: number | null = null;
  let attempts = 0;
  const maxAttempts = list.len(order);

  // Loop until we find someone who can act or run out of participants
  while (attempts < maxAttempts) {
    index = index + 1;
    if (index >= list.len(order)) {
      index = 0;
      const round = session["round"] as number;
      session["round"] = round + 1;
    }

    const candidateId = order[index];
    // Process status effects
    const canAct = call(this, "tick_status", entity(candidateId));

    if (canAct) {
      nextId = candidateId;
      break;
    } else {
      call(entity(candidateId), "tell", "You are unable to act this turn!");
    }

    attempts = attempts + 1;
  }

  session["current_turn_index"] = index;
  set_entity(controlCap, session);

  return nextId;
}

export function combat_apply_status(this: Entity) {
  const target = arg<Entity>(0);
  const effectEntity = arg<Entity>(1);
  const duration = arg<number>(2); // optional
  const magnitude = arg<number>(3); // optional
  // const source = arg<Entity>(4); // optional - unused for now

  if (!target || !effectEntity) return;

  const effectId = effectEntity.id;
  const effectKey = `${effectId}`;

  // Get existing effects
  const effects = (target["status_effects"] as Record<string, any>) ?? {};

  // Create new effect data
  const newEffect: Record<string, any> = {};
  newEffect["effect_id"] = effectId;
  if (duration !== null) newEffect["duration"] = duration;
  if (magnitude !== null) newEffect["magnitude"] = magnitude;

  // Update target
  // We need to mutate the dictionary. `effects` is a reference so modifying it works locally,
  // but we need to set it back on the entity.
  effects[effectKey] = newEffect;

  let controlCap = get_capability("entity.control", { target_id: target.id });
  if (!controlCap) {
    controlCap = get_capability("entity.control", { "*": true });
  }

  if (controlCap) {
    target["status_effects"] = effects;
    set_entity(controlCap, target);

    // Hook
    // Assuming all effects inherit from Effect Base and thus have the verbs
    call(effectEntity, "on_apply", target, newEffect);

    call(target, "tell", `Applied ${effectEntity["name"]}.`);
  }
}

export function combat_tick_status(this: Entity) {
  const target = arg<Entity>(0);
  if (!target) return true;

  const effects = (target["status_effects"] as Record<string, any>) ?? {};
  const effectKeys = obj.keys(effects);

  let canAct = true;
  let controlCap = get_capability("entity.control", { target_id: target.id });
  if (!controlCap) {
    controlCap = get_capability("entity.control", { "*": true });
  }

  if (!controlCap) return true; // Can't modify, so assume true?

  for (const key of effectKeys) {
    const effectData = effects[key];
    const effectId = effectData["effect_id"] as number;
    const effectEntity = entity(effectId);

    // Call on_tick
    // Expect on_tick to return false if the entity should skip turn
    const result = call(effectEntity, "on_tick", target, effectData);
    if (result === false) canAct = false;

    // Handle Duration
    if (effectData["duration"] !== undefined && effectData["duration"] !== null) {
      const d = effectData["duration"] as number;
      const newDuration = d - 1;
      effectData["duration"] = newDuration;

      if (newDuration <= 0) {
        call(effectEntity, "on_remove", target, effectData);
        obj.del(effects, key);
        call(target, "tell", `${effectEntity["name"]} wore off.`);
      }
    }
  }

  // Save changes
  target["status_effects"] = effects;
  set_entity(controlCap, target);

  return canAct;
}

export function effect_base_on_apply() {
  // No-op
}

export function effect_base_on_tick() {
  // Default: return true (can act)
  return true;
}

export function effect_base_on_remove() {
  // No-op
}

export function combat_attack(this: Entity) {
  const attacker = arg<Entity>(0);
  const target = arg<Entity>(1);

  const attProps = resolve_props(attacker);
  const defProps = resolve_props(target);

  const attack = (attProps["attack"] as number) ?? 10;
  const defense = (defProps["defense"] as number) ?? 0;

  let damage = attack - defense;
  if (damage < 1) damage = 1;

  const hp = (defProps["hp"] as number) ?? 100;
  const newHp = hp - damage;

  let targetCap = get_capability("entity.control", { target_id: target.id });
  if (!targetCap) {
    targetCap = get_capability("entity.control", { "*": true });
  }

  if (targetCap) {
    target["hp"] = newHp;
    set_entity(targetCap, target);

    call(attacker, "tell", `You attack ${defProps["name"]} for ${damage} damage!`);
    call(target, "tell", `${attProps["name"]} attacks you for ${damage} damage!`);

    if (newHp <= 0) {
      call(attacker, "tell", `${defProps["name"]} is defeated!`);
      call(target, "tell", "You are defeated!");
    }
  } else {
    call(
      attacker,
      "tell",
      `You attack ${defProps["name"]}, but it seems invulnerable (no permission).`,
    );
  }
}

export function combat_attack_elemental(this: Entity) {
  const attacker = arg<Entity>(0);
  const target = arg<Entity>(1);
  const elementArg = arg<string>(2);

  const attProps = resolve_props(attacker);
  const defProps = resolve_props(target);

  const element = elementArg ?? (attProps["element"] as string) ?? "normal";

  const attack = (attProps["attack"] as number) ?? 10;
  const defense = (defProps["defense"] as number) ?? 0;

  // Attacker Stats
  const attStats = (attProps["elemental_stats"] as Record<string, any>) ?? {};
  const attMod = (attStats[element] ? attStats[element]["attack_scale"] : 1.0) ?? 1.0;
  const finalAttack = attack * attMod;

  // Target Stats
  const defStats = (defProps["elemental_stats"] as Record<string, any>) ?? {};
  const defMod = (defStats[element] ? defStats[element]["defense_scale"] : 1.0) ?? 1.0;
  const resMod = (defStats[element] ? defStats[element]["damage_taken"] : 1.0) ?? 1.0;
  const finalDefense = defense * defMod;

  let baseDamage = finalAttack - finalDefense;
  if (baseDamage < 1) baseDamage = 1;

  const finalDamage = math.floor(baseDamage * resMod);

  const hp = (defProps["hp"] as number) ?? 100;
  const newHp = hp - finalDamage;

  let targetCap = get_capability("entity.control", { target_id: target.id });
  if (!targetCap) {
    targetCap = get_capability("entity.control", { "*": true });
  }

  if (targetCap) {
    target["hp"] = newHp;
    set_entity(targetCap, target);

    let msg = `You attack ${defProps["name"]} with ${element} for ${finalDamage} damage!`;
    if (resMod > 1.0) msg += " It's super effective!";
    if (resMod < 1.0 && resMod > 0) msg += " It's not very effective...";
    if (resMod === 0) msg += " It had no effect!";

    call(attacker, "tell", msg);
    call(
      target,
      "tell",
      `${attProps["name"]} attacks you with ${element} for ${finalDamage} damage!`,
    );

    if (newHp <= 0) {
      call(attacker, "tell", `${defProps["name"]} is defeated!`);
      call(target, "tell", "You are defeated!");
    }
  } else {
    call(
      attacker,
      "tell",
      `You attack ${defProps["name"]}, but it seems invulnerable (no permission).`,
    );
  }
}

export function combat_test(this: Entity) {
  const warrior = arg<Entity>(0);
  const orc = arg<Entity>(1);

  if (!warrior || !orc) {
    send("message", "Usage: test <warrior> <orc>");
    return;
  }

  const sessionId = call(this, "start", [warrior, orc]);
  send("message", `Combat started! Session: ${sessionId}`);

  const firstId = call(this, "next_turn", sessionId);
  const first = entity(firstId);
  send("message", `Turn: ${first["name"]}`);

  const target = first.id === warrior.id ? orc : warrior;

  // Apply poison if available
  const poisonId = this["poison_effect"] as number;
  if (poisonId) {
    call(this, "apply_status", target, entity(poisonId), 3, 5);
    send("message", `Debug: Applied Poison to ${target["name"]}`);
  }

  // Just call attack - the seed will determine if it's elemental or not
  call(this, "attack", first, target);
}

export function poison_on_tick(this: Entity) {
  const target = arg<Entity>(0);
  const data = arg<Record<string, any>>(1);

  const magnitude = (data["magnitude"] as number) ?? 5;

  // Deal damage
  const hp = (resolve_props(target)["hp"] as number) ?? 100;
  const newHp = hp - magnitude;

  let controlCap = get_capability("entity.control", { target_id: target.id });
  if (!controlCap) {
    controlCap = get_capability("entity.control", { "*": true });
  }

  if (controlCap) {
    target["hp"] = newHp;
    set_entity(controlCap, target);
    call(target, "tell", `You take ${magnitude} poison damage!`);

    if (newHp <= 0) {
      call(target, "tell", "You succumbed to poison!");
    }
  }

  return true;
}

export function regen_on_tick(this: Entity) {
  const target = arg<Entity>(0);
  const data = arg<Record<string, any>>(1);

  const magnitude = (data["magnitude"] as number) ?? 5;

  // Heal
  const hp = (resolve_props(target)["hp"] as number) ?? 100;
  const maxHp = (resolve_props(target)["max_hp"] as number) ?? 100;

  let newHp = hp + magnitude;
  if (newHp > maxHp) newHp = maxHp;

  let controlCap = get_capability("entity.control", { target_id: target.id });
  if (!controlCap) {
    controlCap = get_capability("entity.control", { "*": true });
  }

  if (controlCap) {
    target["hp"] = newHp;
    set_entity(controlCap, target);
    call(target, "tell", `You regenerate ${magnitude} HP.`);
  }

  return true;
}
