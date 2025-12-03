import { evaluate, ScriptError } from "../interpreter";
import { defineOpcode, ScriptValue } from "../def";

// Comparison
/**
 * Checks if all arguments are equal.
 */
const eq = defineOpcode<
  [unknown, unknown, ...unknown[]],
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
  handler: (args, _ctx) => {
    if (args.length < 2) {
      throw new ScriptError("==: expected at least 2 arguments");
    }
    let prev = args[0];
    for (let i = 1; i < args.length; i++) {
      const next = args[i];
      if (prev !== next) {
        return false;
      }
      prev = next;
    }
    return true;
  },
});
export { eq as "==" };

/**
 * Checks if adjacent arguments are different.
 */
const neq = defineOpcode<
  [unknown, unknown, ...unknown[]],
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
  handler: (args, _ctx) => {
    if (args.length < 2) {
      throw new ScriptError("!=: expected at least 2 arguments");
    }
    let prev = args[0];
    for (let i = 1; i < args.length; i++) {
      const next = args[i];
      if (prev === next) {
        return false;
      }
      prev = next;
    }
    return true;
  },
});
export { neq as "!=" };

/**
 * Checks if arguments are strictly increasing.
 */
const lt = defineOpcode<
  [number, number, ...number[]],
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
  handler: (args, _ctx) => {
    if (args.length < 2) {
      throw new ScriptError("<: expected at least 2 arguments");
    }
    let prev = args[0] as number;
    for (let i = 1; i < args.length; i++) {
      const next = args[i] as number;
      if (prev >= next) {
        return false;
      }
      prev = next;
    }
    return true;
  },
});
export { lt as "<" };

/**
 * Checks if arguments are strictly decreasing.
 */
const gt = defineOpcode<
  [number, number, ...number[]],
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
  handler: (args, _ctx) => {
    if (args.length < 2) {
      throw new ScriptError(">: expected at least 2 arguments");
    }
    let prev = args[0] as number;
    for (let i = 1; i < args.length; i++) {
      const next = args[i] as number;
      if (prev <= next) {
        return false;
      }
      prev = next;
    }
    return true;
  },
});
export { gt as ">" };

/**
 * Checks if arguments are non-decreasing.
 */
const lte = defineOpcode<
  [number, number, ...number[]],
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
  handler: (args, _ctx) => {
    if (args.length < 2) {
      throw new ScriptError("<=: expected at least 2 arguments");
    }
    let prev = args[0] as number;
    for (let i = 1; i < args.length; i++) {
      const next = args[i] as number;
      if (prev > next) {
        return false;
      }
      prev = next;
    }
    return true;
  },
});
export { lte as "<=" };

/**
 * Checks if arguments are non-increasing.
 */
const gte = defineOpcode<
  [number, number, ...number[]],
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
  handler: (args, _ctx) => {
    if (args.length < 2) {
      throw new ScriptError(">=: expected at least 2 arguments");
    }
    let prev = args[0] as number;
    for (let i = 1; i < args.length; i++) {
      const next = args[i] as number;
      if (prev < next) {
        return false;
      }
      prev = next;
    }
    return true;
  },
});
export { gte as ">=" };

// Logic
/**
 * Logical AND.
 */
export const and = defineOpcode<
  [ScriptValue<boolean>, ScriptValue<boolean>, ...ScriptValue<boolean>[]],
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
      { name: "a", type: "boolean" },
      { name: "b", type: "boolean" },
      { name: "...args", type: "boolean[]" },
    ],
    returnType: "boolean",
    lazy: true,
  },
  handler: (args, ctx) => {
    if (args.length < 2) {
      throw new ScriptError("and: expected at least 2 arguments");
    }
    
    let i = 0;
    const next = (): any => {
      if (i >= args.length) return true;
      
      const arg = args[i++];
      const result = evaluate(arg, ctx);
      
      if (result instanceof Promise) {
        return result.then((res) => {
          if (!res) return false;
          return next();
        });
      }
      
      if (!result) return false;
      return next();
    };
    
    return next();
  },
});

/**
 * Logical OR.
 */
export const or = defineOpcode<
  [ScriptValue<boolean>, ScriptValue<boolean>, ...ScriptValue<boolean>[]],
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
      { name: "a", type: "boolean" },
      { name: "b", type: "boolean" },
      { name: "...args", type: "boolean[]" },
    ],
    returnType: "boolean",
    lazy: true,
  },
  handler: (args, ctx) => {
    if (args.length < 2) {
      throw new ScriptError("or: expected at least 2 arguments");
    }
    
    let i = 0;
    const next = (): any => {
      if (i >= args.length) return false;
      
      const arg = args[i++];
      const result = evaluate(arg, ctx);
      
      if (result instanceof Promise) {
        return result.then((res) => {
          if (res) return true;
          return next();
        });
      }
      
      if (result) return true;
      return next();
    };
    
    return next();
  },
});

/**
 * Logical NOT.
 */
export const not = defineOpcode<[boolean], boolean>("not", {
  metadata: {
    label: "Not",
    category: "logic",
    description: "Logical NOT",
    slots: [{ name: "Val", type: "block" }],
    parameters: [{ name: "val", type: "boolean" }],
    returnType: "boolean",
  },
  handler: (args, _ctx) => {
    if (args.length !== 1) {
      throw new ScriptError("not: expected 1 argument");
    }
    return !args[0];
  },
});
