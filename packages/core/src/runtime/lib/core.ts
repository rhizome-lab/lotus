import { evaluate, ScriptError, createScriptContext } from "@viwo/scripting";
import { resolveProps } from "../utils";
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
} from "../../repo";
import { scheduler } from "../../scheduler";
import { defineOpcode, ScriptValue } from "@viwo/scripting";
import { Entity } from "@viwo/shared/jsonrpc";

// Entity Interaction

/**
 * Creates a new entity.
 */
export const create = defineOpcode<[ScriptValue<object>], number>("create", {
  metadata: {
    label: "Create",
    category: "action",
    description: "Create a new entity",
    slots: [{ name: "Data", type: "block" }],
    parameters: [{ name: "data", type: "object" }],
    returnType: "number",
  },
  handler: async (args, ctx) => {
    if (args.length !== 1) {
      throw new ScriptError("create: expected `data``");
    }
    const [dataExpr] = args;
    const data = await evaluate(dataExpr, ctx);
    if (typeof data !== "object") {
      throw new ScriptError(
        `create: expected object, got ${JSON.stringify(data)}`,
      );
    }
    return createEntity(data);
  },
});

/**
 * Destroys an entity.
 */
export const destroy = defineOpcode<[ScriptValue<Entity>], null>("destroy", {
  metadata: {
    label: "Destroy",
    category: "action",
    description: "Destroy an entity",
    slots: [{ name: "Target", type: "block", default: "this" }],
    parameters: [{ name: "target", type: "Entity" }],
    returnType: "null",
  },
  handler: async (args, ctx) => {
    const [targetExpr] = args;
    const target = await evaluate(targetExpr, ctx);
    if (
      typeof target !== "object" ||
      !target ||
      typeof target.id !== "number"
    ) {
      throw new ScriptError(
        `destroy: target must be an entity, got ${JSON.stringify(target)}`,
      );
    }
    deleteEntity(target.id);
    return null;
  },
});

// TODO: Return verb result value?
/**
 * Calls a verb on an entity.
 */
export const call = defineOpcode<
  [ScriptValue<Entity>, ScriptValue<string>, ...ScriptValue<unknown>[]],
  any
>("call", {
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
      { name: "target", type: "Entity" },
      { name: "verb", type: "string" },
      { name: "...args", type: "unknown[]" },
    ],
    returnType: "any",
  },
  handler: async (args, ctx) => {
    const [targetExpr, verbExpr, ...callArgs] = args;
    const target = await evaluate(targetExpr, ctx);
    const verb = await evaluate(verbExpr, ctx);

    // Evaluate arguments
    const evaluatedArgs = [];
    for (const arg of callArgs) {
      evaluatedArgs.push(await evaluate(arg, ctx));
    }

    if (typeof target !== "object") {
      throw new ScriptError(
        `call: target must be an object, got ${JSON.stringify(target)}`,
      );
    }
    if (typeof verb !== "string") {
      throw new ScriptError(
        `call: verb must be a string, got ${JSON.stringify(verb)}`,
      );
    }

    const targetVerb = getVerb(target.id, verb);
    if (!targetVerb) {
      throw new ScriptError(`call: verb '${verb}' not found on ${target.id}`);
    }

    return await evaluate(
      targetVerb.code,
      createScriptContext({
        caller: ctx.caller,
        this: target,
        args: evaluatedArgs,
        ...(ctx.send ? { send: ctx.send } : {}),
        warnings: ctx.warnings,
        stack: [...(ctx.stack ?? []), { name: verb, args: evaluatedArgs }],
      }),
    );
  },
});

export const schedule = defineOpcode<
  [ScriptValue<string>, ScriptValue<unknown>, ScriptValue<number>],
  null
>("schedule", {
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
      { name: "verb", type: "string" },
      { name: "args", type: "unknown[]" },
      { name: "delay", type: "number" },
    ],
    returnType: "null",
  },
  handler: async (args, ctx) => {
    const [verbExpr, argsExpr, delayExpr] = args;
    const verb = await evaluate(verbExpr, ctx);
    if (typeof verb !== "string") {
      throw new ScriptError(
        `schedule: verb must be a string, got ${JSON.stringify(verb)}`,
      );
    }
    const callArgs = await evaluate(argsExpr, ctx);
    if (!Array.isArray(callArgs)) {
      throw new ScriptError(
        `schedule: args must be an array, got ${JSON.stringify(callArgs)}`,
      );
    }
    const delay = await evaluate(delayExpr, ctx);
    if (typeof delay !== "number") {
      throw new ScriptError(
        `schedule: delay must be a number, got ${JSON.stringify(delay)}`,
      );
    }
    scheduler.schedule(ctx.this.id, verb, callArgs, delay);
    return null;
  },
});

// Entity Introspection
/**
 * Returns a list of verbs available on an entity.
 */
export const verbs = defineOpcode<[ScriptValue<Entity>], readonly Verb[]>(
  "verbs",
  {
    metadata: {
      label: "Verbs",
      category: "world",
      description: "Get available verbs",
      slots: [{ name: "Target", type: "block" }],
      parameters: [{ name: "target", type: "unknown" }],
      returnType: "Verb[]",
    },
    handler: async (args, ctx) => {
      const [entityExpr] = args;
      const target = await evaluate(entityExpr, ctx);
      if (!target || typeof target !== "object" || !("id" in target)) {
        return [];
      }
      return getVerbs((target as Entity).id);
    },
  },
);

/**
 * Returns a specific verb from an entity.
 */
export const get_verb = defineOpcode<
  [ScriptValue<Entity>, ScriptValue<string>],
  Verb | null
>("get_verb", {
  metadata: {
    label: "Get Verb",
    category: "world",
    description: "Get specific verb",
    slots: [
      { name: "Target", type: "block" },
      { name: "Name", type: "string" },
    ],
    parameters: [
      { name: "target", type: "unknown" },
      { name: "name", type: "string" },
    ],
    returnType: "Verb | null",
  },
  handler: async (args, ctx) => {
    const [entityExpr, nameExpr] = args;
    const target = await evaluate(entityExpr, ctx);
    const name = await evaluate(nameExpr, ctx);

    if (!target || typeof target !== "object" || !("id" in target)) {
      return null;
    }
    if (typeof name !== "string") {
      return null;
    }
    return getVerb((target as Entity).id, name);
  },
});

/**
 * Retrieves an entity by ID.
 */
export const entity = defineOpcode<[ScriptValue<number>], Entity>("entity", {
  metadata: {
    label: "Entity",
    category: "world",
    description: "Get entity by ID",
    slots: [{ name: "ID", type: "number" }],
    parameters: [{ name: "id", type: "number" }],
    returnType: "Entity",
  },
  handler: async (args, ctx) => {
    const [idExpr] = args;
    const id = await evaluate(idExpr, ctx);
    if (typeof id !== "number") {
      throw new ScriptError(
        `entity: expected number, got ${JSON.stringify(id)}`,
      );
    }
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
export const set_entity = defineOpcode<ScriptValue<Entity>[], void>(
  "set_entity",
  {
    metadata: {
      label: "Update Entity",
      category: "action",
      description: "Update entity properties",
      slots: [{ name: "Entities", type: "block" }],
      parameters: [{ name: "...entities", type: "Entity[]" }],
      returnType: "void",
    },
    handler: async (args, ctx) => {
      if (args.length < 1) {
        throw new ScriptError("set_entity: expected at least 1 argument");
      }
      const entities: Entity[] = [];
      for (const arg of args) {
        const entity = await evaluate(arg, ctx);
        if (
          !entity ||
          typeof entity !== "object" ||
          typeof (entity as any).id !== "number"
        ) {
          throw new ScriptError(
            `set_entity: expected entity object, got ${JSON.stringify(entity)}`,
          );
        }
        entities.push(entity as Entity);
      }

      updateEntity(...entities);
      return undefined;
    },
  },
);

/**
 * Gets the prototype ID of an entity.
 */
export const get_prototype = defineOpcode<[ScriptValue<Entity>], number | null>(
  "get_prototype",
  {
    metadata: {
      label: "Get Prototype",
      category: "world",
      description: "Get entity prototype ID",
      slots: [{ name: "Entity", type: "block" }],
      parameters: [{ name: "target", type: "Entity" }],
      returnType: "number | null",
    },
    handler: async (args, ctx) => {
      if (args.length !== 1) {
        throw new ScriptError("get_prototype: expected 1 argument");
      }
      const [entityExpr] = args;
      const entity = await evaluate(entityExpr, ctx);
      if (
        typeof entity !== "object" ||
        !entity ||
        typeof entity.id !== "number"
      ) {
        throw new ScriptError(
          `get_prototype: expected entity, got ${JSON.stringify(entity)}`,
        );
      }
      return getPrototypeId(entity.id);
    },
  },
);

export const set_prototype = defineOpcode<
  [ScriptValue<Entity>, ScriptValue<number | null>],
  null
>("set_prototype", {
  metadata: {
    label: "Set Prototype",
    category: "action",
    description: "Set entity prototype",
    slots: [
      { name: "Entity", type: "block" },
      { name: "PrototypeID", type: "number" },
    ],
    parameters: [
      { name: "target", type: "Entity" },
      { name: "prototype", type: "number | null" },
    ],
    returnType: "null",
  },
  handler: async (args, ctx) => {
    if (args.length !== 2) {
      throw new ScriptError("set_prototype: expected 2 arguments");
    }
    const [entityExpr, protoIdExpr] = args;
    const entity = await evaluate(entityExpr, ctx);
    const protoId = await evaluate(protoIdExpr, ctx);

    if (
      typeof entity !== "object" ||
      !entity ||
      typeof entity.id !== "number"
    ) {
      throw new ScriptError(
        `set_prototype: expected entity, got ${JSON.stringify(entity)}`,
      );
    }

    if (protoId !== null && typeof protoId !== "number") {
      throw new ScriptError(
        `set_prototype: expected number or null for prototype ID, got ${JSON.stringify(
          protoId,
        )}`,
      );
    }

    setPrototypeId(entity.id, protoId);
    return null;
  },
});

/**
 * Resolves all properties of an entity, including dynamic ones.
 */
export const resolve_props = defineOpcode<[ScriptValue<Entity>], Entity>(
  "resolve_props",
  {
    metadata: {
      label: "Resolve Props",
      category: "data",
      description: "Resolve entity properties",
      slots: [{ name: "Entity", type: "block" }],
      parameters: [{ name: "target", type: "Entity" }],
      returnType: "Entity",
    },
    handler: async (args, ctx) => {
      if (args.length !== 1) {
        throw new ScriptError("resolve_props: expected 1 argument");
      }
      const [entityId] = args;
      const entity = await evaluate(entityId, ctx);
      if (typeof entity !== "object") {
        throw new ScriptError(
          `resolve_props: expected object, got ${JSON.stringify(entity)}`,
        );
      }
      return resolveProps(entity, ctx);
    },
  },
);

/**
 * Executes a verb on an entity as if called by that entity (impersonation).
 * Restricted to System (ID 3) and Bot (ID 4).
 */
export const sudo = defineOpcode<
  [ScriptValue<Entity>, ScriptValue<string>, ...ScriptValue<unknown>[]],
  any
>("sudo", {
  metadata: {
    label: "Sudo",
    category: "system",
    description: "Execute verb as another entity",
    slots: [
      { name: "Target", type: "block" },
      { name: "Verb", type: "string" },
      { name: "Args", type: "block" },
    ],
    parameters: [
      { name: "target", type: "Entity" },
      { name: "verb", type: "string" },
      { name: "args", type: "unknown[]" },
    ],
    returnType: "any",
  },
  handler: async (args, ctx) => {
    const [targetExpr, verbExpr, argsExpr] = args;
    const target = await evaluate(targetExpr, ctx);
    if (
      !target ||
      typeof target !== "object" ||
      !("id" in target) ||
      typeof target.id !== "number"
    ) {
      throw new ScriptError(
        `sudo: target must be an entity, got ${JSON.stringify(target)}`,
      );
    }
    const verb = await evaluate(verbExpr, ctx);
    if (typeof verb !== "string") {
      throw new ScriptError(
        `sudo: verb must be a string, got ${JSON.stringify(verb)}`,
      );
    }

    // Security Check
    const callerId = ctx.caller.id;
    // System = 3, Bot = 4
    if (callerId !== 3 && callerId !== 4) {
      throw new ScriptError("sudo: permission denied");
    }

    // Evaluate arguments
    const evaluatedArgs = await evaluate(argsExpr, ctx);
    if (!Array.isArray(evaluatedArgs)) {
      throw new ScriptError(
        `sudo: args must be an array, got ${JSON.stringify(evaluatedArgs)}`,
      );
    }

    const targetVerb = getVerb(target.id, verb);
    if (!targetVerb) {
      throw new ScriptError(`sudo: verb '${verb}' not found on ${target.id}`);
    }

    // Execute with target as caller AND this
    // This effectively impersonates the user
    return await evaluate(
      targetVerb.code,
      createScriptContext({
        caller: target, // Impersonation
        this: target,
        args: evaluatedArgs,
        ...(ctx.send ? { send: ctx.send } : {}), // Keep original output channel? Or should we capture it?
        // For now, keep original send so Bot gets the output
        warnings: ctx.warnings,
        stack: [
          ...(ctx.stack ?? []),
          { name: `sudo:${verb}`, args: evaluatedArgs },
        ],
      }),
    );
  },
});
