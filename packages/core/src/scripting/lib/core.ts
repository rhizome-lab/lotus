import { evaluate, resolveProps, ScriptError, createScriptContext } from "../interpreter";
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
import { defineOpcode, ScriptValue } from "../def";
import { Entity } from "@viwo/shared/jsonrpc";

// Values
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
  handler: async (args, ctx) => {
    if (args.length !== 0) {
      throw new ScriptError("this: expected 0 arguments");
    }
    return ctx.this;
  },
});
export { this_ as this };

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
  handler: async (args, ctx) => {
    if (args.length !== 0) {
      throw new ScriptError("caller: expected 0 arguments");
    }
    return ctx.caller;
  },
});

// Control Flow
export const seq = defineOpcode<ScriptValue<unknown>[], any>("seq", {
  metadata: {
    label: "Sequence",
    category: "logic",
    description: "Execute a sequence of steps",
    layout: "control-flow",
    slots: [],
    parameters: [{ name: "...args", type: "unknown[]" }],
    returnType: "any",
  },
  handler: async (args, ctx) => {
    if (args.length === 0) {
      throw new ScriptError("seq: expected at least one argument");
    }
    let lastResult = null;
    for (const step of args) {
      lastResult = await evaluate(step, ctx);
    }
    return lastResult;
  },
});

const ifOp = defineOpcode<
  [ScriptValue<boolean>, ScriptValue<unknown>, ScriptValue<unknown>?],
  any
>("if", {
  metadata: {
    label: "If",
    category: "logic",
    description: "Conditional execution",
    layout: "control-flow",
    slots: [
      { name: "Condition", type: "block" },
      { name: "Then", type: "block" },
      { name: "Else", type: "block" },
    ],
    parameters: [
      { name: "condition", type: "boolean" },
      { name: "then", type: "unknown" },
      { name: "else", type: "unknown" },
    ],
    returnType: "any",
  },
  handler: async (args, ctx) => {
    if (args.length < 2 || args.length > 3) {
      throw new ScriptError("if: expected `condition` `then` [`else`]");
    }
    const [cond, thenBranch, elseBranch] = args;
    if (await evaluate(cond, ctx)) {
      return await evaluate(thenBranch, ctx);
    } else if (elseBranch) {
      return await evaluate(elseBranch, ctx);
    }
    return null;
  },
});
export { ifOp as if };

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
    },
    handler: async (args, ctx) => {
      if (args.length !== 2) {
        throw new ScriptError("while: expected `condition` `do`");
      }
      const [cond, body] = args;
      let result = null;
      while (await evaluate(cond, ctx)) {
        result = await evaluate(body, ctx);
      }
      return result;
    },
  },
);
export { whileOp as while };

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
  },
  handler: async (args, ctx) => {
    if (args.length !== 3) {
      throw new ScriptError("for: expected `var` `list` `do`");
    }
    const [varName, listExpr, body] = args;
    const list = await evaluate(listExpr, ctx);
    if (!Array.isArray(list)) return null;

    let lastResult = null;
    for (const item of list) {
      // Set loop variable
      ctx.vars = ctx.vars || {};
      ctx.vars[varName] = item;
      lastResult = await evaluate(body, ctx);
    }
    return lastResult;
  },
});
export { forOp as for };

// Data Structures
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
    handler: async (args, ctx) => {
      if (args.length !== 1) {
        throw new ScriptError("json.stringify: expected `value`");
      }
      const [valExpr] = args;
      const val = await evaluate(valExpr, ctx);
      return JSON.stringify(val);
    },
  },
);
export { jsonStringify as "json.stringify" };

const jsonParse = defineOpcode<[ScriptValue<string>], unknown>("json.parse", {
  metadata: {
    label: "JSON Parse",
    category: "data",
    description: "Parse JSON string",
    slots: [{ name: "String", type: "string" }],
    parameters: [{ name: "string", type: "string" }],
    returnType: "unknown",
  },
  handler: async (args, ctx) => {
    const [strExpr] = args;
    const str = await evaluate(strExpr, ctx);
    if (typeof str !== "string") return null;
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  },
});
export { jsonParse as "json.parse" };

// Variables
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
  handler: async (args, ctx) => {
    if (args.length !== 2) {
      throw new ScriptError("let requires 2 arguments");
    }
    const [name, val] = args;
    const value = await evaluate(val, ctx);
    ctx.vars = ctx.vars || {};
    ctx.vars[name] = value;
    return value;
  },
});
export { letOp as "let" };

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
  handler: async (args, ctx) => {
    if (args.length !== 1) {
      throw new ScriptError("var: expected 1 argument");
    }
    const [name] = args;
    return ctx.vars?.[name] ?? null;
  },
});
export { var_ as var };

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
  handler: async (args, ctx) => {
    if (args.length !== 2) {
      throw new ScriptError("set: expected 2 arguments");
    }
    const [name, val] = args;
    const value = await evaluate(val, ctx);
    if (ctx.vars && name in ctx.vars) {
      ctx.vars[name] = value;
    }
    return value;
  },
});
export { set_ as set }

// Comparison
const eq = defineOpcode<
  [ScriptValue<unknown>, ScriptValue<unknown>, ...ScriptValue<unknown>[]],
  boolean
>("==", {
  metadata: {
    label: "==",
    category: "logic",
    description: "Equality check",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
    parameters: [
      { name: "a", type: "unknown" },
      { name: "b", type: "unknown" },
      { name: "...args", type: "unknown[]" },
    ],
    returnType: "boolean",
  },
  handler: async (args, ctx) => {
    if (args.length < 2) {
      throw new ScriptError("==: expected at least 2 arguments");
    }
    let prev = await evaluate(args[0], ctx);
    for (let i = 1; i < args.length; i++) {
      const next = await evaluate(args[i], ctx);
      if (prev !== next) {
        return false;
      }
      prev = next;
    }
    return true;
  },
});
export { eq as "==" };

const neq = defineOpcode<
  [ScriptValue<unknown>, ScriptValue<unknown>, ...ScriptValue<unknown>[]],
  boolean
>("!=", {
  metadata: {
    label: "!=",
    category: "logic",
    description: "Inequality check",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
    parameters: [
      { name: "a", type: "unknown" },
      { name: "b", type: "unknown" },
      { name: "...args", type: "unknown[]" },
    ],
    returnType: "boolean",
  },
  handler: async (args, ctx) => {
    if (args.length < 2) {
      throw new ScriptError("!=: expected at least 2 arguments");
    }
    let prev = await evaluate(args[0], ctx);
    for (let i = 1; i < args.length; i++) {
      const next = await evaluate(args[i], ctx);
      if (prev === next) {
        return false;
      }
      prev = next;
    }
    return true;
  },
});
export { neq as "!=" };

const lt = defineOpcode<
  [ScriptValue<number>, ScriptValue<number>, ...ScriptValue<number>[]],
  boolean
>("<", {
  metadata: {
    label: "<",
    category: "logic",
    description: "Less than",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
    parameters: [
      { name: "a", type: "number" },
      { name: "b", type: "number" },
      { name: "...args", type: "number[]" },
    ],
    returnType: "boolean",
  },
  handler: async (args, ctx) => {
    if (args.length < 2) {
      throw new ScriptError("<: expected at least 2 arguments");
    }
    let prev = await evaluate(args[0], ctx);
    for (let i = 1; i < args.length; i++) {
      const next = await evaluate(args[i], ctx);
      if (prev >= next) {
        return false;
      }
      prev = next;
    }
    return true;
  },
});
export { lt as "<" };

const gt = defineOpcode<
  [ScriptValue<number>, ScriptValue<number>, ...ScriptValue<number>[]],
  boolean
>(">", {
  metadata: {
    label: ">",
    category: "logic",
    description: "Greater than",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
    parameters: [
      { name: "a", type: "number" },
      { name: "b", type: "number" },
      { name: "...args", type: "number[]" },
    ],
    returnType: "boolean",
  },
  handler: async (args, ctx) => {
    if (args.length < 2) {
      throw new ScriptError(">: expected at least 2 arguments");
    }
    let prev = await evaluate(args[0], ctx);
    for (let i = 1; i < args.length; i++) {
      const next = await evaluate(args[i], ctx);
      if (prev <= next) {
        return false;
      }
      prev = next;
    }
    return true;
  },
});
export { gt as ">" };

const lte = defineOpcode<
  [ScriptValue<number>, ScriptValue<number>, ...ScriptValue<number>[]],
  boolean
>("<=", {
  metadata: {
    label: "<=",
    category: "logic",
    description: "Less than or equal",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
    parameters: [
      { name: "a", type: "number" },
      { name: "b", type: "number" },
      { name: "...args", type: "number[]" },
    ],
    returnType: "boolean",
  },
  handler: async (args, ctx) => {
    if (args.length < 2) {
      throw new ScriptError("<=: expected at least 2 arguments");
    }
    let prev = await evaluate(args[0], ctx);
    for (let i = 1; i < args.length; i++) {
      const next = await evaluate(args[i], ctx);
      if (prev > next) {
        return false;
      }
      prev = next;
    }
    return true;
  },
});
export { lte as "<=" };

const gte = defineOpcode<
  [ScriptValue<number>, ScriptValue<number>, ...ScriptValue<number>[]],
  boolean
>(">=", {
  metadata: {
    label: ">=",
    category: "logic",
    description: "Greater than or equal",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
    parameters: [
      { name: "a", type: "number" },
      { name: "b", type: "number" },
      { name: "...args", type: "number[]" },
    ],
    returnType: "boolean",
  },
  handler: async (args, ctx) => {
    if (args.length < 2) {
      throw new ScriptError(">=: expected at least 2 arguments");
    }
    let prev = await evaluate(args[0], ctx);
    for (let i = 1; i < args.length; i++) {
      const next = await evaluate(args[i], ctx);
      if (prev < next) {
        return false;
      }
      prev = next;
    }
    return true;
  },
});
export { gte as ">=" };

// Arithmetic
const add = defineOpcode<
  [ScriptValue<number>, ScriptValue<number>, ...ScriptValue<number>[]],
  number
>("+", {
  metadata: {
    label: "+",
    category: "math",
    description: "Addition",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
    parameters: [
      { name: "a", type: "number" },
      { name: "b", type: "number" },
      { name: "...args", type: "number[]" },
    ],
    returnType: "number",
  },
  handler: async (args, ctx) => {
    if (args.length < 2) {
      throw new ScriptError("+: expected at least 2 arguments");
    }
    let sum = await evaluate(args[0], ctx);
    if (typeof sum !== "number") {
      throw new ScriptError(
        `+: expected a number at index 0, got ${JSON.stringify(sum)}`,
      );
    }
    for (let i = 1; i < args.length; i++) {
      const next = await evaluate(args[i], ctx);
      if (typeof next !== "number") {
        throw new ScriptError(
          `+: expected a number at index ${i}, got ${JSON.stringify(next)}`,
        );
      }
      sum += next;
    }
    return sum;
  },
});
export { add as "+" };

export const typeof_ = defineOpcode<[ScriptValue<unknown>], "string" | "number" | "boolean" | "object"| "null" | "array">("typeof", {
  metadata: {
    label: "Type Of",
    category: "logic",
    description: "Get value type",
    slots: [{ name: "Value", type: "block" }],
    parameters: [{ name: "value", type: "unknown" }],
    returnType: "string",
  },
  handler: async (args, ctx) => {
    if (args.length !== 1) {
      throw new ScriptError("typeof: expected 1 argument");
    }
    const [valExpr] = args;
    const val = await evaluate(valExpr, ctx);
    if (Array.isArray(val)) return "array";
    if (val === null) return "null";
    return typeof val as "string" | "number" | "boolean" | "object"| "null" | "array";
  },
});
export { typeof_ as typeof };


const sub = defineOpcode<
  [ScriptValue<number>, ScriptValue<number>, ...ScriptValue<number>[]],
  number
>("-", {
  metadata: {
    label: "-",
    category: "math",
    description: "Subtraction",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
    parameters: [
      { name: "a", type: "number" },
      { name: "b", type: "number" },
      { name: "...args", type: "number[]" },
    ],
    returnType: "number",
  },
  handler: async (args, ctx) => {
    if (args.length < 2) {
      throw new ScriptError("-: expected at least 2 arguments");
    }
    let diff = await evaluate(args[0], ctx);
    if (typeof diff !== "number") {
      throw new ScriptError(
        `-: expected a number at index 0, got ${JSON.stringify(diff)}`,
      );
    }
    for (let i = 1; i < args.length; i++) {
      const next = await evaluate(args[i], ctx);
      if (typeof next !== "number") {
        throw new ScriptError(
          `-: expected a number at index ${i}, got ${JSON.stringify(next)}`,
        );
      }
      diff -= next;
    }
    return diff;
  },
});
export { sub as "-" };

const mul = defineOpcode<
  [ScriptValue<number>, ScriptValue<number>, ...ScriptValue<number>[]],
  number
>("*", {
  metadata: {
    label: "*",
    category: "math",
    description: "Multiplication",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
    parameters: [
      { name: "a", type: "number" },
      { name: "b", type: "number" },
      { name: "...args", type: "number[]" },
    ],
    returnType: "number",
  },
  handler: async (args, ctx) => {
    if (args.length < 2) {
      throw new ScriptError("*: expected at least 2 arguments");
    }
    let prod = await evaluate(args[0], ctx);
    if (typeof prod !== "number") {
      throw new ScriptError(
        `*: expected a number at index 0, got ${JSON.stringify(prod)}`,
      );
    }
    for (let i = 1; i < args.length; i++) {
      const next = await evaluate(args[i], ctx);
      if (typeof next !== "number") {
        throw new ScriptError(
          `*: expected a number at index ${i}, got ${JSON.stringify(next)}`,
        );
      }
      prod *= next;
    }
    return prod;
  },
});
export { mul as "*" };

const div = defineOpcode<
  [ScriptValue<number>, ScriptValue<number>, ...ScriptValue<number>[]],
  number
>("/", {
  metadata: {
    label: "/",
    category: "math",
    description: "Division",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
    parameters: [
      { name: "a", type: "number" },
      { name: "b", type: "number" },
      { name: "...args", type: "number[]" },
    ],
    returnType: "number",
  },
  handler: async (args, ctx) => {
    if (args.length < 2) {
      throw new ScriptError("/: expected at least 2 arguments");
    }
    let quot = await evaluate(args[0], ctx);
    if (typeof quot !== "number") {
      throw new ScriptError(
        `/: expected a number at index 0, got ${JSON.stringify(quot)}`,
      );
    }
    for (let i = 1; i < args.length; i++) {
      const next = await evaluate(args[i], ctx);
      if (typeof next !== "number") {
        throw new ScriptError(
          `/: expected a number at index ${i}, got ${JSON.stringify(next)}`,
        );
      }
      quot /= next;
    }
    return quot;
  },
});
export { div as "/" };

const mod = defineOpcode<[ScriptValue<number>, ScriptValue<number>], number>(
  "%",
  {
    metadata: {
      label: "%",
      category: "math",
      description: "Modulo",
      layout: "infix",
      slots: [
        { name: "A", type: "block" },
        { name: "B", type: "block" },
      ],
      parameters: [
        { name: "a", type: "number" },
        { name: "b", type: "number" },
      ],
      returnType: "number",
    },
    handler: async (args, ctx) => {
      if (args.length !== 2) {
        throw new ScriptError("%: expected 2 arguments");
      }
      const aEval = await evaluate(args[0], ctx);
      if (typeof aEval !== "number") {
        throw new ScriptError(
          `%: expected a number at index 0, got ${JSON.stringify(aEval)}`,
        );
      }
      const bEval = await evaluate(args[1], ctx);
      if (typeof bEval !== "number") {
        throw new ScriptError(
          `%: expected a number at index 1, got ${JSON.stringify(bEval)}`,
        );
      }
      return aEval % bEval;
    },
  },
);
export { mod as "%" };

const pow = defineOpcode<
  [ScriptValue<number>, ScriptValue<number>, ...ScriptValue<number>[]],
  number
>("^", {
  metadata: {
    label: "^",
    category: "math",
    description: "Exponentiation",
    layout: "infix",
    slots: [
      { name: "Base", type: "block" },
      { name: "Exp", type: "block" },
    ],
    parameters: [
      { name: "base", type: "number" },
      { name: "exp", type: "number" },
      { name: "...args", type: "number[]" },
    ],
    returnType: "number",
  },
  handler: async (args, ctx) => {
    // Power tower
    if (args.length < 2) {
      throw new ScriptError("^: expected at least 2 arguments");
    }
    let pow = await evaluate(args[args.length - 1], ctx);
    if (typeof pow !== "number") {
      throw new ScriptError(
        `^: expected a number at index ${args.length - 1}, got ${JSON.stringify(
          pow,
        )}`,
      );
    }
    for (let i = args.length - 2; i >= 0; i--) {
      const next = await evaluate(args[i], ctx);
      if (typeof next !== "number") {
        throw new ScriptError(
          `^: expected a number at index ${i}, got ${JSON.stringify(next)}`,
        );
      }
      pow = next ** pow;
    }
    return pow;
  },
});
export { pow as "^" };

// Logic
export const and = defineOpcode<
  [ScriptValue<unknown>, ScriptValue<unknown>, ...ScriptValue<unknown>[]],
  boolean
>("and", {
  metadata: {
    label: "And",
    category: "logic",
    description: "Logical AND",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
    parameters: [
      { name: "a", type: "unknown" },
      { name: "b", type: "unknown" },
      { name: "...args", type: "unknown[]" },
    ],
    returnType: "boolean",
  },
  handler: async (args, ctx) => {
    if (args.length < 2) {
      throw new ScriptError("and: expected at least 2 arguments");
    }
    for (const arg of args) {
      if (!(await evaluate(arg, ctx))) return false;
    }
    return true;
  },
});

export const or = defineOpcode<
  [ScriptValue<unknown>, ScriptValue<unknown>, ...ScriptValue<unknown>[]],
  boolean
>("or", {
  metadata: {
    label: "Or",
    category: "logic",
    description: "Logical OR",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
    parameters: [
      { name: "a", type: "unknown" },
      { name: "b", type: "unknown" },
      { name: "...args", type: "unknown[]" },
    ],
    returnType: "boolean",
  },
  handler: async (args, ctx) => {
    if (args.length < 2) {
      throw new ScriptError("or: expected at least 2 arguments");
    }
    for (const arg of args) {
      if (await evaluate(arg, ctx)) return true;
    }
    return false;
  },
});

export const not = defineOpcode<[ScriptValue<unknown>], boolean>("not", {
  metadata: {
    label: "Not",
    category: "logic",
    description: "Logical NOT",
    slots: [{ name: "Val", type: "block" }],
    parameters: [{ name: "val", type: "unknown" }],
    returnType: "boolean",
  },
  handler: async (args, ctx) => {
    if (args.length !== 1) {
      throw new ScriptError("not: expected 1 argument");
    }
    return !(await evaluate(args[0], ctx));
  },
});

// System
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
  handler: async (args, ctx) => {
    if (args.length < 1) {
      throw new ScriptError("log: expected at least 1 argument");
    }
    const messages = [];
    for (const arg of args) {
      messages.push(await evaluate(arg, ctx));
    }
    console.log(...messages);
    return null;
  },
});

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
  handler: async (args, ctx) => {
    const [index] = args;
    return ctx.args?.[index] ?? null;
  },
});

export const args = defineOpcode<[], readonly any[]>("args", {
  metadata: {
    label: "Get Args",
    category: "data",
    description: "Get all arguments",
    slots: [],
    parameters: [],
    returnType: "readonly any[]",
  },
  handler: async (_args, ctx) => {
    return ctx.args ?? [];
  },
});

export const random = defineOpcode<
  [ScriptValue<number>?, ScriptValue<number>?],
  number
>("random", {
  metadata: {
    label: "Random",
    category: "math",
    description: "Generate random number",
    slots: [
      { name: "Min", type: "number", default: 0 },
      { name: "Max", type: "number", default: 1 },
    ],
    parameters: [
      { name: "min", type: "number" },
      { name: "max", type: "number" },
    ],
    returnType: "number",
  },
  handler: async (args, ctx) => {
    // random(max), random(min, max) or random() -> 0..1
    if (args.length > 2) {
      throw new ScriptError("random: expected 0, 1, or 2 arguments");
    }
    if (args.length === 0) return Math.random();
    const min = args.length === 2 ? await evaluate(args[0], ctx) : 0;
    const max = await evaluate(args[args.length === 2 ? 1 : 0], ctx);
    const shouldFloor = min % 1 === 0 && max % 1 === 0;
    if (typeof min !== "number") {
      throw new ScriptError("random: min must be a number");
    }
    if (typeof max !== "number") {
      throw new ScriptError("random: max must be a number");
    }
    if (min > max) {
      throw new ScriptError("random: min must be less than or equal to max");
    }
    const roll = Math.random() * (max - min + 1) + min;
    return shouldFloor ? Math.floor(roll) : roll;
  },
});

export const warn = defineOpcode<[ScriptValue<unknown>], void>("warn", {
  metadata: {
    label: "Warn",
    category: "action",
    description: "Send warning to client",
    slots: [{ name: "Message", type: "block" }],
    parameters: [{ name: "message", type: "unknown" }],
    returnType: "void",
  },
  handler: async (args, ctx) => {
    const [msg] = args;
    const text = await evaluate(msg, ctx);
    ctx.warnings.push(String(text));
  },
});

const throwOp = defineOpcode<[ScriptValue<unknown>], never>("throw", {
  metadata: {
    label: "Throw",
    category: "action",
    description: "Throw an error",
    slots: [{ name: "Message", type: "block" }],
    parameters: [{ name: "message", type: "unknown" }],
    returnType: "never",
  },
  handler: async (args, ctx) => {
    const [msg] = args;
    throw new ScriptError(await evaluate(msg, ctx));
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
  },
  handler: async (args, ctx) => {
    const [tryBlock, errorVar, catchBlock] = args;
    try {
      return await evaluate(tryBlock, ctx);
    } catch (e: any) {
      if (catchBlock) {
        if (errorVar && typeof errorVar === "string") {
          if (!ctx.vars) ctx.vars = {};
          ctx.vars[errorVar] = e.message || String(e);
        }
        return await evaluate(catchBlock, ctx);
      }
    }
  },
});
export { tryOp as try };

// Entity Interaction

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
      throw new ScriptError(`create: expected object, got ${JSON.stringify(data)}`);
    }
    return createEntity(data);
  },
});

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
    },
    handler: async (args, ctx) => {
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
  handler: async (args, ctx) => {
    const [funcExpr, ...argExprs] = args;
    const func = await evaluate(funcExpr, ctx);

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
      evaluatedArgs.push(await evaluate(arg, ctx));
    }

    // Create new context
    const newVars = { ...func.closure };
    // Bind arguments
    for (let i = 0; i < func.args.length; i++) {
      newVars[func.args[i]] = evaluatedArgs[i];
    }

    return await evaluate(func.body, {
      ...ctx,
      vars: newVars,
    });
  },
});

// TODO: Return verb result value?
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
      throw new ScriptError(`call: verb ${verb} not found on ${target.id}`);
    }

    return await evaluate(
      targetVerb.code,
      createScriptContext({
        caller: ctx.caller,
        this: target,
        args: evaluatedArgs,
        ...(ctx.send ? { send: ctx.send } : {}),
        warnings: ctx.warnings,
      }),
    );
  },
});

export const schedule = defineOpcode<
  [ScriptValue<string>, readonly ScriptValue<unknown>[], ScriptValue<number>],
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

export const send = defineOpcode<[ScriptValue<unknown>], null>("send", {
  metadata: {
    label: "System Send",
    category: "system",
    description: "Send a system message",
    slots: [{ name: "Msg", type: "block" }],
    parameters: [{ name: "msg", type: "unknown" }],
    returnType: "null",
  },
  handler: async (args, ctx) => {
    const [msgExpr] = args;
    const msg = await evaluate(msgExpr, ctx);
    ctx.send?.(msg);
    return null;
  },
});

// Entity Introspection
export const verbs = defineOpcode<[ScriptValue<unknown>], readonly Verb[]>("verbs", {
  metadata: {
    label: "Verbs",
    category: "world",
    description: "Get verbs of an entity",
    slots: [{ name: "Target", type: "block" }],
    parameters: [{ name: "target", type: "unknown" }],
    returnType: "readonly Verb[]",
  },
  handler: async (args, ctx) => {
    const [entityExpr] = args;
    const entity = await evaluate(entityExpr, ctx);
    if (typeof entity !== "object") {
      throw new ScriptError(
        `verbs: entity must be an object, got ${JSON.stringify(entity)}`,
      );
    }
    return getVerbs(entity.id);
  },
});

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

export const set_entity = defineOpcode<ScriptValue<Entity>[], null>("set_entity", {
  metadata: {
    label: "Set Entity",
    category: "action",
    description: "Set entity properties",
    slots: [{ name: "Entity", type: "block" }],
    parameters: [{ name: "...entity", type: "Entity[]" }],
    returnType: "null",
  },
  handler: async (args, ctx) => {
    if (args.length < 1) {
      throw new ScriptError("set_entity: expected `entity`");
    }
    let entities: Entity[] = [];
    for (const targetExpr of args) {
      const target = await evaluate(targetExpr, ctx);
      if (
        typeof target !== "object" ||
        !target ||
        typeof target.id !== "number"
      ) {
        throw new ScriptError(
          `set_entity: target must be an object, got ${JSON.stringify(target)}`,
        );
      }
      entities.push(target);
    }
    updateEntity(...entities);
    return null;
  },
});

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

