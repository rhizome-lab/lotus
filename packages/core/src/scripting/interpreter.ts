import { Entity, Verb } from "../repo";
import { ScriptValue } from "./def";

export type ScriptSystemContext = {
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
  schedule?: (
    entityId: number,
    verb: string,
    args: readonly unknown[],
    delay: number,
  ) => void;
  getVerbs?: (entityId: number) => Promise<readonly Verb[]>;
  getEntity?: (id: number) => Promise<Entity | null>;
};

export type ScriptContext = {
  caller: Entity;
  this: Entity;
  args: readonly unknown[];
  gas: number; // Gas limit
  sys?: ScriptSystemContext;
  warnings: string[];
  vars: Record<string, unknown>;
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

export interface OpcodeMetadata {
  label: string;
  category: string;
  description?: string;
  // For Node Editor
  layout?: "infix" | "standard" | "primitive" | "control-flow";
  slots?: {
    name: string;
    type: "block" | "string" | "number" | "boolean";
    default?: any;
  }[];
  // For Monaco/TS
  parameters?: { name: string; type: string }[];
  returnType?: string;
}

export type OpcodeHandler = (args: any[], ctx: ScriptContext) => Promise<any>;

export interface OpcodeDefinition {
  handler: OpcodeHandler;
  metadata: OpcodeMetadata;
}

export const OPS: Record<string, OpcodeDefinition> = {};

export function registerOpcode(
  name: string,
  handler: OpcodeHandler,
  metadata: OpcodeMetadata,
) {
  OPS[name] = { handler, metadata };
}

export function registerLibrary(library: Record<string, OpcodeDefinition>) {
  for (const [name, def] of Object.entries(library)) {
    OPS[name] = def;
  }
}

export function getOpcode(name: string) {
  return OPS[name]?.handler;
}

export function getOpcodeMetadata() {
  return Object.entries(OPS).map(([opcode, def]) => ({
    opcode,
    ...def.metadata,
  }));
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

export async function evaluate<T>(
  ast: ScriptValue<T>,
  ctx: ScriptContext,
): Promise<T> {
  if (ctx.gas !== undefined) {
    ctx.gas -= 1;
    if (ctx.gas < 0) {
      throw new ScriptError("Script ran out of gas!");
    }
  }
  if (Array.isArray(ast)) {
    const [op, ...args] = ast;
    if (typeof op === "string" && OPS[op]) {
      return OPS[op].handler(args, ctx);
    } else {
      throw new ScriptError(`Unknown opcode: ${op}`);
    }
  }
  return ast as never;
}

export function createScriptContext(
  ctx: Pick<ScriptContext, "caller" | "this" | "sys"> & Partial<ScriptContext>,
): ScriptContext {
  return {
    args: [],
    gas: 1000,
    warnings: [],
    vars: {},
    ...ctx,
  };
}

export async function resolveProps(
  entity: Entity,
  ctx: ScriptContext,
): Promise<Entity> {
  if (!ctx.sys?.getVerbs) {
    return entity;
  }

  // We need to clone the props so we don't mutate the actual entity in the repo
  // entity is already a bag of props, so we clone it entirely
  const resolved = { ...entity };

  const verbs = await ctx.sys.getVerbs(entity.id);
  for (const verb of verbs) {
    const match = verb.name.match(/^get_(.+)/);
    if (!match?.[1]) continue;
    const propName = match[1];
    try {
      const result = await evaluate(verb.code, {
        caller: entity, // The entity itself is the caller for its own getter?
        this: entity,
        args: [],
        get gas() {
          return ctx.gas ?? 1000;
        },
        set gas(value) {
          ctx.gas = value;
        },
        sys: ctx.sys,
        warnings: ctx.warnings,
        vars: {},
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
