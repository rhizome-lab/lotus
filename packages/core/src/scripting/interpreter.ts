import { Entity, updateEntity } from "../repo";
import { checkPermission } from "../permissions";
import { TimeLibrary } from "./lib/time";
import { WorldLibrary } from "./lib/world";

export type ScriptContext = {
  caller: Entity;
  this: Entity;
  args: any[];
  locals?: Record<string, any>;
  gas?: number; // Gas limit
  sys?: {
    move: (id: number, dest: number) => void;
    create: (data: any) => number;
    send: (msg: any) => void;
    destroy?: (id: number) => void;
    call?: (targetId: number, verb: string, args: any[]) => Promise<any>;
    getAllEntities?: () => number[];
  };
  warnings?: string[];
};

export class ScriptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScriptError";
  }
}

const OPS: Record<string, (args: any[], ctx: ScriptContext) => Promise<any>> = {
  // Control Flow
  seq: async (args, ctx) => {
    let lastResult = null;
    for (const step of args) {
      lastResult = await evaluate(step, ctx);
    }
    return lastResult;
  },
  if: async (args, ctx) => {
    const [cond, thenBranch, elseBranch] = args;
    const condResult = await evaluate(cond, ctx);
    if (condResult) {
      return await evaluate(thenBranch, ctx);
    } else if (elseBranch) {
      return await evaluate(elseBranch, ctx);
    }
    return null;
  },
  try: async (args, ctx) => {
    const [tryBlock, errorVar, catchBlock] = args;
    try {
      return await evaluate(tryBlock, ctx);
    } catch (e: any) {
      if (catchBlock) {
        if (errorVar && typeof errorVar === "string") {
          if (!ctx.locals) ctx.locals = {};
          ctx.locals[errorVar] = e.message || String(e);
        }
        return await evaluate(catchBlock, ctx);
      }
      return null;
    }
  },
  throw: async (args, ctx) => {
    const [msg] = args;
    throw new ScriptError(await evaluate(msg, ctx));
  },
  warn: async (args, ctx) => {
    const [msg] = args;
    const text = await evaluate(msg, ctx);
    if (ctx.warnings) {
      ctx.warnings.push(String(text));
    }
    return null;
  },
  for: async (args, ctx) => {
    const [varName, listExpr, body] = args;
    const list = await evaluate(listExpr, ctx);
    if (!Array.isArray(list)) return null;

    if (!ctx.locals) ctx.locals = {};

    let lastResult = null;
    for (const item of list) {
      ctx.locals[varName] = item;
      lastResult = await evaluate(body, ctx);
    }
    return lastResult;
  },
  list: async (args, ctx) => {
    const result = [];
    for (const arg of args) {
      result.push(await evaluate(arg, ctx));
    }
    return result;
  },

  // Variables
  let: async (args, ctx) => {
    const [name, valExpr] = args;
    const val = await evaluate(valExpr, ctx);
    if (!ctx.locals) ctx.locals = {};
    ctx.locals[name] = val;
    return val;
  },
  var: async (args, ctx) => {
    const [name] = args;
    if (ctx.locals && name in ctx.locals) {
      return ctx.locals[name];
    }
    return null;
  },

  // Comparison
  "==": async (args, ctx) =>
    (await evaluate(args[0], ctx)) === (await evaluate(args[1], ctx)),
  "!=": async (args, ctx) =>
    (await evaluate(args[0], ctx)) !== (await evaluate(args[1], ctx)),
  ">": async (args, ctx) =>
    (await evaluate(args[0], ctx)) > (await evaluate(args[1], ctx)),
  "<": async (args, ctx) =>
    (await evaluate(args[0], ctx)) < (await evaluate(args[1], ctx)),
  ">=": async (args, ctx) =>
    (await evaluate(args[0], ctx)) >= (await evaluate(args[1], ctx)),
  "<=": async (args, ctx) =>
    (await evaluate(args[0], ctx)) <= (await evaluate(args[1], ctx)),

  // Logic
  and: async (args, ctx) =>
    (await evaluate(args[0], ctx)) && (await evaluate(args[1], ctx)),
  or: async (args, ctx) =>
    (await evaluate(args[0], ctx)) || (await evaluate(args[1], ctx)),
  not: async (args, ctx) => !(await evaluate(args[0], ctx)),

  // Math
  "+": async (args, ctx) =>
    (await evaluate(args[0], ctx)) + (await evaluate(args[1], ctx)),
  "-": async (args, ctx) =>
    (await evaluate(args[0], ctx)) - (await evaluate(args[1], ctx)),
  "*": async (args, ctx) =>
    (await evaluate(args[0], ctx)) * (await evaluate(args[1], ctx)),
  "/": async (args, ctx) =>
    (await evaluate(args[0], ctx)) / (await evaluate(args[1], ctx)),
  "%": async (args, ctx) =>
    (await evaluate(args[0], ctx)) % (await evaluate(args[1], ctx)),
  "^": async (args, ctx) =>
    Math.pow(await evaluate(args[0], ctx), await evaluate(args[1], ctx)),
  random: async () => Math.random(),

  // Capabilities
  prop: async (args, ctx) => {
    const [targetExpr, keyExpr] = args;
    const target = await evaluateTarget(targetExpr, ctx);
    const key = await evaluate(keyExpr, ctx);

    if (!target || typeof key !== "string") return null;

    // Check permission
    if (!checkPermission(ctx.caller, target, "view")) {
      throw new ScriptError(`Permission denied: cannot view ${target.id}`);
    }

    return target.props[key];
  },
  set: async (args, ctx) => {
    const [targetExpr, keyExpr, valExpr] = args;
    const target = await evaluateTarget(targetExpr, ctx);
    const key = await evaluate(keyExpr, ctx);
    const val = await evaluate(valExpr, ctx);

    if (!target || typeof key !== "string") return null;

    if (!checkPermission(ctx.caller, target, "edit")) {
      throw new ScriptError(`Permission denied: cannot edit ${target.id}`);
    }

    const newProps = { ...target.props, [key]: val };
    updateEntity(target.id, { props: newProps });
    return val;
  },
  tell: async (args, ctx) => {
    const [targetExpr, msgExpr] = args;
    // Special case: 'caller'
    if (targetExpr === "caller") {
      if (ctx.sys?.send) {
        ctx.sys.send({ type: "message", text: await evaluate(msgExpr, ctx) });
      }
      return;
    }
    return null;
  },
  move: async (args, ctx) => {
    const [targetExpr, destExpr] = args;
    const target = await evaluateTarget(targetExpr, ctx);
    const dest = await evaluateTarget(destExpr, ctx);

    if (!target || !dest) return null;

    if (!checkPermission(ctx.caller, target, "edit")) {
      throw new ScriptError(`Permission denied: cannot move ${target.id}`);
    }

    if (ctx.sys?.move) {
      ctx.sys.move(target.id, dest.id);
    }
    return true;
  },
  destroy: async (args, ctx) => {
    const [targetExpr] = args;
    const target = await evaluateTarget(targetExpr, ctx);

    if (!target) return null;

    if (!checkPermission(ctx.caller, target, "edit")) {
      throw new ScriptError(`Permission denied: cannot destroy ${target.id}`);
    }

    if (ctx.sys?.destroy) {
      ctx.sys.destroy(target.id);
    } else if (ctx.sys?.move) {
      // Fallback: move to void (0 or null, but moveEntity expects number)
      // Actually moveEntity expects number.
      // We need a real destroy or move to 0 if 0 is void.
      // Let's assume we can pass 0 for void or we need a destroy method.
      // For now, let's assume the sys.destroy is provided.
    }
    return true;
  },
  create: async (args, ctx) => {
    const [dataExpr] = args;
    const data = await evaluate(dataExpr, ctx);

    if (ctx.sys?.create) {
      return ctx.sys.create(data);
    }
    return null;
  },
  call: async (args, ctx) => {
    const [targetExpr, verbExpr, ...callArgs] = args;
    const target = await evaluateTarget(targetExpr, ctx);
    const verb = await evaluate(verbExpr, ctx);

    // Evaluate arguments
    const evaluatedArgs = [];
    for (const arg of callArgs) {
      evaluatedArgs.push(await evaluate(arg, ctx));
    }

    if (!target || typeof verb !== "string") return null;

    if (ctx.sys?.call) {
      return await ctx.sys.call(target.id, verb, evaluatedArgs);
    }
    return null;
  },
  ...TimeLibrary,
  ...WorldLibrary,
};

export function registerOpcode(
  name: string,
  handler: (args: any[], ctx: ScriptContext) => Promise<any>,
) {
  OPS[name] = handler;
}

export async function evaluate(ast: any, ctx: ScriptContext): Promise<any> {
  // Gas Check
  if (ctx.gas !== undefined) {
    if (ctx.gas <= 0) {
      throw new ScriptError("Gas limit exceeded");
    }
    ctx.gas--;
  }

  if (!Array.isArray(ast)) {
    // Literals
    return ast;
  }

  if (ast.length === 0) return null;

  const [op, ...args] = ast;

  const handler = OPS[op];
  if (handler) {
    return await handler(args, ctx);
  }

  throw new ScriptError(`Unknown opcode: ${op}`);
}

export async function evaluateTarget(
  expr: any,
  ctx: ScriptContext,
): Promise<Entity | null> {
  if (expr === "this") return ctx.this;
  if (expr === "caller") return ctx.caller;
  if (typeof expr === "number") {
    // Resolve entity by ID
    // We need a way to get entity by ID here.
    // Since we can't import getEntity directly due to circular deps if we are not careful,
    // but interpreter.ts is in scripting, and repo is in parent.
    // We imported updateEntity from ../repo, so we can import getEntity too.
    const { getEntity } = await import("../repo");
    return getEntity(expr);
  }
  return null;
}
