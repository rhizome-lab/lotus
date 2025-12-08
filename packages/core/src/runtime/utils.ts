import {
  type Capability,
  type ScriptContext,
  ScriptError,
  createScriptContext,
  evaluate,
} from "@viwo/scripting";
import { getCapability, getVerbs } from "../repo";
import type { Entity } from "@viwo/shared/jsonrpc";

/**
 * Resolves dynamic properties on an entity by executing 'get_*' verbs.
 *
 * @param entity - The entity to resolve.
 * @param ctx - The script context.
 * @returns A new entity object with resolved properties.
 */
export function resolveProps(entity: Entity, ctx: ScriptContext): Entity {
  // We need to clone the props so we don't mutate the actual entity in the repo
  // entity is already a bag of props, so we clone it entirely
  const resolved = { ...entity };
  const verbs = getVerbs(entity.id);
  for (const verb of verbs) {
    const match = verb.name.match(/^get_(.+)/);
    if (!match?.[1]) {
      continue;
    }
    const [, propName] = match;
    try {
      const result = evaluate(
        verb.code,
        createScriptContext({
          caller: entity, // The entity itself is the caller for its own getter?
          get gas() {
            return ctx.gas ?? 1000;
          },
          set gas(value) {
            ctx.gas = value;
          },
          ops: ctx.ops,
          send: ctx.send ?? (() => {}),
          this: entity,
          warnings: ctx.warnings,
        }),
      );

      if (result !== undefined) {
        resolved[propName] = result;
      }
    } catch (error) {
      // Ignore errors in getters for now, or warn
      ctx.warnings.push(`Error resolving property ${propName} for ${entity.id}: ${error}`);
    }
  }
  return resolved;
}

export function checkCapability(
  cap: Capability | undefined,
  ownerId: number | number[],
  type: string,
  paramsMatch?: (params: Record<string, unknown>) => boolean,
) {
  if (!cap || typeof cap !== "object" || (cap as any).__brand !== "Capability") {
    throw new ScriptError(`Expected capability of type ${type}`);
  }

  const dbCap = getCapability(cap.id);
  if (!dbCap) {
    throw new ScriptError("Invalid capability");
  }

  if (Array.isArray(ownerId)) {
    if (!ownerId.includes(dbCap.owner_id)) {
      throw new ScriptError(
        `Capability not owned by caller (expected one of ${ownerId.join(", ")}, got ${
          dbCap.owner_id
        })`,
      );
    }
  } else if (dbCap.owner_id !== ownerId) {
    throw new ScriptError("Capability not owned by caller");
  }

  if (dbCap.type !== type) {
    throw new ScriptError(`Expected capability of type ${type}, got ${dbCap.type}`);
  }
  // Allow wildcard params (superuser)
  if (dbCap.params && dbCap.params["*"] === true) {
    return;
  }
  if (paramsMatch && !paramsMatch(dbCap.params)) {
    throw new ScriptError("Capability parameters do not match requirements");
  }
}
