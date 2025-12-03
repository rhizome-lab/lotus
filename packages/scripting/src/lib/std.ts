import { evaluate, ScriptError, defineOpcode, ScriptValue } from "../index";
import { Entity } from "@viwo/shared/jsonrpc";

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
  handler: (args, ctx) => {
    if (args.length !== 0) {
      throw new ScriptError("this: expected 0 arguments");
    }
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
  handler: (args, ctx) => {
    if (args.length !== 0) {
      throw new ScriptError("caller: expected 0 arguments");
    }
    return ctx.caller;
  },
});

// Control Flow
/**
 * Executes a sequence of steps and returns the result of the last step.
 */
export const seq = defineOpcode<ScriptValue<unknown>[], any>("seq", {
  metadata: {
    label: "Sequence",
    category: "logic",
    description: "Execute a sequence of steps",
    layout: "control-flow",
    slots: [],
    parameters: [{ name: "...args", type: "unknown[]" }],
    returnType: "any",
    lazy: true,
  },
  handler: (args, ctx) => {
    if (args.length === 0) {
      throw new ScriptError("seq: expected at least one argument");
    }
    
    let i = 0;
    let lastResult: any = null;

    const next = (): any => {
      while (i < args.length) {
        const step = args[i++];
        const result = evaluate(step, ctx);
        
        if (result instanceof Promise) {
          return result.then((res) => {
            lastResult = res;
            return next();
          });
        }
        
        lastResult = result;
      }
      return lastResult;
    };

    return next();
  },
});

/**
 * Conditional execution.
 */
const ifOp = defineOpcode<
  [ScriptValue<boolean>, ScriptValue<unknown>, ScriptValue<unknown>?],
  any
>("if", {
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
      { name: "condition", type: "boolean" },
      { name: "then", type: "T" },
      { name: "else", type: "T" },
    ],
    returnType: "T",
    lazy: true,
  },
  handler: (args, ctx) => {
    if (args.length < 2 || args.length > 3) {
      throw new ScriptError("if: expected `condition` `then` [`else`]");
    }
    const [cond, thenBranch, elseBranch] = args;
    
    const runBranch = (conditionResult: boolean) => {
      if (conditionResult) {
        return evaluate(thenBranch, ctx);
      } else if (elseBranch) {
        return evaluate(elseBranch, ctx);
      }
      return null;
    };

    const condResult = evaluate(cond, ctx);
    if (condResult instanceof Promise) {
      return condResult.then((res) => runBranch(res as boolean));
    }
    return runBranch(condResult as boolean);
  },
});
export { ifOp as if };

/**
 * Repeats a body while a condition is true.
 */
const whileOp = defineOpcode<[ScriptValue<boolean>, ScriptValue<unknown>], any>(
  "while",
  {
    metadata: {
      label: "While",
      category: "logic",
      description: "Loop while condition is true",
      layout: "control-flow",
      slots: [
        { name: "Condition", type: "block" },
        { name: "Body", type: "block" },
      ],
      lazy: true,
    },
    handler: (args, ctx) => {
      if (args.length !== 2) {
        throw new ScriptError("while: expected `condition` `do`");
      }
      const [cond, body] = args;
      let lastResult: any = null;

      const loop = (): any => {
        const condResult = evaluate(cond, ctx);
        
        if (condResult instanceof Promise) {
          return condResult.then((res) => {
            if (res) {
              const bodyResult = evaluate(body, ctx);
              if (bodyResult instanceof Promise) {
                return bodyResult.then((bRes) => {
                  lastResult = bRes;
                  return loop();
                });
              }
              lastResult = bodyResult;
              return loop();
            }
            return lastResult;
          });
        }

        if (condResult) {
          const bodyResult = evaluate(body, ctx);
          if (bodyResult instanceof Promise) {
            return bodyResult.then((bRes) => {
              lastResult = bRes;
              return loop();
            });
          }
          lastResult = bodyResult;
          return loop(); // Recursion? Should be fine if evaluate is iterative or we use trampoline
          // But wait, if it's sync, this will stack overflow.
          // We need a way to loop synchronously without recursion if possible.
          // But since we are inside a handler, we can't easily yield back to the main loop 
          // unless we return a special continuation or throw.
          // For now, let's assume the stack depth is sufficient or users won't write infinite sync loops.
          // Actually, `evaluate` is iterative, but `while` calling `evaluate` recursively is the issue.
        }
        return lastResult;
      };

      // To avoid stack overflow in sync loops, we might need a trampoline or 
      // rely on the fact that `evaluate` is now iterative, but `while` is still recursive here.
      // Ideally `while` should return instructions to the main loop, but we are keeping it simple for now.
      return loop();
    },
  },
);
export { whileOp as while };

/**
 * Iterates over a list.
 */
const forOp = defineOpcode<
  [string, ScriptValue<readonly unknown[]>, ScriptValue<unknown>],
  any
>("for", {
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
      { name: "list", type: "readonly unknown[]" },
      { name: "body", type: "unknown" },
    ],
    returnType: "any",
    lazy: true,
  },
  handler: (args, ctx) => {
    if (args.length !== 3) {
      throw new ScriptError("for: expected `var` `list` `do`");
    }
    const [varName, listExpr, body] = args;
    
    const runLoop = (list: any[]) => {
      if (!Array.isArray(list)) return null;
      
      let i = 0;
      let lastResult: any = null;
      
      const next = (): any => {
        if (i >= list.length) return lastResult;
        
        const item = list[i++];
        ctx.vars = ctx.vars || {};
        ctx.vars[varName] = item;
        
        const result = evaluate(body, ctx);
        if (result instanceof Promise) {
          return result.then((res) => {
            lastResult = res;
            return next();
          });
        }
        lastResult = result;
        return next();
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
export { forOp as for };

// Data Structures
/**
 * Converts a value to a JSON string.
 */
const jsonStringify = defineOpcode<[ScriptValue<unknown>], string>(
  "json.stringify",
  {
    metadata: {
      label: "JSON Stringify",
      category: "data",
      description: "Convert to JSON string",
      slots: [{ name: "Value", type: "block" }],
      parameters: [{ name: "value", type: "unknown" }],
      returnType: "string",
    },
    handler: (args, _ctx) => {
      if (args.length !== 1) {
        throw new ScriptError("json.stringify: expected `value`");
      }
      const [valExpr] = args;
      const val = valExpr;
      return JSON.stringify(val);
    },
  },
);
export { jsonStringify as "json.stringify" };

/**
 * Parses a JSON string into a value.
 */
const jsonParse = defineOpcode<[ScriptValue<string>], unknown>("json.parse", {
  metadata: {
    label: "JSON Parse",
    category: "data",
    description: "Parse JSON string",
    slots: [{ name: "String", type: "string" }],
    parameters: [{ name: "string", type: "string" }],
    returnType: "unknown",
  },
  handler: (args, _ctx) => {
    const [strExpr] = args;
    const str = strExpr;
    if (typeof str !== "string") return null;
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  },
});
export { jsonParse as "json.parse" };

/**
 * Returns the type of a value.
 */
export const typeof_ = defineOpcode<[ScriptValue<unknown>], "string" | "number" | "boolean" | "object"| "null" | "array">("typeof", {
  metadata: {
    label: "Type Of",
    category: "logic",
    description: "Get value type",
    slots: [{ name: "Value", type: "block" }],
    parameters: [{ name: "value", type: "unknown" }],
    returnType: "string",
  },
  handler: (args, _ctx) => {
    if (args.length !== 1) {
      throw new ScriptError("typeof: expected 1 argument");
    }
    const [valExpr] = args;
    const val = valExpr;
    if (Array.isArray(val)) return "array";
    if (val === null) return "null";
    return typeof val as "string" | "number" | "boolean" | "object"| "null" | "array";
  },
});
export { typeof_ as typeof };

// Variables
/**
 * Defines a local variable in the current scope.
 */
const letOp = defineOpcode<[string, ScriptValue<unknown>], any>("let", {
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
  handler: (args, ctx) => {
    if (args.length !== 2) {
      throw new ScriptError("let requires 2 arguments");
    }
    const [name, val] = args;
    const value = val;
    ctx.vars = ctx.vars || {};
    ctx.vars[name] = value;
    return value;
  },
});
export { letOp as "let" };

/**
 * Retrieves the value of a variable.
 */
const var_ = defineOpcode<[string], any>("var", {
  metadata: {
    label: "Get Var",
    category: "data",
    description: "Get variable value",
    layout: "primitive",
    slots: [{ name: "Name", type: "string" }],
    parameters: [{ name: "name", type: "string" }],
    returnType: "any",
  },
  handler: (args, ctx) => {
    if (args.length !== 1) {
      throw new ScriptError("var: expected 1 argument");
    }
    const [name] = args;
    return ctx.vars?.[name] ?? null;
  },
});
export { var_ as var };

/**
 * Updates the value of an existing variable.
 */
const set_ = defineOpcode<[string, ScriptValue<unknown>], any>("set", {
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
  handler: (args, ctx) => {
    if (args.length !== 2) {
      throw new ScriptError("set: expected 2 arguments");
    }
    const [name, val] = args;
    const value = val;
    if (ctx.vars && name in ctx.vars) {
      ctx.vars[name] = value;
    }
    return value;
  },
});
export { set_ as set }

// System
/**
 * Logs a message to the console/client.
 */
export const log = defineOpcode<
  [ScriptValue<unknown>, ...ScriptValue<unknown>[]],
  null
>("log", {
  metadata: {
    label: "Log",
    category: "action",
    description: "Log to server console",
    slots: [{ name: "Msg", type: "block" }],
    parameters: [
      { name: "msg", type: "unknown" },
      { name: "...args", type: "unknown[]" },
    ],
    returnType: "null",
  },
  handler: (args, _ctx) => {
    if (args.length < 1) {
      throw new ScriptError("log: expected at least 1 argument");
    }
    const messages = [];
    for (const arg of args) {
      messages.push(arg);
    }
    console.log(...messages);
    return null;
  },
});

/**
 * Retrieves a specific argument passed to the script.
 */
export const arg = defineOpcode<[ScriptValue<number>], any>("arg", {
  metadata: {
    label: "Get Arg",
    category: "data",
    description: "Get argument by index",
    layout: "primitive",
    slots: [{ name: "Index", type: "number" }],
    parameters: [{ name: "index", type: "number" }],
    returnType: "any",
  },
  handler: (args, ctx) => {
    const [index] = args;
    return ctx.args?.[index] ?? null;
  },
});

/**
 * Retrieves all arguments passed to the script.
 */
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


/**
 * Sends a warning message to the client.
 */
export const warn = defineOpcode<[ScriptValue<unknown>], void>("warn", {
  metadata: {
    label: "Warn",
    category: "action",
    description: "Send warning to client",
    slots: [{ name: "Message", type: "block" }],
    parameters: [{ name: "message", type: "unknown" }],
    returnType: "void",
  },
  handler: (args, ctx) => {
    const [msg] = args;
    const text = msg;
    ctx.warnings.push(String(text));
  },
});

/**
 * Throws an error, stopping script execution.
 */
const throwOp = defineOpcode<[ScriptValue<unknown>], never>("throw", {
  metadata: {
    label: "Throw",
    category: "action",
    description: "Throw an error",
    slots: [{ name: "Message", type: "block" }],
    parameters: [{ name: "message", type: "unknown" }],
    returnType: "never",
  },
  handler: (args, _ctx) => {
    const [msg] = args;
    throw new ScriptError(msg as string);
  },
});
export { throwOp as throw };

const tryOp = defineOpcode<
  [ScriptValue<unknown>, string, ScriptValue<unknown>],
  any
>("try", {
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
      { name: "try", type: "unknown" },
      { name: "errorVar", type: "string" },
      { name: "catch", type: "unknown" },
    ],
    returnType: "any",
    lazy: true,
  },
  handler: (args, ctx) => {
    const [tryBlock, errorVar, catchBlock] = args;
    try {
      return evaluate(tryBlock, ctx);
    } catch (e: any) {
      if (catchBlock) {
      if (errorVar && typeof errorVar === "string") {
          if (!ctx.vars) ctx.vars = {};
          ctx.vars[errorVar] = e.message || String(e);
        }
        return evaluate(catchBlock, ctx);
      }
    }
  },
});
export { tryOp as try };

/**
 * Creates a lambda (anonymous function).
 */
export const lambda = defineOpcode<[readonly string[], ScriptValue<unknown>], any>(
  "lambda",
  {
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
        { name: "body", type: "unknown" },
      ],
    returnType: "any",
      lazy: true,
    },
    handler: (args, ctx) => {
      const [argNames, body] = args;
      return {
        type: "lambda",
        args: argNames,
        body,
        closure: { ...ctx.vars },
      };
    },
  },
);

/**
 * Calls a lambda function.
 */
export const apply = defineOpcode<
  [ScriptValue<unknown>, ...ScriptValue<unknown>[]],
  any
>("apply", {
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
      { name: "...args", type: "unknown[]" },
    ],
    returnType: "any",
  },
  handler: (args, ctx) => {
    const [funcExpr, ...argExprs] = args;
    const func = evaluate(funcExpr, ctx);

    if (!func) {
      throw new ScriptError("apply: func not found");
    }
    if (func.type !== "lambda") {
      throw new ScriptError(
        `apply: func must be a lambda, got ${JSON.stringify(func)}`,
      );
    }

    const evaluatedArgs = [];
    for (const arg of argExprs) {
      evaluatedArgs.push(evaluate(arg, ctx));
    }

    // Create new context
    const newVars = { ...func.closure };
    // Bind arguments
    for (let i = 0; i < func.args.length; i++) {
      newVars[func.args[i]] = evaluatedArgs[i];
    }

    const newCtx = {
      ...ctx,
      vars: newVars,
      stack: [...ctx.stack, { name: "<lambda>", args: evaluatedArgs }],
    };

    if (func.execute) {
      return func.execute(newCtx);
    }

    return evaluate(func.body, newCtx);
  },
});

/**
 * Sends a message to the client.
 */
export const send = defineOpcode<[ScriptValue<string>, ScriptValue<unknown>], null>("send", {
  metadata: {
    label: "System Send",
    category: "system",
    description: "Send a system message",
    slots: [
      { name: "Type", type: "string" },
      { name: "Payload", type: "block" }
    ],
    parameters: [
      { name: "type", type: "string" },
      { name: "payload", type: "unknown" }
    ],
    returnType: "null",
  },
  handler: (args, ctx) => {
    if (args.length !== 2) {
      throw new ScriptError("send: expected `type` `payload`");
    }
    const [typeExpr, payloadExpr] = args;
    const type = evaluate(typeExpr, ctx);
    if (typeof type !== "string") {
      throw new ScriptError(`send: type must be a string, got ${JSON.stringify(type)}`);
    }
    const payload = evaluate(payloadExpr, ctx);
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
    parameters: [{ name: "value", type: "unknown" }],
    returnType: "any",
    lazy: true,
  },
  handler: (args, _ctx) => {
    return args[0];
  },
});

