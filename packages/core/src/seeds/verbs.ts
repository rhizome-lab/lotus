import "../types";

// @verb bot_sudo
export function bot_sudo() {
  const targetId = arg<number>(0);
  const verb = arg<string>(1);
  const argsList = arg<any[]>(2);
  sudo(get_capability("sys.sudo", {})!, entity(targetId), verb, argsList);
}
// @endverb

// @verb system_get_available_verbs
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
// @endverb

// @verb entity_base_find
export function entity_base_find() {
  const query = arg<string>(0);
  const locationId = caller()["location"] as number;
  const location = entity(locationId);
  list.find((location["contents"] as number[]) ?? [], (id: number) => {
    const props = resolve_props(entity(id));
    return props["name"] === query;
  });
}
// @endverb

// @verb entity_base_find_exit
export function entity_base_find_exit() {
  const query = arg<string>(0);
  const locationId = caller()["location"] as number;
  const location = entity(locationId);
  list.find((location["exits"] as number[]) ?? [], (id: number) => {
    const props = resolve_props(entity(id));
    return props["name"] === query || props["direction"] === query;
  });
}
// @endverb

// @verb entity_base_on_enter
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
// @endverb

// @verb entity_base_on_leave
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
// @endverb

// @verb entity_base_teleport
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
// @endverb

// @verb entity_base_go
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
// @endverb

// @verb entity_base_say
export function entity_base_say() {
  send("message", "Say is not yet implemented.");
}
// @endverb

// @verb entity_base_tell
export function entity_base_tell() {
  const msg = arg<string>(0);
  send("message", msg);
}
// @endverb

// @verb player_look
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
// @endverb

// @verb player_inventory
export function player_inventory() {
  const player = resolve_props(caller());
  const contents = (player["contents"] as number[]) ?? [];
  const resolvedItems = list.map(contents, (id: number) => resolve_props(entity(id)));
  const finalList = list.concat([player], resolvedItems);
  send("update", { entities: finalList });
}
// @endverb

// @verb player_whoami
export function player_whoami() {
  send("player_id", { playerId: caller().id });
}
// @endverb

declare const ENTITY_BASE_ID_PLACEHOLDER: number;

// @verb player_dig
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
// @endverb

// @verb player_create
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
// @endverb

// @verb player_set
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
// @endverb

// @verb watch_tell
export function watch_tell() {
  send("message", time.format(time.now(), "time"));
}
// @endverb

// @verb teleporter_teleport
export function teleporter_teleport(this: Entity) {
  const destId = this["destination"];
  if (destId) {
    call(caller(), "teleport", entity(destId as number));
    send("message", "Whoosh! You have been teleported.");
  } else {
    send("message", "The stone is dormant.");
  }
}
// @endverb

// @verb status_check
export function status_check() {
  send("message", "Status check disabled.");
}
// @endverb

// @verb color_lib_random_color
export function color_lib_random_color(this: Entity) {
  const colors = (this["colors"] as any[]) ?? [];
  list.get(colors, random(0, list.len(colors) - 1));
}
// @endverb

// @verb mood_ring_update_color
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
// @endverb

// @verb mood_ring_touch
export function mood_ring_touch() {
  schedule("update_color", [], 0);
}
// @endverb

// @verb dynamic_ring_get_adjectives
export function dynamic_ring_get_adjectives() {
  return [`color:hsl(${mul(time.to_timestamp(time.now()), 0.1)}, 100%, 50%)`, "material:gold"];
}
// @endverb

// @verb special_watch_tick
export function special_watch_tick() {
  send("message", `Tick Tock: ${time.format(time.now(), "time")}`);
  schedule("tick", [], 10000);
}
// @endverb

// @verb special_watch_start
export function special_watch_start() {
  schedule("tick", [], 0);
}
// @endverb

// @verb clock_tick
export function clock_tick() {
  send("message", `BONG! It is ${time.format(time.now(), "time")}`);
  schedule("tick", [], 15000);
}
// @endverb

// @verb clock_start
export function clock_start() {
  schedule("tick", [], 0);
}
// @endverb

// @verb clock_tower_toll
export function clock_tower_toll() {
  send("message", `The Clock Tower tolls: ${time.format(time.now(), "time")}`);
  schedule("toll", [], 60000);
}
// @endverb

// @verb clock_tower_start
export function clock_tower_start() {
  schedule("toll", [], 0);
}
// @endverb

// @verb mailbox_deposit
export function mailbox_deposit() {
  send("message", "Deposit disabled.");
}
// @endverb

// @verb book_read
export function book_read(this: Entity) {
  const index = arg<number>(0);
  if (index === null) throw "Please specify a chapter index (0-based).";
  const chapters = this["chapters"] as any[];
  const chapter = list.get(chapters, index);
  if (!chapter) throw "Chapter not found.";
  call(caller(), "tell", `Reading: ${chapter["title"]}\n\n${chapter["content"]}`);
}
// @endverb

// @verb book_list_chapters
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
// @endverb

// @verb book_add_chapter
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
// @endverb

// @verb book_search_chapters
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
// @endverb

declare const HOTEL_LOBBY_ID_PLACEHOLDER: number;

// @verb hotel_room_on_leave
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
// @endverb

// @verb hotel_lobby_room_vacated
export function hotel_lobby_room_vacated() {
  const roomNumber = arg<number>(0);
  send("message", `Room ${roomNumber} is now available.`);
}
// @endverb

// @verb hotel_room_leave_updated
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
// @endverb

// @verb elevator_push
export function elevator_push(this: Entity) {
  const floor = arg(0);
  this["current_floor"] = floor;
  set_entity(get_capability("entity.control", { target_id: this.id })!, this);
  call(caller(), "tell", `The elevator hums and moves to floor ${floor}.`);
}
// @endverb

// @verb elevator_go
export function elevator_go(this: Entity) {
  const direction = arg<string>(0);
  if (direction === "out") {
    const currentFloor = this["current_floor"];
    const floors = (this["floors"] as Record<string, number>) || {};
    const destId = floors[`${currentFloor}`];
    if (destId) {
      call(caller(), "teleport", entity(destId));
      send("message", "You step out of the elevator.");
    } else {
      send("message", "The doors refuse to open here.");
    }
  } else {
    send("message", "You can only move 'out' of the elevator.");
  }
}
// @endverb

// @verb wing_on_enter
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
// @endverb

// @verb wing_enter_room
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
  const roomId = list.find(contents, (id: number) => {
    const props = resolve_props(entity(id));
    return (props["room_number"] as number) === roomNumber;
  });

  if (roomId) {
    call(caller(), "teleport", entity(roomId));
  } else {
    send("message", "Room not found.");
  }
}
// @endverb

// @verb receptionist_on_hear
export function receptionist_on_hear() {
  const speaker = arg<Entity>(0);
  const message = arg<string>(1);
  if (str.includes(str.lower(message), "room")) {
    call(speaker, "tell", "We have lovely rooms available on all floors.");
  }
}
// @endverb

// @verb golem_on_hear
export function golem_on_hear() {
  const speaker = arg<Entity>(0);
  const message = arg<string>(1);
  if (str.includes(str.lower(message), "hello")) {
    call(speaker, "tell", "GREETINGS. I AM GOLEM.");
  }
}
// @endverb
