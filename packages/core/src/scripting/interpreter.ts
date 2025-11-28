import { Entity, getContents, getEntity, Verb } from "../repo";

export type ScriptSystemContext = {
  move: (id: number, dest: number) => void;
  create: (data: any) => number;
  send: (msg: unknown) => void;
  destroy?: (id: number) => void;
  call: (
    caller: Entity,
    targetId: number,
    verb: string,
    args: readonly unknown[],
    warnings: string[],
  ) => Promise<any>;
  getAllEntities?: () => readonly number[];
  schedule?: (
    entityId: number,
    verb: string,
    args: readonly unknown[],
    delay: number,
  ) => void;
  broadcast?: (msg: unknown, locationId?: number) => void;
  give?: (entityId: number, destId: number, newOwnerId: number) => void;
  triggerEvent: (
    eventName: string,
    locationId: number,
    args: readonly unknown[],
    excludeEntityId?: number,
  ) => void | Promise<void>;
  getContents?: (containerId: number) => Promise<readonly Entity[]>;
  getVerbs?: (entityId: number) => Promise<readonly Verb[]>;
  getEntity?: (id: number) => Promise<Entity | null>;
  sendRoom?: (roomId: number) => void;
  canEdit?: (playerId: number, entityId: number) => boolean;
  sendTo?: (entityId: number, msg: unknown) => void;
};

export type ScriptContext = {
  caller: Entity;
  this: Entity;
  args: readonly unknown[];
  locals?: Record<string, unknown>;
  gas?: number; // Gas limit
  sys?: ScriptSystemContext;
  warnings: string[];
  vars?: Record<string, unknown>; // New for local variables
};

export type ScriptLibraryDefinition = Record<
  string,
  (args: readonly unknown[], ctx: ScriptContext) => Promise<unknown>
>;

export class ScriptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScriptError";
  }
}

export const OPS: Record<
  string,
  (args: any[], ctx: ScriptContext) => Promise<any>
> = {};

export function registerOpcode(
  name: string,
  handler: (args: unknown[], ctx: ScriptContext) => Promise<any>,
) {
  OPS[name] = handler;
}

export function registerLibrary(
  library: Record<
    string,
    (args: unknown[], ctx: ScriptContext) => Promise<any>
  >,
) {
  for (const [name, handler] of Object.entries(library)) {
    OPS[name] = handler;
  }
}

export function getOpcode(name: string) {
  return OPS[name];
}

export async function executeLambda(
  lambda: any,
  args: unknown[],
  ctx: ScriptContext,
): Promise<any> {
  if (!lambda || lambda.type !== "lambda") return null;

  // Create new context
  const newVars = { ...lambda.closure };
  // Bind arguments
  for (let i = 0; i < lambda.args.length; i++) {
    newVars[lambda.args[i]] = args[i];
  }

  return await evaluate(lambda.body, {
    ...ctx,
    vars: newVars,
  });
}

export async function evaluate(ast: unknown, ctx: ScriptContext): Promise<any> {
  if (ctx.gas !== undefined) {
    ctx.gas -= 1;
    if (ctx.gas < 0) {
      throw new ScriptError("Script ran out of gas!");
    }
  }

  if (ast === null || typeof ast !== "object") {
    return ast;
  }

  if (Array.isArray(ast)) {
    const [op, ...args] = ast;
    if (typeof op === "string" && OPS[op]) {
      return OPS[op]!(args, ctx);
    } else {
      throw new ScriptError(`Unknown opcode: ${op}`);
    }
  }

  return ast;
}

export async function evaluateTarget(
  targetExpr: unknown,
  ctx: ScriptContext,
): Promise<Entity | null> {
  const val = await evaluate(targetExpr, ctx);
  if (val === "me") return ctx.caller;
  if (val === "this") return ctx.this;
  if (val === "here") {
    if (ctx.caller.location_id) {
      return getEntity(ctx.caller.location_id);
    }
    return null;
  }
  if (typeof val === "number") {
    return getEntity(val);
  }
  if (typeof val === "string") {
    // Search in room or inventory
    // 1. Inventory
    const inventory = getContents(ctx.caller.id);
    const item = inventory.find(
      (e) => e.name.toLowerCase() === val.toLowerCase(),
    );
    if (item) return item;

    // 2. Room
    if (ctx.caller.location_id) {
      const roomContents = getContents(ctx.caller.location_id);
      const roomItem = roomContents.find(
        (e) => e.name.toLowerCase() === val.toLowerCase(),
      );
      if (roomItem) return roomItem;
    }
  }
  if (typeof val === "object" && val !== null && "id" in val && "kind" in val) {
    return val as Entity;
  }
  throw new ScriptError(
    `evaluateTarget: failed to match ${JSON.stringify(
      targetExpr,
    )} (evaluated to ${JSON.stringify(val)})`,
  );
}
