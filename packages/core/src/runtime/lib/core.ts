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
  getCapability,
  createCapability,
} from "../../repo";
import { scheduler } from "../../scheduler";
import { defineOpcode, ScriptValue, Capability } from "@viwo/scripting";
import { Entity } from "@viwo/shared/jsonrpc";

// Helper to verify capabilities
function checkCapability(
  cap: unknown,
  type: string,
  ownerId: number,
  paramsMatch?: (params: Record<string, unknown>) => boolean,
): void {
  if (
    !cap ||
    typeof cap !== "object" ||
    (cap as any).__brand !== "Capability"
  ) {
    throw new ScriptError(`Expected capability for ${type}`);
  }
  const dbCap = getCapability((cap as Capability).id);
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

// Entity Interaction

/**
 * Creates a new entity.
 */
export const create = defineOpcode<
  [ScriptValue<Capability>, ScriptValue<object>],
  number
>("create", {
  metadata: {
    label: "Create",
    category: "action",
    description: "Create a new entity (requires sys.create)",
    slots: [
      { name: "Cap", type: "block" },
      { name: "Data", type: "block" },
    ],
    parameters: [
      { name: "cap", type: "Capability" },
      { name: "data", type: "object" },
    ],
    returnType: "number",
  },
  handler: (args, ctx) => {
    if (args.length !== 2) {
      throw new ScriptError("create: expected capability and data");
    }
    const [capExpr, dataExpr] = args;
    const cap = evaluate(capExpr, ctx);
    const data = evaluate(dataExpr, ctx);

    checkCapability(cap, "sys.create", ctx.this.id);

    if (typeof data !== "object") {
      throw new ScriptError(
        `create: expected object, got ${JSON.stringify(data)}`,
      );
    }
    const newId = createEntity(data);

    // Mint entity.control for the new entity and give to creator
    createCapability(ctx.this.id, "entity.control", { target_id: newId });

    return newId;
  },
});

/**
 * Destroys an entity.
 */
export const destroy = defineOpcode<
  [ScriptValue<Capability>, ScriptValue<Entity>],
  null
>("destroy", {
  metadata: {
    label: "Destroy",
    category: "action",
    description: "Destroy an entity (requires entity.control)",
    slots: [
      { name: "Cap", type: "block" },
      { name: "Target", type: "block" },
    ],
    parameters: [
      { name: "cap", type: "Capability" },
      { name: "target", type: "Entity" },
    ],
    returnType: "null",
  },
  handler: (args, ctx) => {
    const [capExpr, targetExpr] = args;
    const cap = evaluate(capExpr, ctx);
    const target = evaluate(targetExpr, ctx);

    if (
      typeof target !== "object" ||
      !target ||
      typeof target.id !== "number"
    ) {
      throw new ScriptError(
        `destroy: target must be an entity, got ${JSON.stringify(target)}`,
      );
    }

    checkCapability(cap, "entity.control", ctx.this.id, (params) => {
      return params.target_id === target.id;
    });

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
  handler: (args, ctx) => {
    const [targetExpr, verbExpr, ...callArgs] = args;
    const target = evaluate(targetExpr, ctx);
    const verb = evaluate(verbExpr, ctx);

    // Evaluate arguments
    const evaluatedArgs = [];
    for (const arg of callArgs) {
      evaluatedArgs.push(evaluate(arg, ctx));
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

    return evaluate(
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
  handler: (args, ctx) => {
    const [verbExpr, argsExpr, delayExpr] = args;
    const verb = evaluate(verbExpr, ctx);
    if (typeof verb !== "string") {
      throw new ScriptError(
        `schedule: verb must be a string, got ${JSON.stringify(verb)}`,
      );
    }
    const callArgs = evaluate(argsExpr, ctx);
    if (!Array.isArray(callArgs)) {
      throw new ScriptError(
        `schedule: args must be an array, got ${JSON.stringify(callArgs)}`,
      );
    }
    const delay = evaluate(delayExpr, ctx);
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
    handler: (args, ctx) => {
      const [entityExpr] = args;
      const target = evaluate(entityExpr, ctx);
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
  handler: (args, ctx) => {
    const [entityExpr, nameExpr] = args;
    const target = evaluate(entityExpr, ctx);
    const name = evaluate(nameExpr, ctx);

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
  handler: (args, ctx) => {
    const [idExpr] = args;
    const id = evaluate(idExpr, ctx);
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
export const set_entity = defineOpcode<
  [ScriptValue<Capability>, ...ScriptValue<Entity>[]],
  void
>("set_entity", {
  metadata: {
    label: "Update Entity",
    category: "action",
    description: "Update entity properties (requires entity.control)",
    slots: [
      { name: "Cap", type: "block" },
      { name: "Entities", type: "block" },
    ],
    parameters: [
      { name: "cap", type: "Capability" },
      { name: "...entities", type: "Entity[]" },
    ],
    returnType: "void",
  },
  handler: (args, ctx) => {
    if (args.length < 2) {
      throw new ScriptError("set_entity: expected capability and entities");
    }
    const [capExpr, ...entityExprs] = args;
    const cap = evaluate(capExpr, ctx);

    const entities: Entity[] = [];
    for (const arg of entityExprs) {
      const entity = evaluate(arg, ctx);
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

    // Verify capability for ALL entities
    // This assumes the capability allows controlling ALL of them, or we need multiple capabilities?
    // For simplicity, let's assume the capability must be valid for ALL targets (e.g. if it's a wildcard or if we passed a specific one that matches)
    // Actually, if we update multiple entities, we probably need multiple capabilities or a capability that covers all.
    // But typically set_entity is used for one entity or a group.
    // Let's iterate and check.
    // Wait, if we pass ONE capability, it must cover ALL entities.
    // If we want to support multiple capabilities, we'd need a list of capabilities.
    // For now, let's enforce that the single capability covers ALL targets.
    // e.g. entity.control with target_id matching, OR target_id is missing (wildcard? no, we said strict).

    // Strict mode: One capability per call? Or maybe the capability has a list of targets?
    // Let's assume for now we only support updating ONE entity per call if using specific capabilities.
    // IF args has multiple entities, the capability must be valid for ALL of them.
    // This implies the capability is likely a "wildcard" or the user has to make multiple calls.
    // Let's stick to: Check capability against EACH entity.

    for (const entity of entities) {
      checkCapability(cap, "entity.control", ctx.this.id, (params) => {
        return params.target_id === entity.id;
      });
    }

    updateEntity(...entities);
    return undefined;
  },
});

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
    handler: (args, ctx) => {
      if (args.length !== 1) {
        throw new ScriptError("get_prototype: expected 1 argument");
      }
      const [entityExpr] = args;
      const entity = evaluate(entityExpr, ctx);
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
  [ScriptValue<Capability>, ScriptValue<Entity>, ScriptValue<number | null>],
  null
>("set_prototype", {
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
      { name: "cap", type: "Capability" },
      { name: "target", type: "Entity" },
      { name: "prototype", type: "number | null" },
    ],
    returnType: "null",
  },
  handler: (args, ctx) => {
    if (args.length !== 3) {
      throw new ScriptError(
        "set_prototype: expected capability, entity, and prototype ID",
      );
    }
    const [capExpr, entityExpr, protoIdExpr] = args;
    const cap = evaluate(capExpr, ctx);
    const entity = evaluate(entityExpr, ctx);
    const protoId = evaluate(protoIdExpr, ctx);

    if (
      typeof entity !== "object" ||
      !entity ||
      typeof entity.id !== "number"
    ) {
      throw new ScriptError(
        `set_prototype: expected entity, got ${JSON.stringify(entity)}`,
      );
    }

    checkCapability(cap, "entity.control", ctx.this.id, (params) => {
      return params.target_id === entity.id;
    });

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
    handler: (args, ctx) => {
      if (args.length !== 1) {
        throw new ScriptError("resolve_props: expected 1 argument");
      }
      const [entityId] = args;
      const entity = evaluate(entityId, ctx);
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
  [
    ScriptValue<Capability>,
    ScriptValue<Entity>,
    ScriptValue<string>,
    ...ScriptValue<unknown>[],
  ],
  any
>("sudo", {
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
      { name: "cap", type: "Capability" },
      { name: "target", type: "Entity" },
      { name: "verb", type: "string" },
      { name: "args", type: "unknown[]" },
    ],
    returnType: "any",
  },
  handler: (args, ctx) => {
    const [capExpr, targetExpr, verbExpr, argsExpr] = args;
    const cap = evaluate(capExpr, ctx);
    const target = evaluate(targetExpr, ctx);

    checkCapability(cap, "sys.sudo", ctx.this.id);

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
    const verb = evaluate(verbExpr, ctx);
    if (typeof verb !== "string") {
      throw new ScriptError(
        `sudo: verb must be a string, got ${JSON.stringify(verb)}`,
      );
    }

    // Evaluate arguments
    const evaluatedArgs = evaluate(argsExpr, ctx);
    if (!Array.isArray(evaluatedArgs)) {
      throw new ScriptError(
        `sudo: args must be an array, got ${JSON.stringify(evaluatedArgs)}`,
      );
    }

    const targetVerb = getVerb(target.id, verb);
    if (!targetVerb) {
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
                  originalSend("forward", { target: target.id, type, payload });
                } else {
                  originalSend(type, payload);
                }
              },
            }
          : {}),
        warnings: ctx.warnings,
        stack: [
          ...(ctx.stack ?? []),
          { name: `sudo:${verb}`, args: evaluatedArgs },
        ],
      }),
    );
  },
});
