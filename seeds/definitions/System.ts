// oxlint-disable-next-line no-unassigned-import
import "../../generated_types";
import { EntityBase } from "./EntityBase";
import type { Player } from "./Player";

export class System extends EntityBase {
  get_available_verbs(player: Player) {
    const verbsList: any[] = [];
    const seen: Record<string, boolean> = {};

    const addVerbs = (entityId: number) => {
      const entityVerbs = verbs(entity(entityId));
      for (const verb of entityVerbs) {
        const key = `${verb.name}:${entityId}`;
        if (!seen[key]) {
          seen[key] = true;
          (verb as any)["source"] = entityId;
          list.push(verbsList, verb);
        }
      }
    };

    // 1. Player verbs
    addVerbs(player.id);

    // 2. Room verbs
    const locationId = player.location;
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
}

export class DiscordBot implements Entity {
  id!: number;
  prototype_id!: number | null;
  [key: string]: unknown;

  sudo(targetId: number, verb: string, argsList: any[]) {
    const sudo = get_capability("sys.sudo", {});
    if (!sudo) {
      send("message", "You do not have sudo access.");
      return;
    }
    sudo.exec(entity(targetId), verb, argsList);
  }
}
