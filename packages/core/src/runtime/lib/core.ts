import {
  evaluate,
  ScriptError,
  createScriptContext,
  defineFullOpcode,
  Capability,
} from "@viwo/scripting";
import {
  createEntity,
  deleteEntity,
  getEntity,
  getPrototypeId,
  getVerbs,
  setPrototypeId,
  updateEntity,
  Verb,
  getVerb,
  createCapability,
} from "../../repo";
import { scheduler } from "../../scheduler";
import { checkCapability, resolveProps } from "../utils";
import { Entity } from "@viwo/shared/jsonrpc";

// Entity Interaction

/**
 * Creates a new entity.
 */
export const create = defineFullOpcode<[Capability | null, object], number>("create", {
  metadata: {
    label: "Create",
    category: "action",
    description: "Create a new entity (requires sys.create)",
    slots: [
      { name: "Cap", type: "block" },
      { name: "Data", type: "block" },
    ],
    parameters: [
      { name: "cap", type: "Capability | null", description: "Capability to use for creation" },
      { name: "data", type: "object", description: "Initial data for the entity" },
    ],
    returnType: "number",
  },
  handler: ([cap, data], ctx) => {
    if (!cap) {
      throw new ScriptError("create: expected capability");
    }

    checkCapability(cap as Capability, ctx.this.id, "sys.create");

    const newId = createEntity(data as never);

    // Mint entity.control for the new entity and give to creator
    createCapability(ctx.this.id, "entity.control", { target_id: newId });

    return newId;
  },
});

/** Destroys an entity. */
export const destroy = defineFullOpcode<[Capability | null, Entity], null>("destroy", {
  metadata: {
    label: "Destroy",
    category: "action",
    description: "Destroy an entity (requires entity.control)",
    slots: [
      { name: "Cap", type: "block" },
      { name: "Target", type: "block" },
    ],
    parameters: [
      { name: "cap", type: "Capability | null", description: "Capability to use." },
      { name: "target", type: "Entity", description: "The entity to destroy." },
    ],
    returnType: "null",
  },
  handler: ([cap, target], ctx) => {
    if (!cap) {
      throw new ScriptError("destroy: expected capability");
    }

    if (!target || typeof (target as Entity).id !== "number") {
      throw new ScriptError(`destroy: target must be an entity, got ${JSON.stringify(target)}`);
    }

    checkCapability(cap as Capability, ctx.this.id, "entity.control", (params) => {
      return params["target_id"] === (target as Entity).id;
    });

    deleteEntity((target as Entity).id);
    return null;
  },
});

/** Calls a verb on an entity. */
export const call = defineFullOpcode<[Entity, string, ...unknown[]], any>("call", {
  metadata: {
    label: "Call",
    category: "action",
    description: "Call a verb on an entity",
    slots: [
      { name: "Target", type: "block" },
      { name: "Verb", type: "string" },
      { name: "Args...", type: "block" },
    ],
    parameters: [
      { name: "target", type: "Entity", description: "The entity to call." },
      { name: "verb", type: "string", description: "The verb to call." },
      { name: "...args", type: "any[]", description: "Arguments to pass to the verb." },
    ],
    returnType: "any",
  },
  handler: ([target, verb, ...callArgs], ctx) => {
    const targetVerb = getVerb(target.id, verb);
    if (!targetVerb) {
      throw new ScriptError(`call: verb '${verb}' not found on ${target.id}`);
    }

    return evaluate(
      targetVerb.code,
      createScriptContext({
        caller: ctx.caller,
        this: target,
        args: callArgs,
        ...(ctx.send ? { send: ctx.send } : {}),
        warnings: ctx.warnings,
        stack: [...(ctx.stack ?? []), { name: verb, args: callArgs }],
      }),
    );
  },
});

export const schedule = defineFullOpcode<[string, unknown[], number], null>("schedule", {
  metadata: {
    label: "Schedule",
    category: "action",
    description: "Schedule a verb call",
    slots: [
      { name: "Verb", type: "string" },
      { name: "Args", type: "block" },
      { name: "Delay", type: "number" },
    ],
    parameters: [
      { name: "verb", type: "string", description: "The verb to schedule." },
      { name: "args", type: "any[]", description: "Arguments to pass to the verb." },
      { name: "delay", type: "number", description: "Delay in milliseconds." },
    ],
    returnType: "null",
  },
  handler: ([verb, callArgs, delay], ctx) => {
    scheduler.schedule(ctx.this.id, verb, callArgs, delay);
    return null;
  },
});

// Entity Introspection
/**
 * Returns a list of verbs available on an entity.
 */
export const verbs = defineFullOpcode<[Entity], readonly Verb[]>("verbs", {
  metadata: {
    label: "Verbs",
    category: "world",
    description: "Get available verbs",
    slots: [{ name: "Target", type: "block" }],
    parameters: [{ name: "target", type: "Entity", description: "The entity to get verbs from." }],
    returnType: "Verb[]",
  },
  handler: ([target], _ctx) => {
    if (!target || !("id" in target)) {
      return [];
    }
    return getVerbs(target.id);
  },
});

/**
 * Returns a specific verb from an entity.
 */
export const get_verb = defineFullOpcode<[Entity, string], Verb | null>("get_verb", {
  metadata: {
    label: "Get Verb",
    category: "world",
    description: "Get specific verb",
    slots: [
      { name: "Target", type: "block" },
      { name: "Name", type: "string" },
    ],
    parameters: [
      { name: "target", type: "Entity", description: "The entity to get the verb from." },
      { name: "name", type: "string", description: "The name of the verb." },
    ],
    returnType: "Verb | null",
  },
  handler: ([target, name], _ctx) => {
    if (!target || !("id" in target)) {
      return null;
    }
    return getVerb(target.id, name);
  },
});

/**
 * Retrieves an entity by ID.
 */
export const entity = defineFullOpcode<[number], Entity>("entity", {
  metadata: {
    label: "Entity",
    category: "world",
    description: "Get entity by ID",
    slots: [{ name: "ID", type: "number" }],
    parameters: [{ name: "id", type: "number", description: "The ID of the entity." }],
    returnType: "Entity",
  },
  handler: ([id], _ctx) => {
    const entity = getEntity(id);
    if (!entity) {
      throw new ScriptError(`entity: entity ${id} not found`);
    }
    return entity;
  },
});

/**
 * Updates one or more entities' properties transactionally.
 */
export const setEntity = defineFullOpcode<[Capability | null, ...Entity[]], null>("set_entity", {
  metadata: {
    label: "Update Entity",
    category: "action",
    description: "Update entity properties (requires entity.control)",
    slots: [
      { name: "Cap", type: "block" },
      { name: "Entities", type: "block" },
    ],
    parameters: [
      { name: "cap", type: "Capability | null", description: "Capability to use." },
      { name: "...entities", type: "object[]", description: "The entities to update." },
    ],
    returnType: "void",
  },
  handler: ([cap, ...entities], ctx) => {
    if (!cap) {
      throw new ScriptError("set_entity: expected capability");
    }

    for (const entity of entities) {
      if (!entity || typeof entity.id !== "number") {
        throw new ScriptError(`set_entity: expected entity object, got ${JSON.stringify(entity)}`);
      }
    }

    for (const entity of entities) {
      checkCapability(cap as Capability, ctx.this.id, "entity.control", (params) => {
        return params["target_id"] === entity.id;
      });
    }

    updateEntity(...entities);
    return null;
  },
});

/**
 * Gets the prototype ID of an entity.
 */
export const getPrototype = defineFullOpcode<[Entity], number | null>("get_prototype", {
  metadata: {
    label: "Get Prototype",
    category: "world",
    description: "Get entity prototype ID",
    slots: [{ name: "Entity", type: "block" }],
    parameters: [
      { name: "target", type: "Entity", description: "The entity to get the prototype of." },
    ],
    returnType: "number | null",
  },
  handler: ([entity], _ctx) => {
    if (!entity || typeof entity.id !== "number") {
      throw new ScriptError(`get_prototype: expected entity, got ${JSON.stringify(entity)}`);
    }
    return getPrototypeId(entity.id);
  },
});

export const setPrototype = defineFullOpcode<[Capability | null, Entity, number | null], null>(
  "set_prototype",
  {
    metadata: {
      label: "Set Prototype",
      category: "action",
      description: "Set entity prototype (requires entity.control)",
      slots: [
        { name: "Cap", type: "block" },
        { name: "Entity", type: "block" },
        { name: "PrototypeID", type: "number" },
      ],
      parameters: [
        { name: "cap", type: "Capability | null", description: "Capability to use." },
        { name: "target", type: "Entity", description: "The entity to set the prototype of." },
        { name: "prototypeId", type: "number", description: "The ID of the new prototype." },
      ],
      returnType: "null",
    },
    handler: ([cap, entity, protoId], ctx) => {
      if (!cap) {
        throw new ScriptError("set_prototype: expected capability");
      }

      if (!entity || typeof entity.id !== "number") {
        throw new ScriptError(`set_prototype: expected entity, got ${JSON.stringify(entity)}`);
      }

      checkCapability(cap, ctx.this.id, "entity.control", (params) => {
        return params["target_id"] === entity.id;
      });

      if (protoId !== null && typeof protoId !== "number") {
        throw new ScriptError(
          `set_prototype: expected number or null for prototype ID, got ${JSON.stringify(protoId)}`,
        );
      }

      setPrototypeId(entity.id, protoId);
      return null;
    },
  },
);

/** Resolves all properties of an entity, including dynamic ones. */
export const resolve_props = defineFullOpcode<[Entity], Entity>("resolve_props", {
  metadata: {
    label: "Resolve Props",
    category: "data",
    description: "Resolve entity properties",
    slots: [{ name: "Entity", type: "block" }],
    parameters: [
      { name: "target", type: "Entity", description: "The entity to resolve properties for." },
    ],
    returnType: "Entity",
  },
  handler: ([entity], ctx) => {
    return resolveProps(entity, ctx);
  },
});

/**
 * Executes a verb on an entity as if called by that entity (impersonation).
 * Restricted to System (ID 3) and Bot (ID 4).
 */
export const sudo = defineFullOpcode<[Capability | null, Entity, string, unknown[]], any>("sudo", {
  metadata: {
    label: "Sudo",
    category: "system",
    description: "Execute verb as another entity (requires sys.sudo)",
    slots: [
      { name: "Cap", type: "block" },
      { name: "Target", type: "block" },
      { name: "Verb", type: "string" },
      { name: "Args", type: "block" },
    ],
    parameters: [
      { name: "cap", type: "Capability | null", description: "Capability to use." },
      { name: "target", type: "Entity", description: "The entity to impersonate." },
      { name: "verb", type: "string", description: "The verb to call." },
      { name: "args", type: "any[]", description: "Arguments to pass to the verb." },
    ],
    returnType: "any",
  },
  handler: ([cap, target, verb, evaluatedArgs], ctx) => {
    if (!cap) {
      throw new ScriptError("sudo: expected capability");
    }

    checkCapability(cap as Capability, ctx.this.id, "sys.sudo");

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
        caller: target, // Impersonation
        this: target,
        args: evaluatedArgs,
        // If caller is Bot (4), wrap send to forward messages
        ...(originalSend
          ? {
              send: (type: string, payload: unknown) => {
                if (callerId === 4) {
                  originalSend("forward", {
                    target: target.id,
                    type,
                    payload,
                  });
                } else {
                  originalSend(type, payload);
                }
              },
            }
          : {}),
        warnings: ctx.warnings,
        stack: [...(ctx.stack ?? []), { name: `sudo:${verb}`, args: evaluatedArgs }],
      }),
    );
  },
});
