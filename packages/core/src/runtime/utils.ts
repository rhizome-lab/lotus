import { getVerbs } from "../repo";
import { Entity } from "@viwo/shared/jsonrpc";
import { evaluate, ScriptContext } from "@viwo/scripting";

/**
 * Resolves dynamic properties on an entity by executing 'get_*' verbs.
 *
 * @param entity - The entity to resolve.
 * @param ctx - The script context.
 * @returns A new entity object with resolved properties.
 */
export function resolveProps(entity: Entity, ctx: ScriptContext): Entity {
  if (!ctx.send) {
    return entity;
  }

  // We need to clone the props so we don't mutate the actual entity in the repo
  // entity is already a bag of props, so we clone it entirely
  const resolved = { ...entity };

  const verbs = getVerbs(entity.id);
  for (const verb of verbs) {
    const match = verb.name.match(/^get_(.+)/);
    if (!match?.[1]) continue;
    const propName = match[1];
    try {
      const result = evaluate(verb.code, {
        caller: entity, // The entity itself is the caller for its own getter?
        this: entity,
        args: [],
        get gas() {
          return ctx.gas ?? 1000;
        },
        set gas(value) {
          ctx.gas = value;
        },
        send: ctx.send,
        warnings: ctx.warnings,
        vars: {},
        stack: [],
      });

      if (result !== undefined) {
        resolved[propName] = result;
      }
    } catch (error) {
      // Ignore errors in getters for now, or warn
      ctx.warnings.push(
        `Error resolving property ${propName} for ${entity.id}: ${error}`,
      );
    }
  }

  return resolved;
}

import { getCapability } from "../repo";
import { ScriptError, Capability } from "@viwo/scripting";

export function checkCapability(
  cap: Capability | undefined,
  ownerId: number,
  type: string,
  paramsMatch?: (params: Record<string, unknown>) => boolean,
) {
  if (
    !cap ||
    typeof cap !== "object" ||
    (cap as any).__brand !== "Capability"
  ) {
    throw new ScriptError(`Expected capability of type ${type}`);
  }

  const dbCap = getCapability(cap.id);
  if (!dbCap) {
    throw new ScriptError("Invalid capability");
  }

  if (dbCap.owner_id !== ownerId) {
    throw new ScriptError("Capability not owned by caller");
  }

  if (dbCap.type !== type) {
    throw new ScriptError(
      `Expected capability of type ${type}, got ${dbCap.type}`,
    );
  }
  // Allow wildcard params (superuser)
  if (dbCap.params && dbCap.params["*"] === true) {
    return;
  }
  if (paramsMatch && !paramsMatch(dbCap.params)) {
    throw new ScriptError("Capability parameters do not match requirements");
  }
}
