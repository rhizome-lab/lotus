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
  const verbsList = list.new_();
  const seen = obj.new_();

  const addVerbs = (entityId: number) => {
    const entityVerbs = verbs(entity(entityId));
    for (const v of entityVerbs) {
      const key = str.concat(v.name, ":", entityId);
      if (!obj.has(seen, key)) {
        obj.set(seen, key, true);
        obj.set(v, "source", entityId);
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
    const contents = obj.get(room, "contents", list.new_());
    for (const itemId of contents) {
      addVerbs(itemId);
    }
  }

  // 4. Inventory verbs
  const inventory = obj.get(player, "contents", list.new_());
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
  list.find(obj.get(location, "contents", list.new_()), (id: number) => {
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
  list.find(obj.get(location, "exits", list.new_()), (id: number) => {
    const props = resolve_props(entity(id));
    return props["name"] === query || props["direction"] === query;
  });
}
// @endverb

// @verb entity_base_on_enter
export function entity_base_on_enter() {
  const mover = arg<Entity>(0);
  const cap = get_capability("entity.control", { target_id: this_().id });
  if (cap) {
    const contents = obj.get(this_(), "contents", list.new_());
    list.push(contents, mover.id);
    set_entity(cap, obj.set(this_(), "contents", contents));
  } else {
    send("message", "The room refuses you.");
  }
}
// @endverb

// @verb entity_base_on_leave
export function entity_base_on_leave() {
  const mover = arg<Entity>(0);
  const cap = get_capability("entity.control", { target_id: this_().id });
  if (cap) {
    const contents = obj.get(this_(), "contents", list.new_());
    const newContents = list.filter(contents, (id: number) => id !== mover.id);
    set_entity(cap, obj.set(this_(), "contents", newContents));
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
          checkId = obj.get(checkEnt, "location", null);
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
          obj.set(mover, "location", destId);
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

// @verb entity_base_move
export function entity_base_move() {
  const direction = arg<string>(0);
  if (!direction) {
    send("message", "Where do you want to go?");
  } else {
    const exitId = call(this_(), "find_exit", direction);
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
    const contents = obj.get(room, "contents", list.new_());
    const exits = obj.get(room, "exits", list.new_());
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
  const contents = obj.get(player, "contents", list.new_());
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
      const newRoomData = obj.new_();
      obj.set(newRoomData, "name", roomName);
      const newRoomId = create(createCap, newRoomData);

      const exitData = obj.new_();
      obj.set(exitData, "name", direction);
      obj.set(exitData, "location", caller()["location"]);
      obj.set(exitData, "direction", direction);
      obj.set(exitData, "destination", newRoomId);
      const exitId = create(createCap, exitData);

      // The original code used template literals to inject the ID.
      // We can't do that with a static file unless we do a replace after extraction.
      // Let's use a placeholder and replace it in seed.ts.

      set_prototype(controlCap, entity(newRoomId), ENTITY_BASE_ID_PLACEHOLDER);

      const currentRoom = entity(caller()["location"] as number);
      const exits = obj.get(currentRoom, "exits", list.new_());
      list.push(exits, exitId);
      set_entity(controlCap, obj.set(currentRoom, "exits", exits));

      // Back exit
      const backExitData = obj.new_();
      obj.set(backExitData, "name", "back");
      obj.set(backExitData, "location", newRoomId);
      obj.set(backExitData, "direction", "back");
      obj.set(backExitData, "destination", caller()["location"]);
      const backExitId = create(createCap, backExitData);

      const newRoom = entity(newRoomId);
      const newExits = list.new_();
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
        set_entity(newRoomCap, obj.set(newRoom, "exits", newExits));
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
      const itemData = obj.new_();
      obj.set(itemData, "name", name);
      obj.set(itemData, "location", caller()["location"]);
      const itemId = create(createCap, itemData);
      set_prototype(controlCap, entity(itemId), ENTITY_BASE_ID_PLACEHOLDER);

      const room = entity(caller()["location"] as number);
      const contents = obj.get(room, "contents", list.new_());
      list.push(contents, itemId);
      set_entity(controlCap, obj.set(room, "contents", contents));

      send("message", str.concat("You create ", name, "."));
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
export function player_set() {
  const targetName = arg<string>(0);
  const propName = arg<string>(1);
  const value = arg<unknown>(2);
  if (!targetName || !propName) {
    send("message", "Usage: set <target> <prop> <value>");
  } else {
    const targetId = call(this_(), "find", targetName);
    if (targetId) {
      let controlCap = get_capability("entity.control", {
        target_id: targetId,
      });
      if (!controlCap) {
        controlCap = get_capability("entity.control", { "*": true });
      }
      if (controlCap) {
        set_entity(controlCap, obj.set(entity(targetId), propName, value));
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
export function teleporter_teleport() {
  const destId = obj.get(this_(), "destination");
  if (destId) {
    call(caller(), "teleport", entity(destId));
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
export function color_lib_random_color() {
  const colors = obj.get(this_(), "colors") as any[];
  list.get(colors, random(0, list.len(colors) - 1));
}
// @endverb

// @verb mood_ring_update_color
export function mood_ring_update_color() {
  const libId = obj.get(this_(), "color_lib") as number;
  const newColor = call(entity(libId), "random_color");
  const cap = get_capability("entity.control", { target_id: this_().id });
  if (cap) {
    set_entity(
      cap,
      obj.set(this_(), "adjectives", list.new_(str.concat("color:", newColor), "material:silver")),
    );
  }
  schedule("update_color", list.new_(), 5000);
}
// @endverb

// @verb mood_ring_touch
export function mood_ring_touch() {
  schedule("update_color", list.new_(), 0);
}
// @endverb

// @verb dynamic_ring_get_adjectives
export function dynamic_ring_get_adjectives() {
  list.new_(
    str.concat("color:hsl(", str.concat(mul(time.to_timestamp(time.now()), 0.1), ", 100%, 50%)")),
    "material:gold",
  );
}
// @endverb

// @verb special_watch_tick
export function special_watch_tick() {
  send("message", str.concat("Tick Tock: ", time.format(time.now(), "time")));
  schedule("tick", list.new_(), 10000);
}
// @endverb

// @verb special_watch_start
export function special_watch_start() {
  schedule("tick", list.new_(), 0);
}
// @endverb

// @verb clock_tick
export function clock_tick() {
  send("message", str.concat("BONG! It is ", time.format(time.now(), "time")));
  schedule("tick", list.new_(), 15000);
}
// @endverb

// @verb clock_start
export function clock_start() {
  schedule("tick", list.new_(), 0);
}
// @endverb

// @verb clock_tower_toll
export function clock_tower_toll() {
  send("message", str.concat("The Clock Tower tolls: ", time.format(time.now(), "time")));
  schedule("toll", list.new_(), 60000);
}
// @endverb

// @verb clock_tower_start
export function clock_tower_start() {
  schedule("toll", list.new_(), 0);
}
// @endverb

// @verb mailbox_deposit
export function mailbox_deposit() {
  send("message", "Deposit disabled.");
}
// @endverb

// @verb book_read
export function book_read() {
  const index = arg<number>(0);
  if (index === null) throw "Please specify a chapter index (0-based).";
  const chapters = obj.get(this_(), "chapters");
  const chapter = list.get(chapters, index);
  if (!chapter) throw "Chapter not found.";
  call(
    caller(),
    "tell",
    str.concat("Reading: ", obj.get(chapter, "title"), "\n\n", obj.get(chapter, "content")),
  );
}
// @endverb

// @verb book_list_chapters
export function book_list_chapters() {
  const chapters = obj.get(this_(), "chapters");
  call(
    caller(),
    "tell",
    str.concat(
      "Chapters:\n",
      str.join(
        list.map(chapters, (c: any) => obj.get(c, "title")),
        "\n",
      ),
    ),
  );
}
// @endverb

// @verb book_add_chapter
export function book_add_chapter() {
  const title = arg(0);
  const content = arg(1);
  if (!title || !content) throw "Usage: add_chapter <title> <content>";
  const chapters = obj.get(this_(), "chapters");
  const newChapter = {};
  obj.set(newChapter, "title", title);
  obj.set(newChapter, "content", content);
  list.push(chapters, newChapter);
  obj.set(this_(), "chapters", chapters);
  call(caller(), "tell", "Chapter added.");
}
// @endverb

// @verb book_search_chapters
export function book_search_chapters() {
  const query = str.lower(arg(0));
  const chapters = obj.get(this_(), "chapters");
  const results = list.filter(chapters, (c: any) => {
    return (
      str.includes(str.lower(obj.get(c, "title")), query) ||
      str.includes(str.lower(obj.get(c, "content")), query)
    );
  });
  call(
    caller(),
    "tell",
    str.concat(
      "Found ",
      list.len(results),
      " matches:\n",
      str.join(
        list.map(results, (c: any) => obj.get(c, "title")),
        "\n",
      ),
    ),
  );
}
// @endverb

declare const HOTEL_LOBBY_ID_PLACEHOLDER: number;

// @verb hotel_room_on_leave
export function hotel_room_on_leave() {
  const mover = arg<Entity>(0);
  const cap = get_capability("entity.control", { target_id: this_().id });
  if (cap) {
    const contents = obj.get(this_(), "contents", list.new_());
    const newContents = list.filter(contents, (id: number) => id !== mover.id);
    set_entity(cap, obj.set(this_(), "contents", newContents));

    // Auto-lock logic
    const occupants = list.len(newContents);
    if (occupants === 0) {
      // Reset owner
      set_entity(cap, obj.set(this_(), "owner", null));
      // Reset name
      const roomNumber = obj.get(this_(), "room_number");
      set_entity(cap, obj.set(this_(), "name", str.concat("Room ", roomNumber)));
      // Reset description
      set_entity(cap, obj.set(this_(), "description", "A standard hotel room."));

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
  send("message", str.concat("Room ", roomNumber, " is now available."));
}
// @endverb

// @verb hotel_room_leave_updated
export function hotel_room_leave_updated() {
  const mover = arg<Entity>(0);
  const cap = get_capability("entity.control", { target_id: this_().id });
  if (cap) {
    const contents = obj.get(this_(), "contents", list.new_());
    const newContents = list.filter(contents, (id: number) => id !== mover.id);
    set_entity(cap, obj.set(this_(), "contents", newContents));

    // Auto-lock logic
    const occupants = list.len(newContents);
    if (occupants === 0) {
      // Reset owner
      set_entity(cap, obj.set(this_(), "owner", null));
      // Reset name
      const roomNumber = obj.get(this_(), "room_number");
      set_entity(cap, obj.set(this_(), "name", str.concat("Room ", roomNumber)));
      // Reset description
      set_entity(cap, obj.set(this_(), "description", "A standard hotel room."));

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
export function elevator_push() {
  const floor = arg(0);
  obj.set(this_(), "current_floor", floor);
  set_entity(get_capability("entity.control", { target_id: this_().id })!, this_());
  call(caller(), "tell", str.concat("The elevator hums and moves to floor ", floor, "."));
}
// @endverb

// @verb elevator_move
export function elevator_move() {
  const direction = arg<string>(0);
  if (direction === "out") {
    const currentFloor = obj.get(this_(), "current_floor");
    const floors = obj.get(this_(), "floors", obj.new_());
    const destId = obj.get(floors, str.concat(currentFloor, ""));
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
export function wing_on_enter() {
  const mover = arg<Entity>(0);
  const cap = get_capability("entity.control", { target_id: this_().id });
  if (cap) {
    const contents = obj.get(this_(), "contents", list.new_());
    list.push(contents, mover.id);
    set_entity(cap, obj.set(this_(), "contents", contents));
    call(caller(), "tell", "You enter the hallway. It smells of carpet cleaner.");
  } else {
    send("message", "The wing is closed for cleaning.");
  }
}
// @endverb

// @verb wing_enter_room
export function wing_enter_room() {
  const roomNumber = arg<number>(0);
  if (!roomNumber) {
    send("message", "Which room?");
    return;
  }

  // Validate range based on wing name
  const name = obj.get(this_(), "name");
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
    send("message", str.concat("Room numbers in the ", wingType, " are ", min, "-", max));
    return;
  }

  const contents = obj.get(this_(), "contents", list.new_());
  const roomId = list.find(contents, (id: number) => {
    const props = resolve_props(entity(id));
    return obj.get(props, "room_number", 0) === roomNumber;
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
