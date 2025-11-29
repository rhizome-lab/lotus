import {
  evaluate,
  evaluateTarget,
  executeLambda,
  resolveProps,
  ScriptError,
  OpcodeDefinition,
} from "../interpreter";
import { checkPermission } from "../../permissions";
import {
  Entity,
  SPECIAL_PROPERTIES,
  updateEntity,
  getEntity,
} from "../../repo";

export const CoreLibrary: Record<string, OpcodeDefinition> = {
  // Control Flow
  seq: {
    metadata: {
      label: "Sequence",
      category: "logic",
      description: "Execute a sequence of steps",
      layout: "control-flow",
      slots: [],
    },
    handler: async (args, ctx) => {
      let lastResult = null;
      for (const step of args) {
        lastResult = await evaluate(step, ctx);
      }
      return lastResult;
    },
  },
  if: {
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
        throw new ScriptError("if requires 2 or 3 arguments");
      }
      const [cond, thenBranch, elseBranch] = args;
      if (await evaluate(cond, ctx)) {
        return await evaluate(thenBranch, ctx);
      } else if (elseBranch) {
        return await evaluate(elseBranch, ctx);
      }
      return null;
    },
  },
  while: {
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
        throw new ScriptError("while requires 2 arguments");
      }
      const [cond, body] = args;
      let result = null;
      while (await evaluate(cond, ctx)) {
        result = await evaluate(body, ctx);
      }
      return result;
    },
  },
  for: {
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
        throw new ScriptError("for requires 3 arguments");
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
  },
  list: {
    metadata: {
      label: "List",
      category: "list",
      description: "Create a list",
      slots: [],
    },
    handler: async (args, ctx) => {
      const result = [];
      for (const arg of args) {
        result.push(await evaluate(arg, ctx));
      }
      return result;
    },
  },

  // Data Structures
  "json.stringify": {
    metadata: {
      label: "JSON Stringify",
      category: "data",
      description: "Convert to JSON string",
      slots: [{ name: "Value", type: "block" }],
    },
    handler: async (args, ctx) => {
      const [valExpr] = args;
      const val = await evaluate(valExpr, ctx);
      return JSON.stringify(val);
    },
  },
  "json.parse": {
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
  },

  // Entity Introspection
  prop: {
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
        throw new ScriptError("get_prop: expected 2 arguments");
      }
      const [entityId, propName] = args;
      const entity = await evaluate(entityId, ctx);
      const prop = await evaluate(propName, ctx);

      // Check read permissions? For now, public properties are readable
      // Maybe check "view" permission on entity

      // Special properties
      if (SPECIAL_PROPERTIES.has(String(prop))) {
        // These are handled by repo/entity logic usually, but we might need direct access
        // For now, let's assume we can read them from the entity object if we had it
        // But we only have ID. We need to fetch entity?
        // The evaluate(entityId) returns the ID string usually.
        // We'll need a way to get the entity data.
        // For now, let's use a helper or just return null if not implemented
        return null; // TODO: Implement property reading
      }

      // For dynamic properties, we need to fetch the entity
      // This requires repo access which we might not have directly here without importing
      // Let's assume for now we can't easily get arbitrary props without a helper
      return null;
    },
  },
  set_prop: {
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
        throw new ScriptError("set_prop: expected 3 arguments");
      }
      const [entityId, propName, valExpr] = args;
      const entity = await evaluate(entityId, ctx);
      if (typeof entity !== "object") {
        throw new ScriptError("set_prop: entity must be an object");
      }
      const prop = await evaluate(propName, ctx);
      if (typeof prop !== "string") {
        throw new ScriptError("set_prop: property name must be a string");
      }
      const val = await evaluate(valExpr, ctx);

      if (!checkPermission(ctx.caller, entity, "edit")) {
        throw new ScriptError(
          `set_prop: permission denied: cannot set property '${prop}'`,
        );
      }

      updateEntity(entity, { [prop]: val });
    },
  },
  has_prop: {
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
        throw new ScriptError("has_prop: expected 2 arguments");
      }
      const [entityId, propName] = args;
      const entity = await evaluate(entityId, ctx);
      if (typeof entity !== "object") {
        throw new ScriptError("has_prop: entity must be an object");
      }
      const prop = await evaluate(propName, ctx);
      if (typeof prop !== "string") {
        throw new ScriptError("has_prop: property name must be a string");
      }
      if (!checkPermission(ctx.caller, entity, "edit")) {
        throw new ScriptError(
          `has_prop: permission denied: cannot check property '${prop}'`,
        );
      }
      return Object.hasOwnProperty.call(entity, prop);
    },
  },
  delete_prop: {
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
        throw new ScriptError("delete_prop: expected 2 arguments");
      }
      const [entityId, propName] = args;
      const entity = await evaluate(entityId, ctx);
      if (typeof entity !== "object") {
        throw new ScriptError("delete_prop: entity must be an object");
      }
      const prop = await evaluate(propName, ctx);
      if (typeof prop !== "string") {
        throw new ScriptError("delete_prop: property name must be a string");
      }
      if (!checkPermission(ctx.caller, entity, "edit")) {
        throw new ScriptError(
          `delete_prop: permission denied: cannot delete property '${prop}'`,
        );
      }
      updateEntity(entity, { [prop]: undefined });
    },
  },

  // Variables
  let: {
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
  },
  var: {
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
  },
  set: {
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
  },

  // Comparison
  "==": {
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
  },
  "!=": {
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
  },
  "<": {
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
  },
  ">": {
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
  },
  "<=": {
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
  },
  ">=": {
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
  },

  // Arithmetic
  // Arithmetic
  "+": {
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
        throw new ScriptError("+: expected a number");
      }
      for (let i = 1; i < args.length; i++) {
        const next = await evaluate(args[i], ctx);
        if (typeof next !== "number") {
          throw new ScriptError("+: expected a number");
        }
        sum += next;
      }
      return sum;
    },
  },
  "-": {
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
        throw new ScriptError("-: expected a number");
      }
      for (let i = 1; i < args.length; i++) {
        const next = await evaluate(args[i], ctx);
        if (typeof next !== "number") {
          throw new ScriptError("-: expected a number");
        }
        diff -= next;
      }
      return diff;
    },
  },
  "*": {
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
        throw new ScriptError("*: expected a number");
      }
      for (let i = 1; i < args.length; i++) {
        const next = await evaluate(args[i], ctx);
        if (typeof next !== "number") {
          throw new ScriptError("*: expected a number");
        }
        prod *= next;
      }
      return prod;
    },
  },
  "/": {
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
        throw new ScriptError("/: expected a number");
      }
      for (let i = 1; i < args.length; i++) {
        const next = await evaluate(args[i], ctx);
        if (typeof next !== "number") {
          throw new ScriptError("/: expected a number");
        }
        quot /= next;
      }
      return quot;
    },
  },
  "%": {
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
        throw new ScriptError("%: expected a number");
      }
      const bEval = await evaluate(args[1], ctx);
      if (typeof bEval !== "number") {
        throw new ScriptError("%: expected a number");
      }
      return aEval % bEval;
    },
  },
  "^": {
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
          `^: expected a number at index ${args.length - 1}`,
        );
      }
      for (let i = args.length - 2; i >= 0; i--) {
        const next = await evaluate(args[i], ctx);
        if (typeof next !== "number") {
          throw new ScriptError(`^: expected a number at index ${i}`);
        }
        pow = next ** pow;
      }
      return pow;
    },
  },

  // Logic
  and: {
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
  },
  or: {
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
  },
  not: {
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
  },

  // System
  log: {
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
  },
  arg: {
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
  },
  args: {
    metadata: {
      label: "Get Args",
      category: "data",
      description: "Get all arguments",
      slots: [],
    },
    handler: async (_args, ctx) => {
      return ctx.args ?? [];
    },
  },
  random: {
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
  },
  warn: {
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
  },
  throw: {
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
  },
  try: {
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
  },

  // Entity Interaction
  tell: async (args, ctx) => {
    const [targetExpr, msgExpr] = args;
    const msg = await evaluate(msgExpr, ctx);
    const target = await evaluateTarget(targetExpr, ctx);

    if (!target) {
      throw new ScriptError("tell: target not found");
    }

    // If target is caller (resolved), send to socket
    if (target.id === ctx.caller.id) {
      if (ctx.sys?.send) {
        ctx.sys.send({ type: "message", text: msg });
      }
      return true;
    }

    // Otherwise, trigger on_hear and notify caller
    if (ctx.sys?.triggerEvent) {
      // Notify caller
      if (ctx.sys.send) {
        ctx.sys.send({
          type: "message",
          text: `You tell ${target.name}: "${msg}"`,
        });
      }

      // Trigger on_hear
      // We use sys.call if available to target the specific entity
      if (ctx.sys.call) {
        try {
          await ctx.sys.call(
            ctx.caller,
            target.id,
            "on_hear",
            [msg, ctx.caller.id, "tell"],
            ctx.warnings,
          );
        } catch {
          // Ignore if verb not found
        }
      }
    }
    return true;
  },

  move: async (args, ctx) => {
    const [targetExpr, destExpr] = args;
    const target = await evaluateTarget(targetExpr, ctx);
    const dest = await evaluateTarget(destExpr, ctx);

    if (!target) {
      throw new ScriptError("move: target not found");
    }
    if (!dest) {
      throw new ScriptError("move: destination not found");
    }

    if (!checkPermission(ctx.caller, target, "edit")) {
      throw new ScriptError(
        `move: permission denied: cannot move ${target.id}`,
      );
    }

    if (ctx.sys?.move) {
      // Check enter permission on destination
      if (!checkPermission(ctx.caller, dest, "enter")) {
        throw new ScriptError(
          `move: permission denied: cannot enter ${dest.id}`,
        );
      }
      ctx.sys.move(target.id, dest.id);
    }
    return true;
  },

  create: async (args, ctx) => {
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

  destroy: async (args, ctx) => {
    const [targetExpr] = args;
    const target = await evaluateTarget(targetExpr, ctx);
    if (!target) {
      throw new ScriptError("destroy: target not found");
    }
    if (!checkPermission(ctx.caller, target, "edit")) {
      throw new ScriptError(
        `destroy: permission denied: cannot destroy ${target.id}`,
      );
    }
    ctx.sys?.destroy?.(target.id);
  },

  give: async (args, ctx) => {
    const [targetExpr, destExpr] = args;
    const target = await evaluateTarget(targetExpr, ctx);
    const dest = await evaluateTarget(destExpr, ctx);

    if (!target) {
      throw new ScriptError("give: target not found");
    }
    if (!dest) {
      throw new ScriptError("give: destination not found");
    }

    // Check permission: caller must own target
    if (target.owner_id !== ctx.caller.id) {
      throw new ScriptError(
        `give: permission denied: you do not own ${target.id}`,
      );
    }

    if (ctx.sys?.give) {
      // Transfer ownership to destination's owner
      // If destination has no owner, check if destination is an ACTOR.
      // If ACTOR, they become owner. If not, clear owner (public).
      let newOwnerId = dest.owner_id;
      if (!newOwnerId) {
        if (dest.kind === "ACTOR") {
          newOwnerId = dest.id;
        } else {
          newOwnerId = 0; // No owner
        }
      }
      ctx.sys.give(target.id, dest.id, newOwnerId);
    }
  },

  lambda: async (args, ctx) => {
    const [argNames, body] = args;
    return {
      type: "lambda",
      args: argNames,
      body,
      closure: { ...ctx.vars },
    };
  },
  apply: async (args, ctx) => {
    const [funcExpr, ...argExprs] = args;
    const func = await evaluate(funcExpr, ctx);

    if (!func) {
      throw new ScriptError("apply: func not found");
    }
    if (func.type !== "lambda") {
      throw new ScriptError("apply: func must be a lambda");
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
  call: async (args, ctx) => {
    const [targetExpr, verbExpr, ...callArgs] = args;
    const target = await evaluateTarget(targetExpr, ctx);
    const verb = await evaluate(verbExpr, ctx);

    // Evaluate arguments
    const evaluatedArgs = [];
    for (const arg of callArgs) {
      evaluatedArgs.push(await evaluate(arg, ctx));
    }

    if (!target) {
      throw new ScriptError("call: target not found");
    }
    if (typeof verb !== "string") {
      throw new ScriptError("call: verb must be a string");
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
  schedule: async (args, ctx) => {
    const [verbExpr, argsExpr, delayExpr] = args;
    const verb = await evaluate(verbExpr, ctx);
    const callArgs = await evaluate(argsExpr, ctx);
    const delay = await evaluate(delayExpr, ctx);

    if (
      typeof verb !== "string" ||
      !Array.isArray(callArgs) ||
      typeof delay !== "number"
    ) {
      throw new ScriptError(
        "schedule: verb must be a string, args must be an array, delay must be a number",
      );
    }

    ctx.sys?.schedule?.(ctx.this.id, verb, callArgs, delay);
  },
  broadcast: async (args, ctx) => {
    const [msgExpr, locExpr] = args;
    const msg = await evaluate(msgExpr, ctx);
    const loc = locExpr ? await evaluate(locExpr, ctx) : undefined;
    if (typeof msg !== "string") {
      throw new ScriptError(
        `broadcast: message must be a string, got ${JSON.stringify(msg)}`,
      );
    }
    ctx.sys?.broadcast?.(msg, loc);
  },
  "sys.send": async (args, ctx) => {
    const [msgExpr] = args;
    const msg = await evaluate(msgExpr, ctx);
    ctx.sys?.send?.(msg);
  },
  "world.find": async (args, ctx) => {
    const [nameExpr] = args;
    const name = await evaluate(nameExpr, ctx);
    if (typeof name !== "string") {
      throw new ScriptError(
        `world.find: name must be a string, got ${JSON.stringify(name)}`,
      );
    }
    // evaluateTarget handles "me", "here", and name lookup in room/inventory
    const target = await evaluateTarget(name, ctx);
    return target ? target.id : null;
  },
  "sys.can_edit": async (args, ctx) => {
    const [entityIdExpr] = args;
    const entityId = await evaluate(entityIdExpr, ctx);
    if (typeof entityId !== "number") {
      throw new ScriptError(
        `sys.can_edit: entity ID must be a number, got ${JSON.stringify(
          entityId,
        )}`,
      );
    }
    return ctx.sys?.canEdit?.(ctx.caller.id, entityId) ?? false;
  },
  print: async (args, ctx) => {
    const [msgExpr] = args;
    const msg = await evaluate(msgExpr, ctx);
    if (typeof msg !== "string") {
      throw new ScriptError("print: message must be a string");
    }
    ctx.sys?.send?.({ type: "message", text: msg });
  },
  say: async (args, ctx) => {
    const [msgExpr] = args;
    const msg = await evaluate(msgExpr, ctx);

    if (typeof msg !== "string") {
      throw new ScriptError("say: message must be a string");
    }

    ctx.sys?.broadcast?.(
      `${ctx.caller.name} says: "${msg}"`,
      ctx.caller.location_id || undefined,
    );

    if (ctx.caller.location_id) {
      await ctx.sys?.triggerEvent?.(
        "on_hear",
        ctx.caller.location_id,
        [msg, ctx.caller.id, "say"],
        ctx.caller.id, // Exclude speaker
      );
    }
    return;
  },
  // Data Structures
  object: async (args, ctx) => {
    // args: [key1, val1, key2, val2, ...]
    const obj: Record<string, any> = {};
    for (let i = 0; i < args.length; i += 2) {
      const key = await evaluate(args[i], ctx);
      const val = await evaluate(args[i + 1], ctx);
      if (typeof key === "string") {
        obj[key] = val;
      }
    }
    return obj;
  },
  map: async (args, ctx) => {
    const [listExpr, funcExpr] = args;
    const list = await evaluate(listExpr, ctx);
    const func = await evaluate(funcExpr, ctx);

    if (!Array.isArray(list) || !func || func.type !== "lambda") return [];

    const result = [];
    for (const item of list) {
      // Execute lambda for each item
      const res = await executeLambda(func, [item], ctx);
      result.push(res);
    }
    return result;
  },

  // Entity Introspection
  contents: async (args, ctx) => {
    if (!ctx.sys) {
      throw new ScriptError("contents: no system available");
    }
    if (!ctx.sys.getContents) {
      throw new ScriptError("contents: no getContents function available");
    }
    const [containerExpr] = args;
    const container = await evaluateTarget(containerExpr, ctx);
    if (!container) return [];
    return ctx.sys.getContents(container.id);
  },
  verbs: async (args, ctx) => {
    if (!ctx.sys) {
      throw new ScriptError("verbs: no system available");
    }
    if (!ctx.sys.getVerbs) {
      throw new ScriptError("verbs: no getVerbs function available");
    }
    const [entityExpr] = args;
    const entity = await evaluateTarget(entityExpr, ctx);
    if (!entity) return [];
    return ctx.sys.getVerbs(entity.id);
  },
  entity: async (args, ctx) => {
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
        `entity: expected number, got ${JSON.stringify(id)}`,
      );
    }
    const entity = await ctx.sys.getEntity(id);
    if (!entity) {
      throw new ScriptError(`entity: entity ${id} not found`);
    }
    return entity;
  },
  // Properties
  resolve_props: {
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
      const id = await evaluate(entityId, ctx);
      const entity = getEntity(Number(id));
      if (!entity) return null;
      return resolveProps(entity, ctx);
    },
  },
};
