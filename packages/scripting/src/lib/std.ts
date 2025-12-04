import { evaluate, ScriptError, BreakSignal } from "../interpreter";
import { defineOpcode, ScriptRaw } from "../def";
import { Entity } from "@viwo/shared/jsonrpc";
import { ScriptContext } from "../interpreter";

function enterScope(ctx: ScriptContext) {
  const snapshot = { vars: ctx.vars, cow: ctx.cow };
  ctx.cow = true;
  return snapshot;
}

function exitScope(ctx: ScriptContext, snapshot: { vars: Record<string, unknown>; cow: boolean }) {
  ctx.vars = snapshot.vars;
  ctx.cow = snapshot.cow;
}

function setVar(ctx: ScriptContext, name: string, value: any) {
  let scope = ctx.vars;
  while (scope) {
    if (Object.prototype.hasOwnProperty.call(scope, name)) {
      scope[name] = value;
      return;
    }
    scope = Object.getPrototypeOf(scope);
  }
  // If not found, do nothing (match existing behavior of checking `in`)
  // Or should we set on global? We don't have a global scope object separate from top-level vars.
  // If we are at top level, `scope` becomes null.
  // Existing behavior: `if (ctx.vars && name in ctx.vars) { ctx.vars[name] = value; }`
  // `in` checks prototype chain.
  // If it is in prototype chain, `ctx.vars[name] = value` would shadow it.
  // We want to update the original.
  // So if we didn't find it in the loop (which checks own property up the chain), it means it's not in the chain?
  // Wait, `Object.getPrototypeOf` eventually returns null.
  // If we fall through, it's not defined anywhere.
}

// Values
/**
 * Returns the current entity (this).
 */
const this_ = defineOpcode<[], Entity>("this", {
  metadata: {
    label: "This",
    category: "data",
    description: "Current entity",
    layout: "standard",
    slots: [],
    parameters: [],
    returnType: "Entity",
  },
  handler: (_args, ctx) => {
    return ctx.this;
  },
});
export { this_ as this };

/**
 * Returns the entity that called the current script.
 */
export const caller = defineOpcode<[], Entity>("caller", {
  metadata: {
    label: "Caller",
    category: "data",
    description: "Current caller",
    layout: "standard",
    slots: [],
    parameters: [],
    returnType: "Entity",
  },
  handler: (_args, ctx) => {
    return ctx.caller;
  },
});

// Control Flow
/**
 * Executes a sequence of steps and returns the result of the last step.
 */
export const seq = defineOpcode<unknown[], any>("seq", {
  metadata: {
    label: "Sequence",
    category: "logic",
    description: "Execute a sequence of steps",
    layout: "control-flow",
    slots: [],
    parameters: [{ name: "...args", type: "any[]" }],
    returnType: "any",
    lazy: true,
  },
  handler: ([...args], ctx) => {
    if (args.length === 0) {
      return null;
    }

    const snapshot = enterScope(ctx);

    let i = 0;
    let lastResult: any = null;

    const next = (): any => {
      while (i < args.length) {
        const step = args[i++];
        try {
          const result = evaluate(step, ctx);

          if (result instanceof Promise) {
            return result.then((res) => {
              lastResult = res;
              return next();
            });
          }

          lastResult = result;
        } catch (e) {
          exitScope(ctx, snapshot);
          throw e;
        }
      }
      exitScope(ctx, snapshot);
      return lastResult;
    };

    try {
      return next();
    } catch (e) {
      exitScope(ctx, snapshot);
      throw e;
    }
  },
});

/** Conditional execution. */
const if_ = defineOpcode<[boolean, unknown, unknown?], any>("if", {
  metadata: {
    label: "If",
    category: "logic",
    description: "Conditional execution",
    layout: "control-flow",
    genericParameters: ["T"],
    slots: [
      { name: "Condition", type: "block" },
      { name: "Then", type: "block" },
      { name: "Else", type: "block" },
    ],
    parameters: [
      { name: "condition", type: "unknown" },
      { name: "then", type: "T" },
      { name: "else", type: "T", optional: true },
    ],
    returnType: "T",
    lazy: true,
  },
  handler: ([cond, thenBranch, elseBranch], ctx) => {
    const runBranch = (conditionResult: boolean) => {
      const snapshot = enterScope(ctx);
      try {
        const branch = conditionResult ? thenBranch : elseBranch;
        const result = branch ? evaluate(branch, ctx) : null;

        if (result instanceof Promise) {
          return result.then(
            (result) => {
              exitScope(ctx, snapshot);
              return result;
            },
            (error) => {
              exitScope(ctx, snapshot);
              throw error;
            },
          );
        }

        exitScope(ctx, snapshot);
        return result;
      } catch (error) {
        exitScope(ctx, snapshot);
        throw error;
      }
    };

    const condResult = evaluate(cond, ctx);
    if (condResult instanceof Promise) {
      return condResult.then((res) => runBranch(res as boolean));
    }
    return runBranch(condResult as boolean);
  },
});
export { if_ as if };

/** Repeats a body while a condition is true. */
const while_ = defineOpcode<[boolean, unknown], any>("while", {
  metadata: {
    label: "While",
    category: "logic",
    description: "Loop while condition is true",
    layout: "control-flow",
    slots: [
      { name: "Condition", type: "block" },
      { name: "Body", type: "block" },
    ],
    parameters: [
      { name: "condition", type: "any" },
      { name: "body", type: "any" },
    ],
    returnType: "any",
    lazy: true,
  },
  handler: ([cond, body], ctx) => {
    let lastResult: any = null;

    const runBodyAsync = () => {
      const snapshot = enterScope(ctx);
      try {
        const bodyResult = evaluate(body, ctx);
        if (bodyResult instanceof Promise) {
          return bodyResult.then(
            (bRes) => {
              exitScope(ctx, snapshot);
              lastResult = bRes;
              return runLoop();
            },
            (err) => {
              exitScope(ctx, snapshot);
              if (err instanceof BreakSignal) {
                return err.value ?? lastResult;
              }
              throw err;
            },
          );
        }
        exitScope(ctx, snapshot);
        lastResult = bodyResult;
        return runLoop();
      } catch (e) {
        exitScope(ctx, snapshot);
        if (e instanceof BreakSignal) {
          return e.value ?? lastResult;
        }
        throw e;
      }
    };

    const runLoop = (): any => {
      while (true) {
        try {
          const condResult = evaluate(cond, ctx);

          if (condResult instanceof Promise) {
            return condResult.then((res) => {
              if (res) {
                return runBodyAsync();
              }
              return lastResult;
            });
          }

          if (!condResult) {
            return lastResult;
          }

          const snapshot = enterScope(ctx);
          try {
            const bodyResult = evaluate(body, ctx);
            if (bodyResult instanceof Promise) {
              return bodyResult.then(
                (bRes) => {
                  exitScope(ctx, snapshot);
                  lastResult = bRes;
                  return runLoop();
                },
                (err) => {
                  exitScope(ctx, snapshot);
                  if (err instanceof BreakSignal) {
                    return err.value ?? lastResult;
                  }
                  throw err;
                },
              );
            }
            exitScope(ctx, snapshot);
            lastResult = bodyResult;
          } catch (e) {
            exitScope(ctx, snapshot);
            if (e instanceof BreakSignal) {
              return e.value ?? lastResult;
            }
            throw e;
          }
        } catch (e) {
          if (e instanceof BreakSignal) {
            return e.value ?? lastResult;
          }
          throw e;
        }
      }
    };

    return runLoop();
  },
});
export { while_ as while };

/**
 * Iterates over a list.
 */
const for_ = defineOpcode<[string, readonly unknown[], unknown], any>("for", {
  metadata: {
    label: "For Loop",
    category: "logic",
    description: "Iterate over a list",
    layout: "control-flow",
    slots: [
      { name: "Var", type: "string" },
      { name: "List", type: "block" },
      { name: "Do", type: "block" },
    ],
    parameters: [
      { name: "variableName", type: "string" },
      { name: "list", type: "any" },
      { name: "body", type: "any" },
    ],
    returnType: "any",
    lazy: true,
  },
  handler: ([varName, listExpr, body], ctx) => {
    const runLoop = (list: any[]) => {
      if (!Array.isArray(list)) return null;

      let i = 0;
      let lastResult: any = null;

      const next = (): any => {
        while (i < list.length) {
          const item = list[i++];

          // Create a new scope for the iteration
          const snapshot = enterScope(ctx);
          // Explicitly fork for the loop variable because enterScope sets cow=true,
          // but we want to define the loop var in THIS new scope immediately.
          if (ctx.cow) {
            ctx.vars = Object.create(ctx.vars);
            ctx.cow = false;
          }
          ctx.vars[varName] = item;

          try {
            const result = evaluate(body, ctx);
            if (result instanceof Promise) {
              return result.then(
                (res) => {
                  exitScope(ctx, snapshot);
                  lastResult = res;
                  return next();
                },
                (err) => {
                  exitScope(ctx, snapshot);
                  if (err instanceof BreakSignal) {
                    return err.value ?? lastResult;
                  }
                  throw err;
                },
              );
            }
            exitScope(ctx, snapshot);
            lastResult = result;
          } catch (e) {
            exitScope(ctx, snapshot);
            if (e instanceof BreakSignal) {
              return e.value ?? lastResult;
            }
            throw e;
          }
        }
        return lastResult;
      };

      return next();
    };

    const listResult = evaluate(listExpr, ctx);
    if (listResult instanceof Promise) {
      return listResult.then((res) => runLoop(res as any[]));
    }
    return runLoop(listResult as any[]);
  },
});
export { for_ as for };

/**
 * Breaks out of the current loop.
 */
const break_ = defineOpcode<[unknown?], never>("break", {
  metadata: {
    label: "Break",
    category: "control-flow",
    description: "Break out of loop",
    slots: [{ name: "Value", type: "block" }],
    parameters: [{ name: "value", type: "any", optional: true }],
    returnType: "never",
  },
  handler: ([value], _ctx) => {
    throw new BreakSignal(value);
  },
});
export { break_ as break };

// Data Structures
/** Converts a value to a JSON string. */
export const jsonStringify = defineOpcode<[unknown], string>("json.stringify", {
  metadata: {
    label: "JSON Stringify",
    category: "data",
    description: "Convert to JSON string",
    slots: [{ name: "Value", type: "block" }],
    parameters: [{ name: "value", type: "unknown" }],
    returnType: "string",
  },
  handler: ([val], _ctx) => {
    return JSON.stringify(val);
  },
});

/** Parses a JSON string into a value. */
export const jsonParse = defineOpcode<[string], unknown>("json.parse", {
  metadata: {
    label: "JSON Parse",
    category: "data",
    description: "Parse JSON string",
    slots: [{ name: "String", type: "string" }],
    parameters: [{ name: "string", type: "string" }],
    returnType: "unknown",
  },
  handler: ([str], _ctx) => {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  },
});

/** Returns the type of a value. */
const typeof_ = defineOpcode<
  [unknown],
  "string" | "number" | "boolean" | "object" | "null" | "array"
>("typeof", {
  metadata: {
    label: "Type Of",
    category: "logic",
    description: "Get value type",
    slots: [{ name: "Value", type: "block" }],
    parameters: [{ name: "value", type: "unknown" }],
    returnType: "string",
  },
  handler: ([val], _ctx) => {
    if (Array.isArray(val)) return "array";
    if (val === null) return "null";
    return typeof val as "string" | "number" | "boolean" | "object" | "null" | "array";
  },
});
export { typeof_ as typeof };

// Variables
/** Defines a local variable in the current scope. */
const let_ = defineOpcode<[string, unknown], any>("let", {
  metadata: {
    label: "Let",
    category: "logic",
    description: "Define a local variable",
    slots: [
      { name: "Name", type: "string" },
      { name: "Value", type: "block" },
    ],
    parameters: [
      { name: "name", type: "string" },
      { name: "value", type: "unknown" },
    ],
    returnType: "any",
  },
  handler: ([name, value], ctx) => {
    ctx.vars = ctx.vars ?? {};
    if (ctx.cow) {
      ctx.vars = Object.create(ctx.vars);
      ctx.cow = false;
    }
    ctx.vars[name] = value;
    return value;
  },
});
export { let_ as let };

/** Retrieves a local variable from the current scope. */
const var_ = defineOpcode<[string], any>("var", {
  metadata: {
    label: "Get Variable",
    category: "logic",
    description: "Get local variable",
    slots: [{ name: "Name", type: "string" }],
    parameters: [{ name: "name", type: "string" }],
    returnType: "any",
  },
  handler: ([name], ctx) => {
    return ctx.vars?.[name] ?? null;
  },
});
export { var_ as var };

/**
 * Updates the value of an existing variable.
 */
const set_ = defineOpcode<[string, unknown], any>("set", {
  metadata: {
    label: "Set",
    category: "action",
    description: "Set variable value",
    slots: [
      { name: "Name", type: "string" },
      { name: "Value", type: "block" },
    ],
    parameters: [
      { name: "name", type: "string" },
      { name: "value", type: "unknown" },
    ],
    returnType: "any",
  },
  handler: ([name, value], ctx) => {
    if (ctx.vars) {
      setVar(ctx, name, value);
    }
    return value;
  },
});
export { set_ as set };

// System
/** Logs a message to the console/client. */
export const log = defineOpcode<[unknown, ...unknown[]], null>("log", {
  metadata: {
    label: "Log",
    category: "action",
    description: "Log to server console",
    slots: [{ name: "Message", type: "block" }],
    parameters: [
      { name: "message", type: "unknown" },
      { name: "...args", type: "unknown[]" },
    ],
    returnType: "null",
  },
  handler: ([...args], _ctx) => {
    console.log(...args);
    return null;
  },
});

/** Retrieves a specific argument passed to the script. */
export const arg = defineOpcode<[number], any>("arg", {
  metadata: {
    label: "Get Arg",
    category: "data",
    description: "Get argument by index",
    layout: "primitive",
    slots: [{ name: "Index", type: "number" }],
    genericParameters: ["T"],
    parameters: [{ name: "index", type: "number" }],
    returnType: "T",
  },
  handler: ([index], ctx) => {
    return ctx.args?.[index] ?? null;
  },
});

/** Retrieves all arguments passed to the script. */
export const args = defineOpcode<[], readonly any[]>("args", {
  metadata: {
    label: "Get Args",
    category: "data",
    description: "Get all arguments",
    slots: [],
    parameters: [],
    returnType: "readonly any[]",
  },
  handler: (_args, ctx) => {
    return ctx.args ?? [];
  },
});

/** Sends a warning message to the client. */
export const warn = defineOpcode<[unknown], void>("warn", {
  metadata: {
    label: "Warn",
    category: "action",
    description: "Send warning to client",
    slots: [{ name: "Message", type: "block" }],
    parameters: [{ name: "message", type: "unknown" }],
    returnType: "void",
  },
  handler: ([msg], ctx) => {
    ctx.warnings.push(String(msg));
  },
});

/** Throws an error, stopping script execution. */
const throw_ = defineOpcode<[unknown], never>("throw", {
  metadata: {
    label: "Throw",
    category: "action",
    description: "Throw an error",
    slots: [{ name: "Message", type: "block" }],
    parameters: [{ name: "message", type: "unknown" }],
    returnType: "never",
  },
  handler: ([msg], _ctx) => {
    throw new ScriptError(msg as string);
  },
});
export { throw_ as throw };

const try_ = defineOpcode<[unknown, string, unknown], any>("try", {
  metadata: {
    label: "Try/Catch",
    category: "logic",
    description: "Try/Catch block",
    layout: "control-flow",
    slots: [
      { name: "Try", type: "block" },
      { name: "ErrorVar", type: "string" },
      { name: "Catch", type: "block" },
    ],
    parameters: [
      { name: "try", type: "any" },
      { name: "errorVar", type: "string" },
      { name: "catch", type: "any" },
    ],
    returnType: "any",
    lazy: true,
  },
  handler: ([tryBlock, errorVar, catchBlock], ctx) => {
    const snapshot = enterScope(ctx);
    try {
      const result = evaluate(tryBlock, ctx);
      exitScope(ctx, snapshot);
      return result;
    } catch (e: any) {
      exitScope(ctx, snapshot); // Unwind try scope
      if (catchBlock) {
        const catchSnapshot = enterScope(ctx);
        if (errorVar && typeof errorVar === "string") {
          if (ctx.cow) {
            ctx.vars = Object.create(ctx.vars);
            ctx.cow = false;
          }
          ctx.vars[errorVar] = e.message ?? String(e);
        }
        try {
          const result = evaluate(catchBlock, ctx);
          exitScope(ctx, catchSnapshot);
          return result;
        } catch (err) {
          exitScope(ctx, catchSnapshot);
          throw err;
        }
      }
    }
  },
});
export { try_ as try };

/** Creates a lambda (anonymous function). */
export const lambda = defineOpcode<[ScriptRaw<readonly string[]>, unknown], any>("lambda", {
  metadata: {
    label: "Lambda",
    category: "func",
    description: "Create a lambda function",
    slots: [
      { name: "Args", type: "block" },
      { name: "Body", type: "block" },
    ],
    parameters: [
      { name: "args", type: "string[]" },
      { name: "body", type: "any" },
    ],
    returnType: "any",
    lazy: true,
  },
  handler: ([argNames, body], ctx) => {
    return {
      type: "lambda",
      args: argNames,
      body,
      closure: ctx.vars,
    };
  },
});

/** Calls a lambda function. */
export const apply = defineOpcode<[unknown, ...unknown[]], any>("apply", {
  metadata: {
    label: "Apply",
    category: "func",
    description: "Apply a lambda function",
    slots: [
      { name: "Func", type: "block" },
      { name: "Args...", type: "block" },
    ],
    parameters: [
      { name: "func", type: "unknown" },
      { name: "...args", type: "any[]" },
    ],
    returnType: "any",
  },
  handler: ([func, ...evaluatedArgs], ctx) => {
    if (!func) {
      throw new ScriptError("apply: func not found");
    }
    if ((func as any).type !== "lambda") {
      throw new ScriptError(`apply: func must be a lambda, got ${JSON.stringify(func)}`);
    }

    const lambdaFunc = func as any;

    // Create new context
    const newVars = Object.create(lambdaFunc.closure ?? null);
    // Bind arguments
    for (let i = 0; i < lambdaFunc.args.length; i++) {
      newVars[lambdaFunc.args[i]] = evaluatedArgs[i];
    }

    const newCtx = {
      ...ctx,
      vars: newVars,
      cow: true, // Allow reuse of this scope until modified
      stack: [...ctx.stack, { name: "<lambda>", args: evaluatedArgs }],
    };

    if (lambdaFunc.execute) {
      return lambdaFunc.execute(newCtx);
    }

    return evaluate(lambdaFunc.body, newCtx);
  },
});

/** Sends a message to the client. */
export const send = defineOpcode<[string, unknown], null>("send", {
  metadata: {
    label: "System Send",
    category: "system",
    description: "Send a system message",
    slots: [
      { name: "Type", type: "string" },
      { name: "Payload", type: "block" },
    ],
    parameters: [
      { name: "type", type: "string" },
      { name: "payload", type: "unknown" },
    ],
    returnType: "null",
  },
  handler: ([type, payload], ctx) => {
    ctx.send?.(type, payload);
    return null;
  },
});

/**
 * Returns the argument as is, without evaluation.
 * Used for passing arrays as values to opcodes.
 */
export const quote = defineOpcode<[any], any>("quote", {
  metadata: {
    label: "Quote",
    category: "data",
    description: "Return value unevaluated",
    slots: [{ name: "Value", type: "block" }],
    parameters: [{ name: "value", type: "any" }],
    returnType: "any",
    lazy: true,
  },
  handler: ([value], _ctx) => {
    return value;
  },
});
