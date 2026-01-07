// Entity definitions for Bloom
// These are parsed by bloom-syntax-typescript, not executed as TypeScript

export class EntityBase {
  id = 0;
  name?: string = "Entity Base";
  description?: string = "The base of all things.";
  location?: number | null;
  contents?: number[];

  find(query: string) {
    const caller = entity(std.caller().id);
    const locationId = caller.location;
    const location = entity(locationId);
    const found = list.find(location.contents, (id: number) => {
      const props = entity(id);
      const match = props.name === query;
      return match;
    });
    return found;
  }

  on_enter(mover: any, _authCap: any) {
    const cap = get_capability("entity.control", { target_id: this.id });
    if (!cap) {
      send("message", "The room refuses you.");
      return;
    }
    const contents = this.contents ?? [];
    list.push(contents, mover.id);
    cap.update(this, { contents: contents });
  }

  on_leave(mover: any, _authCap: any) {
    const cap = get_capability("entity.control", { target_id: this.id });
    if (!cap) {
      send("message", "The room refuses you.");
      return;
    }
    const contents = this.contents ?? [];
    const newContents = list.filter(contents, (id: number) => id !== mover.id);
    cap.update(this, { contents: newContents });
  }

  teleport(destEntity: any) {
    if (!destEntity) {
      send("message", "Where do you want to teleport to?");
      return;
    }
    const destId = destEntity.id;
    if (!destId) {
      send("message", "Invalid destination.");
      return;
    }
    const mover = entity(std.caller().id);
    const oldLocId = mover.location;
    const oldLoc = entity(oldLocId);
    const newLoc = entity(destId);
    const selfCap = get_capability("entity.control", { target_id: mover.id });

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

  tell(msg: string) {
    send("message", msg);
  }

  look() {
    const location = entity(std.caller().location);
    const desc = location.description ?? "You see nothing special.";
    send("message", desc);
  }
}
