import {
  evaluateTarget,
  ScriptError,
  ScriptLibraryDefinition,
} from "../interpreter";
import { getEntity, getContents, getVerbs } from "../../repo";
import { checkPermission } from "../../permissions";

export const WorldLibrary: ScriptLibraryDefinition = {
  "world.time": async (args) => {
    if (args.length !== 0) {
      throw new ScriptError("world.time requires 0 arguments");
    }
    // Return a simulated world time (e.g. ticks or game time)
    // For now, just return Date.now()
    return Date.now();
  },
  "world.players": async (args, ctx) => {
    if (args.length !== 0) {
      throw new ScriptError("world.players requires 0 arguments");
    }
    // Return list of player IDs
    if (ctx.sys?.getAllEntities) {
      const all = ctx.sys.getAllEntities();
      const players = [];
      for (const id of all) {
        const entity = getEntity(id);
        if (entity?.kind === "ACTOR") {
          players.push(id);
        }
      }
      return players;
    }
    return [];
  },
  "world.entities": async (args, ctx) => {
    if (args.length !== 0) {
      throw new ScriptError("world.entities requires 0 arguments");
    }
    if (ctx.sys?.getAllEntities) {
      return ctx.sys.getAllEntities();
    }
    return [];
  },
  "world.where": async (args, ctx) => {
    if (args.length !== 1) {
      throw new ScriptError("world.where requires 1 argument");
    }
    const [targetExpr] = args;
    const target = await evaluateTarget(targetExpr, ctx);
    if (!target) return null;
    return target.location_id;
  },
  "entity.contents": async (args, ctx) => {
    const [targetExpr] = args;
    const target = await evaluateTarget(targetExpr, ctx);
    if (!target) return [];

    // Check permission
    if (!checkPermission(ctx.caller, target, "view")) {
      // Return empty list if cannot view container
      return [];
    }

    const contents = getContents(target.id);
    return contents.map((e) => e.id);
  },
  "entity.descendants": async (args, ctx) => {
    const [targetExpr] = args;
    const target = await evaluateTarget(targetExpr, ctx);
    if (!target) return [];

    // Check permission on root
    if (!checkPermission(ctx.caller, target, "view")) {
      return [];
    }

    const descendants: number[] = [];
    const queue = [target.id];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      // We might want to check permission for each container in the hierarchy?
      // For now, let's assume if you can view the root, you can view descendants?
      // Or maybe check view on each container as we traverse.
      // Let's check view on currentId before getting contents.

      // We need to fetch entity to check permission if it's not target
      let currentEntity = target;
      if (currentId !== target.id) {
        const { getEntity } = await import("../../repo");
        const e = getEntity(currentId);
        if (!e) continue;
        currentEntity = e;
        if (!checkPermission(ctx.caller, currentEntity, "view")) {
          continue; // Skip this branch
        }
      }

      const contents = getContents(currentId);
      for (const item of contents) {
        descendants.push(item.id);
        queue.push(item.id);
      }
    }
    return descendants;
  },
  "entity.ancestors": async (args, ctx) => {
    const [targetExpr] = args;
    let target = await evaluateTarget(targetExpr, ctx);
    if (!target) return [];

    const ancestors: number[] = [];
    while (target && target.location_id) {
      ancestors.push(target.location_id);
      target = getEntity(target.location_id);
    }
    return ancestors;
  },
  "entity.verbs": async (args, ctx) => {
    const [targetExpr] = args;
    const target = await evaluateTarget(targetExpr, ctx);
    if (!target) return [];

    if (!checkPermission(ctx.caller, target, "view")) {
      return [];
    }

    const verbs = getVerbs(target.id);
    return verbs.map((v) => v.name);
  },
  "player.verbs": async (_args, ctx) => {
    const player = ctx.caller;
    const verbs: { name: string; source: number }[] = [];
    const seen = new Set<string>();

    const addVerbs = (entityId: number) => {
      const entityVerbs = getVerbs(entityId);
      for (const v of entityVerbs) {
        const key = `${v.name}:${entityId}`;
        if (!seen.has(key)) {
          seen.add(key);
          verbs.push({ name: v.name, source: entityId });
        }
      }
    };

    // 1. Player verbs
    addVerbs(player.id);

    // 2. Room verbs
    if (player.location_id) {
      addVerbs(player.location_id);

      // 3. Items in Room
      const roomContents = getContents(player.location_id);
      for (const item of roomContents) {
        addVerbs(item.id);
      }
    }

    // 4. Inventory verbs
    const inventory = getContents(player.id);
    for (const item of inventory) {
      addVerbs(item.id);
    }

    return verbs;
  },
};
