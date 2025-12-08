import {
  type Capability,
  ScriptError,
  createScriptContext,
  defineFullOpcode,
  evaluate,
} from "@viwo/scripting";
import {
  type Verb,
  createCapability,
  createEntity,
  deleteEntity,
  getEntity,
  getPrototypeId,
  getVerb,
  getVerbs,
  setPrototypeId,
  updateEntity,
} from "../../repo";
import { checkCapability, resolveProps } from "../utils";
import type { Entity } from "@viwo/shared/jsonrpc";
import { scheduler } from "../../scheduler";

// Entity Interaction

/**
 * Creates a new entity.
 */
export const create = defineFullOpcode<[Capability | null, object], number>("create", {
  handler: ([capability, data], ctx) => {
    if (!capability) {
      throw new ScriptError("create: expected capability");
    }

    checkCapability(capability, ctx.this.id, "sys.create");

    const newId = createEntity(data as never);

    // Mint entity.control for the new entity and give to creator
    createCapability(ctx.this.id, "entity.control", { target_id: newId });

    return newId;
  },
  metadata: {
    category: "action",
    description: "Create a new entity (requires sys.create)",
    label: "Create",
    parameters: [
      {
        description: "Capability to use for creation",
        name: "capability",
        type: "Capability | null",
      },
      { description: "Initial data for the entity", name: "data", type: "object" },
    ],
    returnType: "number",
    slots: [
      { name: "Cap", type: "block" },
      { name: "Data", type: "block" },
    ],
  },
});

/** Destroys an entity. */
export const destroy = defineFullOpcode<[Capability | null, Entity], null>("destroy", {
  handler: ([capability, target], ctx) => {
    if (!capability) {
      throw new ScriptError("destroy: expected capability");
    }
    if (!target || typeof (target as Entity).id !== "number") {
      throw new ScriptError(`destroy: target must be an entity, got ${JSON.stringify(target)}`);
    }
    checkCapability(
      capability,
      ctx.this.id,
      "entity.control",
      (params) => params["target_id"] === (target as Entity).id,
    );
    deleteEntity((target as Entity).id);
    return null;
  },
  metadata: {
    category: "action",
    description: "Destroy an entity (requires entity.control)",
    label: "Destroy",
    parameters: [
      { description: "Capability to use.", name: "capability", type: "Capability | null" },
      { description: "The entity to destroy.", name: "target", type: "Entity" },
    ],
    returnType: "null",
    slots: [
      { name: "Cap", type: "block" },
      { name: "Target", type: "block" },
    ],
  },
});

/** Calls a verb on an entity. */
export const call = defineFullOpcode<[Entity, string, ...unknown[]], any>("call", {
  handler: ([target, verb, ...callArgs], ctx) => {
    const targetVerb = getVerb(target.id, verb);
    if (!targetVerb) {
      throw new ScriptError(`call: verb '${verb}' not found on ${target.id}`);
    }
    return evaluate(
      targetVerb.code,
      createScriptContext({
        args: callArgs,
        caller: ctx.caller,
        ops: ctx.ops,
        stack: [...(ctx.stack ?? []), { args: callArgs, name: verb }],
        this: target,
        warnings: ctx.warnings,
        ...(ctx.send ? { send: ctx.send } : {}),
      }),
    );
  },
  metadata: {
    category: "action",
    description: "Call a verb on an entity",
    label: "Call",
    parameters: [
      { description: "The entity to call.", name: "target", type: "Entity" },
      { description: "The verb to call.", name: "verb", type: "string" },
      { description: "Arguments to pass to the verb.", name: "...args", type: "any[]" },
    ],
    returnType: "any",
    slots: [
      { name: "Target", type: "block" },
      { name: "Verb", type: "string" },
      { name: "Args...", type: "block" },
    ],
  },
});

export const schedule = defineFullOpcode<[string, unknown[], number], null>("schedule", {
  handler: ([verb, callArgs, delay], ctx) => {
    scheduler.schedule(ctx.this.id, verb, callArgs, delay);
    return null;
  },
  metadata: {
    category: "action",
    description: "Schedule a verb call",
    label: "Schedule",
    parameters: [
      { description: "The verb to schedule.", name: "verb", type: "string" },
      { description: "Arguments to pass to the verb.", name: "args", type: "any[]" },
      { description: "Delay in milliseconds.", name: "delay", type: "number" },
    ],
    returnType: "null",
    slots: [
      { name: "Verb", type: "string" },
      { name: "Args", type: "block" },
      { name: "Delay", type: "number" },
    ],
  },
});

// Entity Introspection
/** Returns a list of verbs available on an entity. */
export const verbs = defineFullOpcode<[Entity], readonly Verb[]>("verbs", {
  handler: ([target], _ctx) => {
    if (!target || !("id" in target)) {
      return [];
    }
    return getVerbs(target.id);
  },
  metadata: {
    category: "world",
    description: "Get available verbs",
    label: "Verbs",
    parameters: [{ description: "The entity to get verbs from.", name: "target", type: "Entity" }],
    returnType: "Verb[]",
    slots: [{ name: "Target", type: "block" }],
  },
});

/** Returns a specific verb from an entity. */
export const get_verb = defineFullOpcode<[Entity, string], Verb | null>("get_verb", {
  handler: ([target, name], _ctx) => {
    if (!target || !("id" in target)) {
      return null;
    }
    return getVerb(target.id, name);
  },
  metadata: {
    category: "world",
    description: "Get specific verb",
    label: "Get Verb",
    parameters: [
      { description: "The entity to get the verb from.", name: "target", type: "Entity" },
      { description: "The name of the verb.", name: "name", type: "string" },
    ],
    returnType: "Verb | null",
    slots: [
      { name: "Target", type: "block" },
      { name: "Name", type: "string" },
    ],
  },
});

/** Retrieves an entity by ID. */
export const entity = defineFullOpcode<[number], Entity>("entity", {
  handler: ([id], _ctx) => {
    const entity = getEntity(id);
    if (!entity) {
      throw new ScriptError(`entity: entity ${id} not found`);
    }
    return entity;
  },
  metadata: {
    category: "world",
    description: "Get entity by ID",
    label: "Entity",
    parameters: [{ description: "The ID of the entity.", name: "id", type: "number" }],
    returnType: "Entity",
    slots: [{ name: "ID", type: "number" }],
  },
});

/** Updates one or more entities' properties transactionally. */
export const setEntity = defineFullOpcode<[Capability | null, Entity, object], Entity>(
  "set_entity",
  {
    handler: ([capability, entity, updates], ctx) => {
      if (!capability) {
        throw new ScriptError("set_entity: expected capability");
      }
      if (!entity || typeof (entity as Entity).id !== "number") {
        throw new ScriptError(`set_entity: expected entity object, got ${JSON.stringify(entity)}`);
      }
      if ("id" in updates) {
        throw new ScriptError("set_entity: cannot update 'id'");
      }
      const allowedOwners = [ctx.this.id];
      if (ctx.caller) {
        allowedOwners.push(ctx.caller.id);
      }
      checkCapability(
        capability,
        allowedOwners,
        "entity.control",
        (params) => params["target_id"] === (entity as Entity).id,
      );
      updateEntity({ id: (entity as Entity).id, ...updates });
      return { ...entity, ...updates };
    },
    metadata: {
      category: "action",
      description: "Update entity properties (requires entity.control)",
      label: "Update Entity",
      parameters: [
        { description: "Capability to use.", name: "capability", type: "Capability | null" },
        { description: "The entity to update.", name: "target", type: "Entity" },
        { description: "The properties to update.", name: "updates", type: "object" },
      ],
      returnType: "Entity",
      slots: [
        { name: "Cap", type: "block" },
        { name: "Entity", type: "block" },
        { name: "Updates", type: "block" },
      ],
    },
  },
);

/**
 * Gets the prototype ID of an entity.
 */
export const getPrototype = defineFullOpcode<[Entity], number | null>("get_prototype", {
  handler: ([entity], _ctx) => {
    if (!entity || typeof entity.id !== "number") {
      throw new ScriptError(`get_prototype: expected entity, got ${JSON.stringify(entity)}`);
    }
    return getPrototypeId(entity.id);
  },
  metadata: {
    category: "world",
    description: "Get entity prototype ID",
    label: "Get Prototype",
    parameters: [
      { description: "The entity to get the prototype of.", name: "target", type: "Entity" },
    ],
    returnType: "number | null",
    slots: [{ name: "Entity", type: "block" }],
  },
});

export const setPrototype = defineFullOpcode<[Capability | null, Entity, number | null], null>(
  "set_prototype",
  {
    handler: ([capability, entity, protoId], ctx) => {
      if (!capability) {
        throw new ScriptError("set_prototype: expected capability");
      }
      if (!entity || typeof entity.id !== "number") {
        throw new ScriptError(`set_prototype: expected entity, got ${JSON.stringify(entity)}`);
      }
      checkCapability(
        capability,
        ctx.this.id,
        "entity.control",
        (params) => params["target_id"] === entity.id,
      );
      if (protoId !== null && typeof protoId !== "number") {
        throw new ScriptError(
          `set_prototype: expected number or null for prototype ID, got ${JSON.stringify(protoId)}`,
        );
      }
      setPrototypeId(entity.id, protoId);
      return null;
    },
    metadata: {
      category: "action",
      description: "Set entity prototype (requires entity.control)",
      label: "Set Prototype",
      parameters: [
        { description: "Capability to use.", name: "capability", type: "Capability | null" },
        { description: "The entity to set the prototype of.", name: "target", type: "Entity" },
        { description: "The ID of the new prototype.", name: "prototypeId", type: "number" },
      ],
      returnType: "null",
      slots: [
        { name: "Cap", type: "block" },
        { name: "Entity", type: "block" },
        { name: "PrototypeID", type: "number" },
      ],
    },
  },
);

/** Resolves all properties of an entity, including dynamic ones. */
export const resolve_props = defineFullOpcode<[Entity], Entity>("resolve_props", {
  handler: ([entity], ctx) => resolveProps(entity, ctx),
  metadata: {
    category: "data",
    description: "Resolve entity properties",
    label: "Resolve Props",
    parameters: [
      { description: "The entity to resolve properties for.", name: "target", type: "Entity" },
    ],
    returnType: "Entity",
    slots: [{ name: "Entity", type: "block" }],
  },
});

/**
 * Executes a verb on an entity as if called by that entity (impersonation).
 * Restricted to System (ID 3) and Bot (ID 4).
 */
export const sudo = defineFullOpcode<[Capability | null, Entity, string, unknown[]], any>("sudo", {
  handler: ([capability, target, verb, evaluatedArgs], ctx) => {
    if (!capability) {
      throw new ScriptError("sudo: expected capability");
    }
    checkCapability(capability, ctx.this.id, "sys.sudo");
    if (!target || !("id" in target) || typeof target.id !== "number") {
      throw new ScriptError(`sudo: target must be an entity, got ${JSON.stringify(target)}`);
    }
    const targetVerb = getVerb(target.id, verb);
    if (!targetVerb) {
      console.log(getVerbs(target.id));
      throw new ScriptError(`sudo: verb '${verb}' not found on ${target.id}`);
    }
    // Capture send function to satisfy TS in closure
    const originalSend = ctx.send;
    const callerId = ctx.caller.id;
    // Execute with target as caller AND this
    // This effectively impersonates the user
    return evaluate(
      targetVerb.code,
      createScriptContext({
        args: evaluatedArgs,
        caller: target, // Impersonation
        ops: ctx.ops,
        stack: [...(ctx.stack ?? []), { args: evaluatedArgs, name: `sudo:${verb}` }],
        this: target,
        warnings: ctx.warnings,
        // If caller is Bot (4), wrap send to forward messages
        ...(originalSend
          ? {
              send: (type: string, payload: unknown) => {
                if (callerId === 4) {
                  originalSend("forward", {
                    payload,
                    target: target.id,
                    type,
                  });
                } else {
                  originalSend(type, payload);
                }
              },
            }
          : {}),
      }),
    );
  },
  metadata: {
    category: "system",
    description: "Execute verb as another entity (requires sys.sudo)",
    label: "Sudo",
    parameters: [
      { description: "Capability to use.", name: "capability", type: "Capability | null" },
      { description: "The entity to impersonate.", name: "target", type: "Entity" },
      { description: "The verb to call.", name: "verb", type: "string" },
      { description: "Arguments to pass to the verb.", name: "args", type: "any[]" },
    ],
    returnType: "any",
    slots: [
      { name: "Cap", type: "block" },
      { name: "Target", type: "block" },
      { name: "Verb", type: "string" },
      { name: "Args", type: "block" },
    ],
  },
});
