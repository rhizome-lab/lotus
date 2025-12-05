import { evaluate, BreakSignal, ReturnSignal } from "../interpreter";
import { Entity } from "@viwo/shared/jsonrpc";
import { defineFullOpcode, ScriptContext, ScriptError, ScriptRaw } from "../types";

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
/** Returns the current entity (this). */
const this_ = defineFullOpcode<[], Entity>("this", {
  metadata: {
    label: "To String",
    category: "data",
    description: "Current entity",
    slots: [],
    parameters: [],
    returnType: "Entity",
  },
  handler: (_args, ctx) => {
    return ctx.this;
  },
});
export { this_ as this };

/** Returns the entity that called the current script. */
export const caller = defineFullOpcode<[], Entity>("caller", {
  metadata: {
    label: "To Number",
    category: "data",
    description: "Current caller",
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
export const seq = defineFullOpcode<unknown[], any, true>("seq", {
  metadata: {
    label: "Sequence",
    category: "logic",
    description: "Executes a sequence of steps and returns the result of the last step.",
    layout: "control-flow",
    slots: [],
    parameters: [
      { name: "...args", type: "any[]", description: "The sequence of steps to execute." },
    ],
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
const if_ = defineFullOpcode<[boolean, unknown, unknown?], any, true>("if", {
  metadata: {
    label: "If",
    category: "control",
    layout: "control-flow",
    description: "Conditionally executes a branch based on a boolean condition.",
    genericParameters: ["T"],
    slots: [
      { name: "Condition", type: "block" },
      { name: "Then", type: "block" },
      { name: "Else", type: "block" },
    ],
    parameters: [
      {
        name: "condition",
        type: "unknown",
        optional: false,
        description: "The condition to check.",
      },
      {
        name: "then",
        type: "unknown",
        optional: false,
        description: "The code to execute if true.",
      },
      {
        name: "else",
        type: "unknown",
        optional: true,
        description: "The code to execute if false.",
      },
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
const while_ = defineFullOpcode<[boolean, unknown], any, true>("while", {
  metadata: {
    label: "While",
    category: "control",
    layout: "control-flow",
    description: "Repeats a body while a condition is true.",
    slots: [
      { name: "Condition", type: "block" },
      { name: "Body", type: "block" },
    ],
    parameters: [
      {
        name: "condition",
        type: "any",
        description: "The condition to check before each iteration.",
      },
      { name: "body", type: "any", description: "The code to execute in each iteration." },
    ],
    returnType: "any",
    lazy: true,
  },
  handler: ([cond, body], ctx) => {
    const runBodyAsync = () => {
      const snapshot = enterScope(ctx);
      try {
        const bodyResult = evaluate(body, ctx);
        if (bodyResult instanceof Promise) {
          return bodyResult.then(
            () => {
              exitScope(ctx, snapshot);
              return runLoop();
            },
            (err) => {
              exitScope(ctx, snapshot);
              if (err instanceof BreakSignal) {
                return null;
              }
              throw err;
            },
          );
        }
        exitScope(ctx, snapshot);
        return runLoop();
      } catch (e) {
        exitScope(ctx, snapshot);
        if (e instanceof BreakSignal) {
          return null;
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
              return null;
            });
          }

          if (!condResult) {
            return null;
          }

          const snapshot = enterScope(ctx);
          try {
            const bodyResult = evaluate(body, ctx);
            if (bodyResult instanceof Promise) {
              return bodyResult.then(
                () => {
                  exitScope(ctx, snapshot);
                  return runLoop();
                },
                (err) => {
                  exitScope(ctx, snapshot);
                  if (err instanceof BreakSignal) {
                    return null;
                  }
                  throw err;
                },
              );
            }
            exitScope(ctx, snapshot);
          } catch (e) {
            exitScope(ctx, snapshot);
            if (e instanceof BreakSignal) {
              return null;
            }
            throw e;
          }
        } catch (e) {
          if (e instanceof BreakSignal) {
            return null;
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
const for_ = defineFullOpcode<[ScriptRaw<string>, readonly unknown[], unknown], any, true>("for", {
  metadata: {
    label: "For Loop",
    category: "logic",
    description: "Iterates over a list, executing the body for each item.",
    layout: "control-flow",
    slots: [
      { name: "Var", type: "string" },
      { name: "List", type: "block" },
      { name: "Do", type: "block" },
    ],
    parameters: [
      { name: "var", type: "string", description: "The variable name." },
      { name: "list", type: "any[]", description: "The list to iterate over." },
      {
        name: "block",
        type: "unknown",
        optional: false,
        description: "The code block to execute.",
      },
    ],
    returnType: "any",
    lazy: true,
  },
  handler: ([varName, listExpr, body], ctx) => {
    const runLoop = (list: any[]) => {
      if (!Array.isArray(list)) return null;

      let i = 0;

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
                () => {
                  exitScope(ctx, snapshot);
                  return next();
                },
                (err) => {
                  exitScope(ctx, snapshot);
                  if (err instanceof BreakSignal) {
                    return null;
                  }
                  throw err;
                },
              );
            }
            exitScope(ctx, snapshot);
          } catch (e) {
            exitScope(ctx, snapshot);
            if (e instanceof BreakSignal) {
              return null;
            }
            throw e;
          }
        }
        return null;
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

/** Breaks out of the current loop. */
const break_ = defineFullOpcode<[], never>("break", {
  metadata: {
    label: "Unless",
    category: "control",
    layout: "control-flow",
    description: "Breaks out of the current loop.",
    slots: [],
    parameters: [],
    returnType: "never",
  },
  handler: (_args, _ctx) => {
    throw new BreakSignal();
  },
});
export { break_ as break };

/**
 * Returns from the current function.
 */
const return_ = defineFullOpcode<[unknown?], never>("return", {
  metadata: {
    label: "Return",
    category: "control",
    layout: "control-flow",
    description: "Returns from the current function, optionally returning a value.",
    slots: [{ name: "Value", type: "block" }],
    parameters: [
      {
        name: "value",
        type: "any",
        optional: true,
        description: "The value to return.",
      },
    ],
    returnType: "never",
  },
  handler: ([value], _ctx) => {
    throw new ReturnSignal(value);
  },
});
export { return_ as return };

// Data Structures
/** Converts a value to a JSON string. */
export const jsonStringify = defineFullOpcode<[unknown], string>("json.stringify", {
  metadata: {
    label: "JSON Stringify",
    category: "data",
    description: "Converts a value to a JSON string.",
    slots: [{ name: "Value", type: "block" }],
    parameters: [{ name: "value", type: "unknown", description: "The value to stringify." }],
    returnType: "string",
  },
  handler: ([val], _ctx) => {
    return JSON.stringify(val);
  },
});

/** Parses a JSON string into a value. */
export const jsonParse = defineFullOpcode<[string], unknown>("json.parse", {
  metadata: {
    label: "Assign Variable",
    category: "data",
    description: "Parses a JSON string into a value.",
    slots: [{ name: "String", type: "string" }],
    parameters: [{ name: "string", type: "string", description: "The JSON string to parse." }],
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
const typeof_ = defineFullOpcode<
  [unknown],
  "string" | "number" | "boolean" | "object" | "null" | "array"
>("typeof", {
  metadata: {
    label: "Type Of",
    category: "logic",
    description: "Returns the type of a value as a string.",
    slots: [{ name: "Value", type: "block" }],
    parameters: [
      {
        name: "block",
        type: "unknown",
        optional: false,
        description: "The code block to execute.",
      },
    ],
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
const let_ = defineFullOpcode<[string, unknown], any>("let", {
  metadata: {
    label: "Let",
    category: "logic",
    description: "Defines a local variable in the current scope.",
    slots: [
      { name: "Name", type: "string" },
      { name: "Value", type: "block" },
    ],
    parameters: [
      { name: "name", type: "string", description: "The name of the variable." },
      { name: "value", type: "unknown", description: "The initial value." },
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
const var_ = defineFullOpcode<[string], any>("var", {
  metadata: {
    label: "Define Variable",
    category: "data",
    description: "Retrieves a local variable from the current scope.",
    slots: [{ name: "Name", type: "string" }],
    parameters: [{ name: "name", type: "string", description: "The variable name." }],
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
const set_ = defineFullOpcode<[string, unknown], any>("set", {
  metadata: {
    label: "Set",
    category: "action",
    description: "Updates the value of an existing variable.",
    slots: [
      { name: "Name", type: "string" },
      { name: "Value", type: "block" },
    ],
    parameters: [
      { name: "name", type: "string", description: "The variable name." },
      { name: "value", type: "unknown", description: "The value to set." },
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
export const log = defineFullOpcode<[unknown, ...unknown[]], null>("log", {
  metadata: {
    label: "Log",
    category: "io",
    description: "Logs a message to the console/client.",
    slots: [{ name: "Message", type: "block" }],
    parameters: [
      { name: "message", type: "unknown", description: "The message to log." },
      { name: "...args", type: "unknown[]", description: "Additional arguments to log." },
    ],
    returnType: "null",
  },
  handler: ([...args], _ctx) => {
    console.log(...args);
    return null;
  },
});

/** Retrieves a specific argument passed to the script. */
export const arg = defineFullOpcode<[number], any>("arg", {
  metadata: {
    label: "Get Argument",
    category: "data",
    layout: "primitive",
    description: "Retrieves a specific argument passed to the script.",
    slots: [{ name: "Index", type: "number" }],
    genericParameters: ["T"],
    parameters: [{ name: "index", type: "number", description: "The index of the argument." }],
    returnType: "T",
  },
  handler: ([index], ctx) => {
    return ctx.args?.[index] ?? null;
  },
});

/** Retrieves all arguments passed to the script. */
export const args = defineFullOpcode<[], readonly any[]>("args", {
  metadata: {
    label: "Define Constant",
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
export const warn = defineFullOpcode<[unknown], void>("warn", {
  metadata: {
    label: "Warn",
    category: "io",
    description: "Sends a warning message to the client.",
    slots: [{ name: "Message", type: "block" }],
    parameters: [{ name: "message", type: "string", description: "The warning message." }],
    returnType: "void",
  },
  handler: ([msg], ctx) => {
    ctx.warnings.push(String(msg));
  },
});

/** Throws an error, stopping script execution. */
const throw_ = defineFullOpcode<[unknown], never>("throw", {
  metadata: {
    label: "Throw",
    category: "action",
    description: "Throws an error, stopping script execution.",
    slots: [{ name: "Message", type: "block" }],
    parameters: [{ name: "message", type: "string", description: "The error message." }],
    returnType: "never",
  },
  handler: ([msg], _ctx) => {
    throw new ScriptError(msg as string);
  },
});
export { throw_ as throw };

const try_ = defineFullOpcode<[unknown, string, unknown], any, true>("try", {
  metadata: {
    label: "Try/Catch",
    category: "control",
    layout: "control-flow",
    description: "Executes a block of code and catches any errors.",
    slots: [
      { name: "Try", type: "block" },
      { name: "ErrorVar", type: "string" },
      { name: "Catch", type: "block" },
    ],
    parameters: [
      { name: "try", type: "any", description: "The code to try executing." },
      {
        name: "errorVar",
        type: "string",
        description: "The name of the variable to store the error message.",
      },
      { name: "catch", type: "any", description: "The code to execute if an error occurs." },
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
    } catch (error: any) {
      exitScope(ctx, snapshot); // Unwind try scope
      if (catchBlock) {
        const catchSnapshot = enterScope(ctx);
        if (errorVar && typeof errorVar === "string") {
          if (ctx.cow) {
            ctx.vars = Object.create(ctx.vars);
            ctx.cow = false;
          }
          ctx.vars[errorVar] = error.message ?? String(error);
        }
        try {
          const result = evaluate(catchBlock, ctx);
          exitScope(ctx, catchSnapshot);
          return result;
        } catch (error) {
          exitScope(ctx, catchSnapshot);
          throw error;
        }
      }
      throw error;
    }
  },
});
export { try_ as try };

/** Creates a lambda (anonymous function). */
export const lambda = defineFullOpcode<[ScriptRaw<readonly string[]>, unknown], any, true>(
  "lambda",
  {
    metadata: {
      label: "Lambda",
      category: "func",
      description: "Creates a lambda (anonymous function).",
      slots: [
        { name: "Args", type: "block" },
        { name: "Body", type: "block" },
      ],
      parameters: [
        { name: "args", type: "unknown[]", description: "The arguments." },
        { name: "body", type: "unknown", description: "The function body." },
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
  },
);

/** Calls a lambda function. */
export const apply = defineFullOpcode<[unknown, ...unknown[]], any>("apply", {
  metadata: {
    label: "Apply",
    category: "func",
    description: "Calls a lambda function with the provided arguments.",
    slots: [
      { name: "Func", type: "block" },
      { name: "Args...", type: "block" },
    ],
    parameters: [
      { name: "lambda", type: "unknown", description: "The lambda to execute." },
      { name: "...args", type: "unknown[]", description: "The arguments." },
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
export const send = defineFullOpcode<[string, unknown], null>("send", {
  metadata: {
    label: "System Send",
    category: "system",
    description: "Sends a system message to the client.",
    slots: [
      { name: "Type", type: "string" },
      { name: "Payload", type: "block" },
    ],
    parameters: [
      { name: "type", type: "string", description: "The message type." },
      { name: "payload", type: "unknown", description: "The message payload." },
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
export const quote = defineFullOpcode<[ScriptRaw<unknown>], any, true>("quote", {
  metadata: {
    label: "Quote",
    category: "data",
    description:
      "Returns the argument as is, without evaluation. Used for passing arrays as values to opcodes.",
    slots: [{ name: "Value", type: "block" }],
    parameters: [{ name: "value", type: "any", description: "The value to quote." }],
    returnType: "any",
    lazy: true,
  },
  handler: ([value], _ctx) => {
    return value;
  },
});
