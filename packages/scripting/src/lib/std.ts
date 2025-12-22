import { BreakSignal, ContinueSignal, ReturnSignal, evaluate } from "../interpreter";
import {
  type ScriptContext,
  ScriptError,
  type ScriptExpression,
  type ScriptRaw,
  type UnwrapScriptExpression,
  defineFullOpcode,
} from "../types";
import type { Entity } from "@viwo/shared/jsonrpc";

function enterScope(ctx: ScriptContext) {
  const snapshot = { cow: ctx.cow, vars: ctx.vars };
  ctx.cow = true;
  return snapshot;
}

function exitScope(ctx: ScriptContext, snapshot: { vars: Record<string, unknown>; cow: boolean }) {
  ctx.vars = snapshot.vars;
  ctx.cow = snapshot.cow;
}

function setVar(ctx: ScriptContext, name: string, value: any): boolean {
  let scope = ctx.vars;
  while (scope) {
    if (Object.hasOwn(scope, name)) {
      scope[name] = value;
      return true;
    }
    scope = Object.getPrototypeOf(scope);
  }
  return false;
}

// Values
/** Returns the current entity (this). */
const this_ = defineFullOpcode<[], Entity>("std.this", {
  handler: (_args, ctx) => ctx.this,
  metadata: {
    category: "data",
    description: "Current entity",
    label: "This",
    parameters: [],
    returnType: "Entity",
    slots: [],
  },
});
export { this_ as this };

/** Returns the entity that called the current script. */
export const caller = defineFullOpcode<[], Entity>("std.caller", {
  handler: (_args, ctx) => ctx.caller,
  metadata: {
    category: "data",
    description: "Current caller",
    label: "Caller",
    parameters: [],
    returnType: "Entity",
    slots: [],
  },
});

// Control Flow
/** Executes a sequence of steps and returns the result of the last step. */
const seq_ = defineFullOpcode<[...steps: unknown[]], any, true>("std.seq", {
  handler: ([...args], ctx) => {
    if (args.length === 0) {
      return null;
    }
    const snapshot = enterScope(ctx);
    let idx = 0;
    let lastResult: any = null;
    const next = (): any => {
      while (idx < args.length) {
        const step = args[idx];
        idx += 1;
        try {
          const result = evaluate(step, ctx, { catchReturn: false });

          if (result instanceof Promise) {
            return result.then((res) => {
              lastResult = res;
              return next();
            });
          }

          lastResult = result;
        } catch (error) {
          exitScope(ctx, snapshot);
          throw error;
        }
      }
      exitScope(ctx, snapshot);
      return lastResult;
    };

    try {
      return next();
    } catch (error) {
      exitScope(ctx, snapshot);
      throw error;
    }
  },
  metadata: {
    category: "logic",
    description: "Executes a sequence of steps and returns the result of the last step.",
    label: "Sequence",
    layout: "control-flow",
    lazy: true,
    parameters: [
      { description: "The sequence of steps to execute.", name: "...args", type: "any[]" },
    ],
    returnType: "any",
    slots: [],
  },
});
export const seq = seq_ as { [Key in keyof typeof seq_]: (typeof seq_)[Key] } & {
  <Ts extends unknown[]>(
    ...args: Ts
  ): ScriptExpression<
    any[],
    Ts extends [...unknown[], infer Last]
      ? UnwrapScriptExpression<Last>
      : UnwrapScriptExpression<Ts[number]>
  >;
};

/** Conditional execution. */
const if_ = defineFullOpcode<
  [condition: boolean, thenBranch: unknown, elseBranch?: unknown],
  any,
  true
>("std.if", {
  handler: ([cond, thenBranch, elseBranch], ctx) => {
    const runBranch = (conditionResult: boolean) => {
      const snapshot = enterScope(ctx);
      try {
        const branch = conditionResult ? thenBranch : elseBranch;
        const result = branch ? evaluate(branch, ctx, { catchReturn: false }) : null;
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
  metadata: {
    category: "control",
    description: "Conditionally executes a branch based on a boolean condition.",
    genericParameters: ["Type"],
    label: "If",
    layout: "control-flow",
    lazy: true,
    parameters: [
      {
        description: "The condition to check.",
        name: "condition",
        optional: false,
        type: "unknown",
      },
      {
        description: "The code to execute if true.",
        name: "then",
        optional: false,
        type: "Type",
      },
      {
        description: "The code to execute if false.",
        name: "else",
        optional: true,
        type: "Type",
      },
    ],
    returnType: "Type",
    slots: [
      { name: "Condition", type: "block" },
      { name: "Then", type: "block" },
      { name: "Else", type: "block" },
    ],
  },
});
export { if_ as if };

/** Repeats a body while a condition is true. */
const while_ = defineFullOpcode<[condition: boolean, body: unknown], any, true>("std.while", {
  handler: ([cond, body], ctx) => {
    const runBodyAsync = () => {
      const snapshot = enterScope(ctx);
      try {
        const bodyResult = evaluate(body, ctx, { catchReturn: false });
        if (bodyResult instanceof Promise) {
          return bodyResult.then(
            () => {
              exitScope(ctx, snapshot);
              return runLoop();
            },
            (error) => {
              exitScope(ctx, snapshot);
              if (error instanceof BreakSignal) {
                return null;
              }
              if (error instanceof ContinueSignal) {
                return runLoop();
              }
              throw error;
            },
          );
        }
        exitScope(ctx, snapshot);
        return runLoop();
      } catch (error) {
        exitScope(ctx, snapshot);
        if (error instanceof BreakSignal) {
          return null;
        }
        if (error instanceof ContinueSignal) {
          return runLoop();
        }
        throw error;
      }
    };

    const runLoop = (): any => {
      while (true) {
        try {
          const condResult = evaluate(cond, ctx, { catchReturn: false });
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
            const bodyResult = evaluate(body, ctx, { catchReturn: false });
            if (bodyResult instanceof Promise) {
              return bodyResult.then(
                () => {
                  exitScope(ctx, snapshot);
                  return runLoop();
                },
                (error) => {
                  exitScope(ctx, snapshot);
                  if (error instanceof BreakSignal) {
                    return null;
                  }
                  throw error;
                },
              );
            }
            exitScope(ctx, snapshot);
          } catch (error) {
            exitScope(ctx, snapshot);
            if (error instanceof BreakSignal) {
              return null;
            }
            throw error;
          }
        } catch (error) {
          if (error instanceof BreakSignal) {
            return null;
          }
          if (error instanceof ContinueSignal) {
            continue;
          }
          throw error;
        }
      }
    };

    return runLoop();
  },
  metadata: {
    category: "control",
    description: "Repeats a body while a condition is true.",
    label: "While",
    layout: "control-flow",
    lazy: true,
    parameters: [
      {
        description: "The condition to check before each iteration.",
        name: "condition",
        type: "any",
      },
      { description: "The code to execute in each iteration.", name: "body", type: "any" },
    ],
    returnType: "any",
    slots: [
      { name: "Condition", type: "block" },
      { name: "Body", type: "block" },
    ],
  },
});
export { while_ as while };

/** Iterates over a list. */
const for_ = defineFullOpcode<
  [varName: ScriptRaw<string>, list: readonly unknown[], body: unknown],
  any,
  true
>("std.for", {
  handler: ([varName, listExpr, body], ctx) => {
    const runLoop = (list: any[]) => {
      if (!Array.isArray(list)) {
        return null;
      }
      let idx = 0;
      const next = (): any => {
        while (idx < list.length) {
          const item = list[idx];
          idx += 1;

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
            const result = evaluate(body, ctx, { catchReturn: false });
            if (result instanceof Promise) {
              return result.then(
                () => {
                  exitScope(ctx, snapshot);
                  return next();
                },
                (error) => {
                  exitScope(ctx, snapshot);
                  if (error instanceof BreakSignal) {
                    return null;
                  }
                  if (error instanceof ContinueSignal) {
                    return next();
                  }
                  throw error;
                },
              );
            }
            exitScope(ctx, snapshot);
          } catch (error) {
            exitScope(ctx, snapshot);
            if (error instanceof BreakSignal) {
              return null;
            }
            if (error instanceof ContinueSignal) {
              return next();
            }
            throw error;
          }
        }
        return null;
      };

      return next();
    };

    const listResult = evaluate(listExpr, ctx, { catchReturn: false });
    if (listResult instanceof Promise) {
      return listResult.then((res) => runLoop(res as any[]));
    }
    return runLoop(listResult as any[]);
  },
  metadata: {
    category: "logic",
    description: "Iterates over a list, executing the body for each item.",
    label: "For Loop",
    layout: "control-flow",
    lazy: true,
    parameters: [
      { description: "The variable name.", name: "var", type: "string" },
      { description: "The list to iterate over.", name: "list", type: "any[]" },
      {
        description: "The code block to execute.",
        name: "block",
        optional: false,
        type: "unknown",
      },
    ],
    returnType: "any",
    slots: [
      { name: "Var", type: "string" },
      { name: "List", type: "block" },
      { name: "Do", type: "block" },
    ],
  },
});
export { for_ as for };

/** Breaks out of the current loop. */
const break_ = defineFullOpcode<[], never>("std.break", {
  handler: (_args, _ctx) => {
    throw new BreakSignal();
  },
  metadata: {
    category: "control",
    description: "Breaks out of the current loop.",
    label: "Break",
    layout: "control-flow",
    parameters: [],
    returnType: "never",
    slots: [],
  },
});
export { break_ as break };

/** Skips the rest of the current loop iteration. */
const continue_ = defineFullOpcode<[], never>("std.continue", {
  handler: (_args, _ctx) => {
    throw new ContinueSignal();
  },
  metadata: {
    category: "control",
    description: "Skips the rest of the current loop iteration.",
    label: "Continue",
    layout: "control-flow",
    parameters: [],
    returnType: "never",
    slots: [],
  },
});
export { continue_ as continue };

/**
 * Returns from the current function.
 */
const return_ = defineFullOpcode<[value?: unknown], never>("std.return", {
  handler: ([value], _ctx) => {
    throw new ReturnSignal(value);
  },
  metadata: {
    category: "control",
    description: "Returns from the current function, optionally returning a value.",
    label: "Return",
    layout: "control-flow",
    parameters: [
      {
        description: "The value to return.",
        name: "value",
        optional: true,
        type: "any",
      },
    ],
    returnType: "never",
    slots: [{ name: "Value", type: "block" }],
  },
});
export { return_ as return };

// Data Structures
/** Converts a value to a JSON string. */
export const jsonStringify = defineFullOpcode<[value: unknown], string>("json.stringify", {
  handler: ([val], _ctx) => JSON.stringify(val),
  metadata: {
    category: "data",
    description: "Converts a value to a JSON string.",
    label: "JSON Stringify",
    parameters: [{ description: "The value to stringify.", name: "value", type: "unknown" }],
    returnType: "string",
    slots: [{ name: "Value", type: "block" }],
  },
});

/** Parses a JSON string into a value. */
export const jsonParse = defineFullOpcode<[json: string], unknown>("json.parse", {
  handler: ([str], _ctx) => JSON.parse(str),
  metadata: {
    category: "data",
    description: "Parses a JSON string into a value.",
    label: "Parse JSON",
    parameters: [{ description: "The JSON string to parse.", name: "string", type: "string" }],
    returnType: "unknown",
    slots: [{ name: "String", type: "string" }],
  },
});

/** Returns the type of a value. */
const typeof_ = defineFullOpcode<
  [value: unknown],
  "string" | "number" | "boolean" | "object" | "null" | "array"
>("std.typeof", {
  handler: ([val], _ctx) =>
    Array.isArray(val)
      ? "array"
      : val === null
        ? "null"
        : (typeof val as "string" | "number" | "boolean" | "object" | "null" | "array"),
  metadata: {
    category: "logic",
    description: "Returns the type of a value as a string.",
    label: "Type Of",
    parameters: [
      {
        description: "The code block to execute.",
        name: "block",
        optional: false,
        type: "unknown",
      },
    ],
    returnType: "string",
    slots: [{ name: "Value", type: "block" }],
  },
});
export { typeof_ as typeof };

// Variables
/** Defines a local variable in the current scope. */
const let_ = defineFullOpcode<[name: string, value: unknown], any>("std.let", {
  handler: ([name, value], ctx) => {
    ctx.vars = ctx.vars ?? {};
    if (ctx.cow) {
      ctx.vars = Object.create(ctx.vars);
      ctx.cow = false;
    }
    ctx.vars[name] = value;
    return value;
  },
  metadata: {
    category: "logic",
    description: "Defines a local variable in the current scope.",
    label: "Let",
    parameters: [
      { description: "The name of the variable.", name: "name", type: "string" },
      { description: "The initial value.", name: "value", type: "unknown" },
    ],
    returnType: "any",
    slots: [
      { name: "Name", type: "string" },
      { name: "Value", type: "block" },
    ],
  },
});
export { let_ as let };

/** Retrieves a local variable from the current scope. */
const var_ = defineFullOpcode<[name: string], any>("std.var", {
  handler: ([name], ctx) => ctx.vars?.[name] ?? null,
  metadata: {
    category: "data",
    description: "Retrieves a local variable from the current scope.",
    label: "Get Variable",
    parameters: [{ description: "The variable name.", name: "name", type: "string" }],
    returnType: "any",
    slots: [{ name: "Name", type: "string" }],
  },
});
export { var_ as var };

/**
 * Updates the value of an existing variable.
 */
const set_ = defineFullOpcode<[name: string, value: unknown], any>("std.set", {
  handler: ([name, value], ctx) => {
    if (!ctx.vars || !setVar(ctx, name, value)) {
      throw new ScriptError(`Cannot set undefined variable '${name}'`);
    }
    return value;
  },
  metadata: {
    category: "action",
    description: "Updates the value of an existing variable.",
    label: "Set",
    parameters: [
      { description: "The variable name.", name: "name", type: "string" },
      { description: "The value to set.", name: "value", type: "unknown" },
    ],
    returnType: "any",
    slots: [
      { name: "Name", type: "string" },
      { name: "Value", type: "block" },
    ],
  },
});
export { set_ as set };

// Numbers
/** Parses a string into an integer. */
export const int = defineFullOpcode<[value: string, radix?: number], number>("std.int", {
  handler: ([str, radix], _ctx) => parseInt(str, radix),
  metadata: {
    category: "data",
    description: "Parses a string into an integer.",
    label: "Parse Integer",
    parameters: [
      { description: "The string to parse.", name: "string", type: "string" },
      {
        description: "The radix (2-36).",
        name: "radix",
        optional: true,
        type: "number",
      },
    ],
    returnType: "number",
    slots: [
      { name: "String", type: "string" },
      { default: 10, name: "Radix", type: "number" },
    ],
  },
});

/** Parses a string into a float. */
export const float = defineFullOpcode<[value: string], number>("std.float", {
  handler: ([str], _ctx) => parseFloat(str),
  metadata: {
    category: "data",
    description: "Parses a string into a floating-point number.",
    label: "Parse Float",
    parameters: [{ description: "The string to parse.", name: "string", type: "string" }],
    returnType: "number",
    slots: [{ name: "String", type: "string" }],
  },
});

/** Converts a value to a string. */
export const string = defineFullOpcode<[value: unknown], string>("std.string", {
  handler: ([val], _ctx) => String(val),
  metadata: {
    category: "data",
    description: "Converts a value to a string.",
    label: "To String",
    parameters: [{ description: "The value to convert.", name: "value", type: "unknown" }],
    returnType: "string",
    slots: [{ name: "Value", type: "block" }],
  },
});

/** Converts a value to a boolean. */
export const boolean = defineFullOpcode<[value: unknown], boolean>("std.boolean", {
  handler: ([val], _ctx) => Boolean(val),
  metadata: {
    category: "data",
    description: "Converts a value to a boolean.",
    label: "To Boolean",
    parameters: [{ description: "The value to convert.", name: "value", type: "unknown" }],
    returnType: "boolean",
    slots: [{ name: "Value", type: "block" }],
  },
});

/** Converts a value to a number. */
export const number = defineFullOpcode<[value: unknown], number>("std.number", {
  handler: ([val], _ctx) => Number(val),
  metadata: {
    category: "data",
    description: "Converts a value to a number.",
    label: "To Number",
    parameters: [{ description: "The value to convert.", name: "value", type: "unknown" }],
    returnType: "number",
    slots: [{ name: "Value", type: "block" }],
  },
});

// System
/** Logs a message to the console/client. */
export const log = defineFullOpcode<[message: unknown, ...args: unknown[]], null>("std.log", {
  handler: ([...args], _ctx) => {
    console.log(...args);
    return null;
  },
  metadata: {
    category: "io",
    description: "Logs a message to the console/client.",
    label: "Log",
    parameters: [
      { description: "The message to log.", name: "message", type: "unknown" },
      { description: "Additional arguments to log.", name: "...args", type: "unknown[]" },
    ],
    returnType: "null",
    slots: [{ name: "Message", type: "block" }],
  },
});

/** Retrieves a specific argument passed to the script. */
export const arg = defineFullOpcode<[index: number], any>("std.arg", {
  handler: ([index], ctx) => ctx.args?.[index] ?? null,
  metadata: {
    category: "data",
    description: "Retrieves a specific argument passed to the script.",
    genericParameters: ["Type"],
    label: "Get Argument",
    layout: "primitive",
    parameters: [{ description: "The index of the argument.", name: "index", type: "number" }],
    returnType: "Type",
    slots: [{ name: "Index", type: "number" }],
  },
});

/** Retrieves all arguments passed to the script. */
export const args = defineFullOpcode<[], any[]>("std.args", {
  handler: (_args, ctx) => [...(ctx.args ?? [])],
  metadata: {
    category: "data",
    description: "Get all arguments",
    label: "Get Arguments",
    parameters: [],
    returnType: "any[]",
    slots: [],
  },
});

/** Sends a warning message to the client. */
export const warn = defineFullOpcode<[message: unknown], void>("std.warn", {
  handler: ([msg], ctx) => {
    ctx.warnings.push(String(msg));
  },
  metadata: {
    category: "io",
    description: "Sends a warning message to the client.",
    label: "Warn",
    parameters: [{ description: "The warning message.", name: "message", type: "string" }],
    returnType: "void",
    slots: [{ name: "Message", type: "block" }],
  },
});

/** Throws an error, stopping script execution. */
const throw_ = defineFullOpcode<[message: unknown], never>("std.throw", {
  handler: ([msg], _ctx) => {
    throw new ScriptError(msg as string);
  },
  metadata: {
    category: "action",
    description: "Throws an error, stopping script execution.",
    label: "Throw",
    parameters: [{ description: "The error message.", name: "message", type: "string" }],
    returnType: "never",
    slots: [{ name: "Message", type: "block" }],
  },
});
export { throw_ as throw };

const try_ = defineFullOpcode<
  [tryBlock: unknown, errorVar: string, catchBlock: unknown],
  any,
  true
>("std.try", {
  handler: ([tryBlock, errorVar, catchBlock], ctx) => {
    const snapshot = enterScope(ctx);
    try {
      const result = evaluate(tryBlock, ctx, { catchReturn: false });
      exitScope(ctx, snapshot);
      return result;
    } catch (error: any) {
      if (
        error instanceof ReturnSignal ||
        error instanceof BreakSignal ||
        error instanceof ContinueSignal
      ) {
        exitScope(ctx, snapshot);
        throw error;
      }
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
          const result = evaluate(catchBlock, ctx, { catchReturn: false });
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
  metadata: {
    category: "control",
    description: "Executes a block of code and catches any errors.",
    label: "Try/Catch",
    layout: "control-flow",
    lazy: true,
    parameters: [
      { description: "The code to try executing.", name: "try", type: "any" },
      {
        description: "The name of the variable to store the error message.",
        name: "errorVar",
        type: "string",
      },
      { description: "The code to execute if an error occurs.", name: "catch", type: "any" },
    ],
    returnType: "any",
    slots: [
      { name: "Try", type: "block" },
      { name: "ErrorVar", type: "string" },
      { name: "Catch", type: "block" },
    ],
  },
});
export { try_ as try };

/** Creates a lambda (anonymous function). */
export const lambda = defineFullOpcode<
  [args: ScriptRaw<readonly string[]>, body: unknown],
  any,
  true
>("std.lambda", {
  handler: ([argNames, body], ctx) => ({
    args: argNames,
    body,
    closure: ctx.vars,
    type: "lambda",
  }),
  metadata: {
    category: "func",
    description: "Creates a lambda (anonymous function).",
    label: "Lambda",
    lazy: true,
    parameters: [
      { description: "The arguments.", name: "args", type: "unknown[]" },
      { description: "The function body.", name: "body", type: "unknown" },
    ],
    returnType: "any",
    slots: [
      { name: "Args", type: "block" },
      { name: "Body", type: "block" },
    ],
  },
});

/** Calls a lambda function. */
export const apply = defineFullOpcode<[lambda: unknown, ...args: unknown[]], any>("std.apply", {
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
    for (let idx = 0; idx < lambdaFunc.args.length; idx += 1) {
      newVars[lambdaFunc.args[idx]] = evaluatedArgs[idx];
    }

    const newCtx = {
      ...ctx,
      cow: true, // Allow reuse of this scope until modified
      stack: [...ctx.stack, { args: evaluatedArgs, name: "<lambda>" }],
      vars: newVars,
    };

    if (lambdaFunc.execute) {
      return lambdaFunc.execute(newCtx);
    }

    return evaluate(lambdaFunc.body, newCtx);
  },
  metadata: {
    category: "func",
    description: "Calls a lambda function with the provided arguments.",
    label: "Apply",
    parameters: [
      { description: "The lambda to execute.", name: "lambda", type: "unknown" },
      { description: "The arguments.", name: "...args", type: "unknown[]" },
    ],
    returnType: "any",
    slots: [
      { name: "Func", type: "block" },
      { name: "Args...", type: "block" },
    ],
  },
});

/** Sends a message to the client. */
export const send = defineFullOpcode<[type: string, payload: unknown], null>("send", {
  handler: ([type, payload], ctx) => {
    ctx.send?.(type, payload);
    return null;
  },
  metadata: {
    category: "system",
    description: "Sends a system message to the client.",
    label: "System Send",
    parameters: [
      { description: "The message type.", name: "type", type: "string" },
      { description: "The message payload.", name: "payload", type: "unknown" },
    ],
    returnType: "null",
    slots: [
      { name: "Type", type: "string" },
      { name: "Payload", type: "block" },
    ],
  },
});

/**
 * Returns the argument as is, without evaluation.
 * Used for passing arrays as values to opcodes.
 */
export const quote = defineFullOpcode<[value: ScriptRaw<unknown>], any, true>("std.quote", {
  handler: ([value], _ctx) => value,
  metadata: {
    category: "data",
    description:
      "Returns the argument as is, without evaluation. Used for passing arrays as values to opcodes.",
    genericParameters: ["Type"],
    label: "Quote",
    lazy: true,
    parameters: [{ description: "The value to quote.", name: "value", type: "Type" }],
    returnType: "Type",
    slots: [{ name: "Value", type: "block" }],
  },
});

/** Calls a method on an object, preserving the `this` context. */
export const callMethod = defineFullOpcode<[obj: any, method: string, ...args: any[]], any>(
  "std.call_method",
  {
    handler: ([obj, method, ...args], ctx) => {
      if (obj === null || obj === undefined) {
        throw new ScriptError(`Cannot call method '${method}' on ${obj}`);
      }
      const func = obj[method];
      if (typeof func !== "function") {
        throw new ScriptError(`Property '${method}' of ${String(obj)} is not a function`);
      }
      return func.call(obj, ...args, ctx);
    },
    metadata: {
      category: "logic",
      description: "Calls a method on an object, preserving context.",
      label: "Call Method",
      parameters: [
        { description: "The object.", name: "object", type: "any" },
        { description: "The method name.", name: "method", type: "string" },
        { description: "Arguments.", name: "...args", type: "any[]" },
      ],
      returnType: "any",
      slots: [
        { name: "Object", type: "block" },
        { name: "Method", type: "string" },
      ],
    },
  },
);
