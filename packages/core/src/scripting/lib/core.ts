import {
  evaluate,
  resolveProps,
  ScriptError,
} from "../interpreter";
import { updateEntity } from "../../repo";
import { defineOpcode, ScriptValue } from "../def";

// Control Flow
const seq = defineOpcode<ScriptValue<unknown>[], any>(
  "seq",
  {
    metadata: {
      label: "Sequence",
      category: "logic",
      description: "Execute a sequence of steps",
      layout: "control-flow",
      slots: [],
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
  }
);
export { seq };

const ifOp = defineOpcode<[ScriptValue<boolean>, ScriptValue<unknown>, ScriptValue<unknown>?], any>(
  "if",
  {
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
  }
);
export { ifOp as "if" };

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
  }
);
export { whileOp as "while" };

const forOp = defineOpcode<[string, ScriptValue<readonly unknown[]>, ScriptValue<unknown>], any>(
  "for",
  {
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
  }
);
export { forOp as "for" };

// Data Structures
const jsonStringify = defineOpcode<[ScriptValue<unknown>], string>(
  "json.stringify",
  {
    metadata: {
      label: "JSON Stringify",
      category: "data",
      description: "Convert to JSON string",
      slots: [{ name: "Value", type: "block" }],
    },
    handler: async (args, ctx) => {
      if (args.length !== 1) {
        throw new ScriptError("json.stringify: expected `value`");
      }
      const [valExpr] = args;
      const val = await evaluate(valExpr, ctx);
      return JSON.stringify(val);
    },
  }
);
export { jsonStringify as "json.stringify" };

const jsonParse = defineOpcode<[ScriptValue<string>], unknown>(
  "json.parse",
  {
    metadata: {
      label: "JSON Parse",
      category: "data",
      description: "Parse JSON string",
      slots: [{ name: "String", type: "string" }],
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
  }
);
export { jsonParse as "json.parse" };

// Entity Introspection
const prop = defineOpcode<[ScriptValue<unknown>, ScriptValue<string>], any>(
  "prop",
  {
    metadata: {
      label: "Get Property",
      category: "data",
      description: "Get entity property",
      slots: [
        { name: "Entity", type: "block" },
        { name: "Prop", type: "string" },
      ],
    },
    handler: async (args, ctx) => {
      if (args.length !== 2) {
        throw new ScriptError("prop: expected `entity` `prop`");
      }
      const [targetExpr, keyExpr] = args;
      const target = await evaluate(targetExpr, ctx);
      const key = await evaluate(keyExpr, ctx);
      if (typeof target !== "object") {
        throw new ScriptError(`prop: target must be an object, got ${JSON.stringify(target)}`);
      }
      if (typeof key !== "string") {
        throw new ScriptError(`prop: key must be a string, got ${JSON.stringify(key)}`);
      }
      return target[key];
    },
  }
);
export { prop };

const setProp = defineOpcode<[ScriptValue<unknown>, ScriptValue<string>, ScriptValue<unknown>], void>(
  "set_prop",
  {
    metadata: {
      label: "Set Property",
      category: "action",
      description: "Set entity property",
      slots: [
        { name: "Entity", type: "block" },
        { name: "Prop", type: "string" },
        { name: "Value", type: "block" },
      ],
    },
    handler: async (args, ctx) => {
      if (args.length !== 3) {
        throw new ScriptError("set_prop: expected `entity` `prop` `value`");
      }
      const [targetExpr, propExpr, valExpr] = args;
      const target = await evaluate(targetExpr, ctx);
      if (typeof target !== "object") {
        throw new ScriptError(`set_prop: target must be an object, got ${JSON.stringify(target)}`);
      }
      const prop = await evaluate(propExpr, ctx);
      if (typeof prop !== "string") {
        throw new ScriptError(`set_prop: property name must be a string, got ${JSON.stringify(prop)}`);
      }
      const val = await evaluate(valExpr, ctx);
      const { id: _, ...props } = target;
      updateEntity(target.id, { ...props, [prop]: val });
    },
  }
);
export { setProp as "set_prop" };

const hasProp = defineOpcode<[ScriptValue<unknown>, ScriptValue<string>], boolean>(
  "has_prop",
  {
    metadata: {
      label: "Has Property",
      category: "data",
      description: "Check if entity has property",
      slots: [
        { name: "Entity", type: "block" },
        { name: "Prop", type: "string" },
      ],
    },
    handler: async (args, ctx) => {
      if (args.length !== 2) {
        throw new ScriptError("has_prop: expected `entity` `prop`");
      }
      const [targetExpr, propExpr] = args;
      const target = await evaluate(targetExpr, ctx);
      if (typeof target !== "object") {
        throw new ScriptError(`has_prop: target must be an object, got ${JSON.stringify(target)}`);
      }
      const prop = await evaluate(propExpr, ctx);
      if (typeof prop !== "string") {
        throw new ScriptError(`has_prop: property name must be a string, got ${JSON.stringify(prop)}`);
      }
      return Object.hasOwnProperty.call(target, prop);
    },
  }
);
export { hasProp as "has_prop" };

const deleteProp = defineOpcode<[ScriptValue<any>, ScriptValue<string>], void>(
  "delete_prop",
  {
    metadata: {
      label: "Delete Property",
      category: "action",
      description: "Delete entity property",
      slots: [
        { name: "Entity", type: "block" },
        { name: "Prop", type: "string" },
      ],
    },
    handler: async (args, ctx) => {
      if (args.length !== 2) {
        throw new ScriptError("delete_prop: expected `entity` `prop`");
      }
      const [targetExpr, propExpr] = args;
      const target = await evaluate(targetExpr, ctx);
      if (typeof target !== "object") {
        throw new ScriptError(`delete_prop: target must be an object, got ${JSON.stringify(target)}`);
      }
      const prop = await evaluate(propExpr, ctx);
      if (typeof prop !== "string") {
        throw new ScriptError(`delete_prop: property name must be a string, got ${JSON.stringify(prop)}`);
      }
      const { [prop]: _, ...newProps } = target;
      updateEntity(target.id, newProps);
    },
  }
);
export { deleteProp as "delete_prop" };

// Variables
const letOp = defineOpcode<[string, ScriptValue<any>], any>(
  "let",
  {
    metadata: {
      label: "Let",
      category: "logic",
      description: "Define a local variable",
      slots: [
        { name: "Name", type: "string" },
        { name: "Value", type: "block" },
      ],
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
  }
);
export { letOp as "let" };

const varOp = defineOpcode<[string], any>(
  "var",
  {
    metadata: {
      label: "Get Var",
      category: "data",
      description: "Get variable value",
      layout: "primitive",
      slots: [{ name: "Name", type: "string" }],
    },
    handler: async (args, ctx) => {
      if (args.length !== 1) {
        throw new ScriptError("var: expected 1 argument");
      }
      const [name] = args;
      return ctx.vars?.[name] ?? null;
    },
  }
);
export { varOp as "var" };

const setOp = defineOpcode<[string, ScriptValue<any>], any>(
  "set",
  {
    metadata: {
      label: "Set",
      category: "action",
      description: "Set variable value",
      slots: [
        { name: "Name", type: "string" },
        { name: "Value", type: "block" },
      ],
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
  }
);
export { setOp as "set" };

// Comparison
const eq = defineOpcode<[ScriptValue<any>, ScriptValue<any>, ...ScriptValue<any>[]], boolean>(
  "==",
  {
    metadata: {
      label: "==",
      category: "logic",
      description: "Equality check",
      layout: "infix",
      slots: [
        { name: "A", type: "block" },
        { name: "B", type: "block" },
      ],
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
  }
);
export { eq as "==" };

const neq = defineOpcode<[ScriptValue<any>, ScriptValue<any>, ...ScriptValue<any>[]], boolean>(
  "!=",
  {
    metadata: {
      label: "!=",
      category: "logic",
      description: "Inequality check",
      layout: "infix",
      slots: [
        { name: "A", type: "block" },
        { name: "B", type: "block" },
      ],
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
  }
);
export { neq as "!=" };

const lt = defineOpcode<[ScriptValue<number>, ScriptValue<number>, ...ScriptValue<number>[]], boolean>(
  "<",
  {
    metadata: {
      label: "<",
      category: "logic",
      description: "Less than",
      layout: "infix",
      slots: [
        { name: "A", type: "block" },
        { name: "B", type: "block" },
      ],
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
  }
);
export { lt as "<" };

const gt = defineOpcode<[ScriptValue<number>, ScriptValue<number>, ...ScriptValue<number>[]], boolean>(
  ">",
  {
    metadata: {
      label: ">",
      category: "logic",
      description: "Greater than",
      layout: "infix",
      slots: [
        { name: "A", type: "block" },
        { name: "B", type: "block" },
      ],
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
  }
);
export { gt as ">" };

const lte = defineOpcode<[ScriptValue<number>, ScriptValue<number>, ...ScriptValue<number>[]], boolean>(
  "<=",
  {
    metadata: {
      label: "<=",
      category: "logic",
      description: "Less than or equal",
      layout: "infix",
      slots: [
        { name: "A", type: "block" },
        { name: "B", type: "block" },
      ],
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
  }
);
export { lte as "<=" };

const gte = defineOpcode<[ScriptValue<number>, ScriptValue<number>, ...ScriptValue<number>[]], boolean>(
  ">=",
  {
    metadata: {
      label: ">=",
      category: "logic",
      description: "Greater than or equal",
      layout: "infix",
      slots: [
        { name: "A", type: "block" },
        { name: "B", type: "block" },
      ],
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
  }
);
export { gte as ">=" };

// Arithmetic
const add = defineOpcode<[ScriptValue<number>, ScriptValue<number>, ...ScriptValue<number>[]], number>(
  "+",
  {
    metadata: {
      label: "+",
      category: "math",
      description: "Addition",
      layout: "infix",
      slots: [
        { name: "A", type: "block" },
        { name: "B", type: "block" },
      ],
    },
    handler: async (args, ctx) => {
      if (args.length < 2) {
        throw new ScriptError("+: expected at least 2 arguments");
      }
      let sum = await evaluate(args[0], ctx);
      if (typeof sum !== "number") {
        throw new ScriptError(
          `+: expected a number at index 0, got ${JSON.stringify(sum)}`
        );
      }
      for (let i = 1; i < args.length; i++) {
        const next = await evaluate(args[i], ctx);
        if (typeof next !== "number") {
          throw new ScriptError(
            `+: expected a number at index ${i}, got ${JSON.stringify(next)}`
          );
        }
        sum += next;
      }
      return sum;
    },
  }
);
export { add as "+" };

const sub = defineOpcode<[ScriptValue<number>, ScriptValue<number>, ...ScriptValue<number>[]], number>(
  "-",
  {
    metadata: {
      label: "-",
      category: "math",
      description: "Subtraction",
      layout: "infix",
      slots: [
        { name: "A", type: "block" },
        { name: "B", type: "block" },
      ],
    },
    handler: async (args, ctx) => {
      if (args.length < 2) {
        throw new ScriptError("-: expected at least 2 arguments");
      }
      let diff = await evaluate(args[0], ctx);
      if (typeof diff !== "number") {
        throw new ScriptError(
          `-: expected a number at index 0, got ${JSON.stringify(diff)}`
        );
      }
      for (let i = 1; i < args.length; i++) {
        const next = await evaluate(args[i], ctx);
        if (typeof next !== "number") {
          throw new ScriptError(
            `-: expected a number at index ${i}, got ${JSON.stringify(next)}`
          );
        }
        diff -= next;
      }
      return diff;
    },
  }
);
export { sub as "-" };

const mul = defineOpcode<[ScriptValue<number>, ScriptValue<number>, ...ScriptValue<number>[]], number>(
  "*",
  {
    metadata: {
      label: "*",
      category: "math",
      description: "Multiplication",
      layout: "infix",
      slots: [
        { name: "A", type: "block" },
        { name: "B", type: "block" },
      ],
    },
    handler: async (args, ctx) => {
      if (args.length < 2) {
        throw new ScriptError("*: expected at least 2 arguments");
      }
      let prod = await evaluate(args[0], ctx);
      if (typeof prod !== "number") {
        throw new ScriptError(
          `*: expected a number at index 0, got ${JSON.stringify(prod)}`
        );
      }
      for (let i = 1; i < args.length; i++) {
        const next = await evaluate(args[i], ctx);
        if (typeof next !== "number") {
          throw new ScriptError(
            `*: expected a number at index ${i}, got ${JSON.stringify(next)}`
          );
        }
        prod *= next;
      }
      return prod;
    },
  }
);
export { mul as "*" };

const div = defineOpcode<[ScriptValue<number>, ScriptValue<number>, ...ScriptValue<number>[]], number>(
  "/",
  {
    metadata: {
      label: "/",
      category: "math",
      description: "Division",
      layout: "infix",
      slots: [
        { name: "A", type: "block" },
        { name: "B", type: "block" },
      ],
    },
    handler: async (args, ctx) => {
      if (args.length < 2) {
        throw new ScriptError("/: expected at least 2 arguments");
      }
      let quot = await evaluate(args[0], ctx);
      if (typeof quot !== "number") {
        throw new ScriptError(
          `/: expected a number at index 0, got ${JSON.stringify(quot)}`
        );
      }
      for (let i = 1; i < args.length; i++) {
        const next = await evaluate(args[i], ctx);
        if (typeof next !== "number") {
          throw new ScriptError(
            `/: expected a number at index ${i}, got ${JSON.stringify(next)}`
          );
        }
        quot /= next;
      }
      return quot;
    },
  }
);
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
    },
    handler: async (args, ctx) => {
      if (args.length !== 2) {
        throw new ScriptError("%: expected 2 arguments");
      }
      const aEval = await evaluate(args[0], ctx);
      if (typeof aEval !== "number") {
        throw new ScriptError(
          `%: expected a number at index 0, got ${JSON.stringify(aEval)}`
        );
      }
      const bEval = await evaluate(args[1], ctx);
      if (typeof bEval !== "number") {
        throw new ScriptError(
          `%: expected a number at index 1, got ${JSON.stringify(bEval)}`
        );
      }
      return aEval % bEval;
    },
  }
);
export { mod as "%" };

const pow = defineOpcode<[ScriptValue<number>, ScriptValue<number>, ...ScriptValue<number>[]], number>(
  "^",
  {
    metadata: {
      label: "^",
      category: "math",
      description: "Exponentiation",
      layout: "infix",
      slots: [
        { name: "Base", type: "block" },
        { name: "Exp", type: "block" },
      ],
    },
    handler: async (args, ctx) => {
      // Power tower
      if (args.length < 2) {
        throw new ScriptError("^: expected at least 2 arguments");
      }
      let pow = await evaluate(args[args.length - 1], ctx);
      if (typeof pow !== "number") {
        throw new ScriptError(
          `^: expected a number at index ${
            args.length - 1
          }, got ${JSON.stringify(pow)}`
        );
      }
      for (let i = args.length - 2; i >= 0; i--) {
        const next = await evaluate(args[i], ctx);
        if (typeof next !== "number") {
          throw new ScriptError(
            `^: expected a number at index ${i}, got ${JSON.stringify(next)}`
          );
        }
        pow = next ** pow;
      }
      return pow;
    },
  }
);
export { pow as "^" };

// Logic
const and = defineOpcode<[ScriptValue<any>, ScriptValue<any>, ...ScriptValue<any>[]], boolean>(
  "and",
  {
    metadata: {
      label: "And",
      category: "logic",
      description: "Logical AND",
      layout: "infix",
      slots: [
        { name: "A", type: "block" },
        { name: "B", type: "block" },
      ],
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
  }
);
export { and };

const or = defineOpcode<[ScriptValue<any>, ScriptValue<any>, ...ScriptValue<any>[]], boolean>(
  "or",
  {
    metadata: {
      label: "Or",
      category: "logic",
      description: "Logical OR",
      layout: "infix",
      slots: [
        { name: "A", type: "block" },
        { name: "B", type: "block" },
      ],
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
  }
);
export { or };

const not = defineOpcode<[ScriptValue<any>], boolean>(
  "not",
  {
    metadata: {
      label: "Not",
      category: "logic",
      description: "Logical NOT",
      slots: [{ name: "Val", type: "block" }],
    },
    handler: async (args, ctx) => {
      if (args.length !== 1) {
        throw new ScriptError("not: expected 1 argument");
      }
      return !(await evaluate(args[0], ctx));
    },
  }
);
export { not };

// System
const log = defineOpcode<[ScriptValue<any>, ...ScriptValue<any>[]], void>(
  "log",
  {
    metadata: {
      label: "Log",
      category: "action",
      description: "Log to server console",
      slots: [{ name: "Msg", type: "block" }],
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
  }
);
export { log };

const arg = defineOpcode<[ScriptValue<number>], any>(
  "arg",
  {
    metadata: {
      label: "Get Arg",
      category: "data",
      description: "Get argument by index",
      layout: "primitive",
      slots: [{ name: "Index", type: "number" }],
    },
    handler: async (args, ctx) => {
      const [index] = args;
      return ctx.args?.[index] ?? null;
    },
  }
);
export { arg };

const args = defineOpcode<[], any[]>(
  "args",
  {
    metadata: {
      label: "Get Args",
      category: "data",
      description: "Get all arguments",
      slots: [],
    },
    handler: async (_args, ctx) => {
      return ctx.args ?? [];
    },
  }
);
export { args };

const random = defineOpcode<[ScriptValue<number>?, ScriptValue<number>?], number>(
  "random",
  {
    metadata: {
      label: "Random",
      category: "math",
      description: "Generate random number",
      slots: [
        { name: "Min", type: "number", default: 0 },
        { name: "Max", type: "number", default: 1 },
      ],
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
  }
);
export { random };

const warn = defineOpcode<[ScriptValue<any>], void>(
  "warn",
  {
    metadata: {
      label: "Warn",
      category: "action",
      description: "Send warning to client",
      slots: [{ name: "Msg", type: "block" }],
    },
    handler: async (args, ctx) => {
      const [msg] = args;
      const text = await evaluate(msg, ctx);
      ctx.warnings.push(String(text));
    },
  }
);
export { warn };

const throwOp = defineOpcode<[ScriptValue<any>], never>(
  "throw",
  {
    metadata: {
      label: "Throw",
      category: "action",
      description: "Throw an error",
      slots: [{ name: "Msg", type: "block" }],
    },
    handler: async (args, ctx) => {
      const [msg] = args;
      throw new ScriptError(await evaluate(msg, ctx));
    },
  }
);
export { throwOp as "throw" };

const tryOp = defineOpcode<[ScriptValue<any>, string, ScriptValue<any>], any>(
  "try",
  {
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
  }
);
export { tryOp as "try" };

// Entity Interaction

const create = defineOpcode<[ScriptValue<any>, ScriptValue<string>?, ScriptValue<any>?, ScriptValue<number>?], number>(
  "create",
  {
    metadata: {
      label: "Create",
      category: "action",
      description: "Create a new entity",
      slots: [{ name: "Data", type: "block" }],
    },
    handler: async (args, ctx) => {
      if (!ctx.sys) {
        throw new ScriptError("create: no system available");
      }
      if (!ctx.sys.create) {
        throw new ScriptError("create: no create function available");
      }
      if (args.length === 1) {
        const [dataExpr] = args;
        const data = await evaluate(dataExpr, ctx);
        return ctx.sys.create(data);
      } else {
        if (args.length < 2 || args.length > 4) {
          throw new ScriptError("create: expected 2, 3, or 4 arguments");
        }
        const [kindExpr, nameExpr, propsExpr, locExpr] = args;
        const kind = await evaluate(kindExpr, ctx);
        const name = await evaluate(nameExpr, ctx);
        const props = propsExpr ? await evaluate(propsExpr, ctx) : {};
        const location_id = locExpr ? await evaluate(locExpr, ctx) : undefined;
        return ctx.sys.create({ kind, name, props, location_id });
      }
    },
  }
);
export { create };

const destroy = defineOpcode<[ScriptValue<any>], void>(
  "destroy",
  {
    metadata: {
      label: "Destroy",
      category: "action",
      description: "Destroy an entity",
      slots: [{ name: "Target", type: "block", default: "this" }],
    },
    handler: async (args, ctx) => {
      const [targetExpr] = args;
      const target = await evaluate(targetExpr, ctx);
      if (typeof target !== "object") {
        throw new ScriptError(`destroy: target must be an object, got ${JSON.stringify(target)}`);
      }
      ctx.sys?.destroy?.(target.id);
    },
  }
);
export { destroy };

const lambda = defineOpcode<[readonly string[], ScriptValue<unknown>], any>(
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
  }
);
export { lambda };

const apply = defineOpcode<[ScriptValue<unknown>, ...ScriptValue<unknown>[]], any>(
  "apply",
  {
    metadata: {
      label: "Apply",
      category: "func",
      description: "Apply a lambda function",
      slots: [
        { name: "Func", type: "block" },
        { name: "Args...", type: "block" },
      ],
    },
    handler: async (args, ctx) => {
      const [funcExpr, ...argExprs] = args;
      const func = await evaluate(funcExpr, ctx);

      if (!func) {
        throw new ScriptError("apply: func not found");
      }
      if (func.type !== "lambda") {
        throw new ScriptError(`apply: func must be a lambda, got ${JSON.stringify(func)}`);
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
  }
);
export { apply };

const call = defineOpcode<[ScriptValue<any>, ScriptValue<string>, ...ScriptValue<any>[]], any>(
  "call",
  {
    metadata: {
      label: "Call",
      category: "action",
      description: "Call a verb on an entity",
      slots: [
        { name: "Target", type: "block" },
        { name: "Verb", type: "string" },
        { name: "Args...", type: "block" },
      ],
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
        throw new ScriptError(`call: target must be an object, got ${JSON.stringify(target)}`);
      }
      if (typeof verb !== "string") {
        throw new ScriptError(`call: verb must be a string, got ${JSON.stringify(verb)}`);
      }

      if (ctx.sys?.call) {
        return await ctx.sys.call(
          ctx.caller,
          target.id,
          verb,
          evaluatedArgs,
          ctx.warnings,
        );
      }
      return null;
    },
  }
);
export { call };

const schedule = defineOpcode<[ScriptValue<string>, ScriptValue<any[]>, ScriptValue<number>], void>(
  "schedule",
  {
    metadata: {
      label: "Schedule",
      category: "action",
      description: "Schedule a verb call",
      slots: [
        { name: "Verb", type: "string" },
        { name: "Args", type: "block" },
        { name: "Delay", type: "number" },
      ],
    },
    handler: async (args, ctx) => {
      const [verbExpr, argsExpr, delayExpr] = args;
      const verb = await evaluate(verbExpr, ctx);
      if (typeof verb !== "string") {
        throw new ScriptError(`schedule: verb must be a string, got ${JSON.stringify(verb)}`);
      }
      const callArgs = await evaluate(argsExpr, ctx);
      if (!Array.isArray(callArgs)) {
        throw new ScriptError(`schedule: args must be an array, got ${JSON.stringify(callArgs)}`);
      }
      const delay = await evaluate(delayExpr, ctx);
      if (typeof delay !== "number") {
        throw new ScriptError(`schedule: delay must be a number, got ${JSON.stringify(delay)}`);
      }
      ctx.sys?.schedule?.(ctx.this.id, verb, callArgs, delay);
    },
  }
);
export { schedule };

const sysSend = defineOpcode<[ScriptValue<any>], void>(
  "sys.send",
  {
    metadata: {
      label: "System Send",
      category: "system",
      description: "Send a system message",
      slots: [{ name: "Msg", type: "block" }],
    },
    handler: async (args, ctx) => {
      const [msgExpr] = args;
      const msg = await evaluate(msgExpr, ctx);
      ctx.sys?.send?.(msg);
    },
  }
);
export { sysSend as "sys.send" };

// Entity Introspection
const verbs = defineOpcode<[ScriptValue<any>], any[]>(
  "verbs",
  {
    metadata: {
      label: "Verbs",
      category: "world",
      description: "Get verbs of an entity",
      slots: [{ name: "Target", type: "block" }],
    },
    handler: async (args, ctx) => {
      if (!ctx.sys) {
        throw new ScriptError("verbs: no system available");
      }
      if (!ctx.sys.getVerbs) {
        throw new ScriptError("verbs: no getVerbs function available");
      }
      const [entityExpr] = args;
      const entity = await evaluate(entityExpr, ctx);
      if (typeof entity !== "object") {
        throw new ScriptError(`verbs: entity must be an object, got ${JSON.stringify(entity)}`);
      }
      return ctx.sys.getVerbs(entity.id);
    },
  }
);
export { verbs };

const entity = defineOpcode<[ScriptValue<number>], any>(
  "entity",
  {
    metadata: {
      label: "Entity",
      category: "world",
      description: "Get entity by ID",
      slots: [{ name: "ID", type: "number" }],
    },
    handler: async (args, ctx) => {
      if (!ctx.sys) {
        throw new ScriptError("entity: no system available");
      }
      if (!ctx.sys.getEntity) {
        throw new ScriptError("entity: no getEntity function available");
      }
      const [idExpr] = args;
      const id = await evaluate(idExpr, ctx);
      if (typeof id !== "number") {
        throw new ScriptError(
          `entity: expected number, got ${JSON.stringify(id)}`
        );
      }
      const entity = await ctx.sys.getEntity(id);
      if (!entity) {
        throw new ScriptError(`entity: entity ${id} not found`);
      }
      return entity["props"];
    },
  }
);
export { entity };

const resolvePropsOp = defineOpcode<[ScriptValue<any>], any>(
  "resolve_props",
  {
    metadata: {
      label: "Resolve Props",
      category: "data",
      description: "Resolve entity properties",
      slots: [{ name: "Entity", type: "block" }],
    },
    handler: async (args, ctx) => {
      if (args.length !== 1) {
        throw new ScriptError("resolve_props: expected 1 argument");
      }
      const [entityId] = args;
      const entity = await evaluate(entityId, ctx);
      if (typeof entity !== "object") {
        throw new ScriptError(
          `resolve_props: expected object, got ${JSON.stringify(entity)}`
        );
      }
      return resolveProps(entity, ctx);
    },
  }
);
export { resolvePropsOp as "resolve_props" };
