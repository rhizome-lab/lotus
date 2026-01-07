// oxlint-disable-next-line no-unassigned-import
import "../../generated_types";

export class EntityBase implements Entity {
  id = 0;
  name?: string = "Entity Base";
  description?: string = "The base of all things.";
  location?: number | null;
  contents?: number[];
  exits?: number[];
  destination?: number;
  direction?: string;
  [key: string]: unknown;

  find(query: string) {
    // Use entity(id) to get a fresh copy with all properties from the database
    const caller = entity(std.caller().id) as EntityBase;
    const locationId = caller.location;
    const location = entity(locationId!) as EntityBase;
    const found = list.find(location.contents ?? [], (id: number) => {
      const props = resolve_props(entity(id)) as EntityBase;
      const match = props.name === query;
      return match;
    });
    return found;
  }

  find_exit(direction: string) {
    // Use entity(id) to get a fresh copy with all properties from the database
    const caller = entity(std.caller().id) as EntityBase;
    const location = resolve_props(entity(caller.location!)) as EntityBase;
    const exits = location.exits ?? [];
    return list.find(exits, (id: number) => (entity(id) as EntityBase).name === direction);
  }

  on_enter(mover: Entity, authCap: EntityControl | null) {
    const cap = get_capability("entity.control", { target_id: this.id }) ?? authCap;
    if (!cap) {
      send("message", "The room refuses you.");
      return;
    }
    const contents = this.contents ?? [];
    list.push(contents, mover.id);
    cap.update(this, { contents: contents });
  }

  on_leave(mover: Entity, authCap: EntityControl | null) {
    const cap = get_capability("entity.control", { target_id: this.id }) ?? authCap;
    if (!cap) {
      send("message", "The room refuses you.");
      return;
    }
    const contents = this.contents ?? [];
    const newContents = list.filter(contents, (id: number) => id !== mover.id);
    cap.update(this, { contents: newContents });
  }

  teleport(destEntity: Entity) {
    if (!destEntity) {
      send("message", "Where do you want to teleport to?");
      return;
    }
    const destId = destEntity.id;
    if (!destId) {
      send("message", "Invalid destination.");
      return;
    }
    // Use entity(id) to get a fresh copy with all properties from the database
    const mover = entity(std.caller().id) as EntityBase;
    let checkId: number | null = destId;
    let isRecursive = false;
    while (checkId) {
      if (checkId === mover.id) {
        isRecursive = true;
        checkId = null;
      } else {
        const checkEnt = entity(checkId) as EntityBase;
        // Break infinite loop if entity is its own location (e.g. Void)
        // Use bracket notation to get null default for missing properties
        const entLocation = checkEnt["location"] as number | null;
        if (entLocation === checkId || entLocation === null || entLocation === undefined) {
          checkId = null;
        } else {
          checkId = entLocation;
        }
      }
    }

    if (isRecursive) {
      send("message", "You can't put something inside itself.");
      return;
    }
    const oldLocId = mover.location!;
    const oldLoc = entity(oldLocId);
    const newLoc = entity(destId);
    const selfCap =
      get_capability("entity.control", { target_id: mover.id }) ??
      get_capability("entity.control", { "*": true });

    // Pass selfCap to authorize the room modification
    call(oldLoc, "on_leave", mover, selfCap);
    call(newLoc, "on_enter", mover, selfCap);
    if (!selfCap) {
      send("message", "You cannot move yourself.");
      return;
    }
    selfCap.update(mover, { location: destId });
    send("room_id", { roomId: destId });
    call(std.caller(), "look");
  }

  go(direction: string) {
    if (!direction) {
      send("message", "Where do you want to go?");
    } else {
      const exitId = call(this, "find_exit", direction);
      if (exitId) {
        const destId = (resolve_props(entity(exitId)) as EntityBase).destination!;
        call(std.caller(), "teleport", entity(destId));
      } else {
        send("message", "That way leads nowhere.");
      }
    }
  }

  say() {
    send("message", "Say is not yet implemented.");
  }

  tell(msg: string) {
    send("message", msg);
  }

  get_llm_prompt() {
    let prompt = `You are ${this.name}.`;
    if (this.description) {
      prompt += `\n${this.description}`;
    }

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

  get_image_gen_prompt() {
    let parts: string[] = [];
    if (this["image_gen_prefix"]) {
      parts.push(this["image_gen_prefix"] as string);
    }
    if (this.description) {
      parts.push(this.description);
    }
    const adjectives = this["adjectives"] as string[];
    if (adjectives) {
      parts.push(str.join(adjectives, ", "));
    }
    return str.join(parts, ", ");
  }
}
