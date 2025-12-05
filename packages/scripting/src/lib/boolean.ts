import { evaluate } from "../interpreter";
import { defineFullOpcode } from "../types";

// Comparison
/** Checks if all arguments are equal. */
export const eq = defineFullOpcode<[unknown, unknown, ...unknown[]], boolean>("==", {
  metadata: {
    label: "Equals",
    category: "logic",
    layout: "infix",
    description: "Checks if all arguments are equal.",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
    parameters: [
      { name: "a", type: "unknown", description: "The first value to compare." },
      { name: "b", type: "unknown", description: "The second value to compare." },
      {
        name: "...args",
        type: "unknown[]",
        optional: false,
        description: "Additional values to compare.",
      },
    ],
    returnType: "boolean",
  },
  handler: ([first, ...rest], _ctx) => {
    let prev = first;
    for (const next of rest) {
      if (prev !== next) {
        return false;
      }
      prev = next;
    }
    return true;
  },
});

/** Checks if adjacent arguments are different. */
export const neq = defineFullOpcode<[unknown, unknown, ...unknown[]], boolean>("!=", {
  metadata: {
    label: "!=",
    category: "logic",
    description: "Checks if adjacent arguments are different.",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
    parameters: [
      { name: "a", type: "unknown", description: "The first value to compare." },
      { name: "b", type: "unknown", description: "The second value to compare." },
      {
        name: "...args",
        type: "unknown[]",
        optional: false,
        description: "Additional values to compare.",
      },
    ],
    returnType: "boolean",
  },
  handler: ([first, ...rest], _ctx) => {
    let prev = first;
    for (const next of rest) {
      if (prev === next) {
        return false;
      }
      prev = next;
    }
    return true;
  },
});

/** Checks if arguments are strictly increasing. */
export const lt = defineFullOpcode<[number, number, ...number[]], boolean>("<", {
  metadata: {
    label: "<",
    category: "logic",
    description: "Checks if arguments are strictly increasing.",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
    parameters: [
      { name: "a", type: "number", description: "The first number." },
      { name: "b", type: "number", description: "The second number." },
      { name: "...args", type: "number[]", description: "Additional numbers." },
    ],
    returnType: "boolean",
  },
  handler: ([first, ...rest], _ctx) => {
    let prev = first;
    for (const next of rest) {
      if (prev >= next) {
        return false;
      }
      prev = next;
    }
    return true;
  },
});

/** Checks if arguments are strictly decreasing. */
export const gt = defineFullOpcode<[number, number, ...number[]], boolean>(">", {
  metadata: {
    label: ">",
    category: "logic",
    description: "Checks if arguments are strictly decreasing.",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
    parameters: [
      { name: "a", type: "number", description: "The first number." },
      { name: "b", type: "number", description: "The second number." },
      { name: "...args", type: "number[]", description: "Additional numbers." },
    ],
    returnType: "boolean",
  },
  handler: ([first, ...rest], _ctx) => {
    let prev = first;
    for (const next of rest) {
      if (prev <= next) {
        return false;
      }
      prev = next;
    }
    return true;
  },
});

/** Checks if arguments are non-decreasing. */
export const lte = defineFullOpcode<[number, number, ...number[]], boolean>("<=", {
  metadata: {
    label: "<=",
    category: "logic",
    description: "Checks if arguments are non-decreasing.",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
    parameters: [
      { name: "a", type: "number", description: "The first number." },
      { name: "b", type: "number", description: "The second number." },
      { name: "...args", type: "number[]", description: "Additional numbers." },
    ],
    returnType: "boolean",
  },
  handler: ([first, ...rest], _ctx) => {
    let prev = first;
    for (const next of rest) {
      if (prev > next) {
        return false;
      }
      prev = next;
    }
    return true;
  },
});

/** Checks if arguments are non-increasing. */
export const gte = defineFullOpcode<[number, number, ...number[]], boolean>(">=", {
  metadata: {
    label: ">=",
    category: "logic",
    description: "Checks if arguments are non-increasing.",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
    parameters: [
      { name: "a", type: "number", description: "The first number." },
      { name: "b", type: "number", description: "The second number." },
      { name: "...args", type: "number[]", description: "Additional numbers." },
    ],
    returnType: "boolean",
  },
  handler: ([first, ...rest], _ctx) => {
    let prev = first;
    for (const next of rest) {
      if (prev < next) {
        return false;
      }
      prev = next;
    }
    return true;
  },
});

// Logic
/** Logical AND. */
export const and = defineFullOpcode<[boolean, boolean, ...boolean[]], boolean, true>("and", {
  metadata: {
    label: "And",
    category: "logic",
    layout: "infix",
    description: "Logical AND. Returns true if all arguments are true.",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
    parameters: [
      { name: "a", type: "unknown", description: "The first value." },
      { name: "b", type: "unknown", description: "The second value." },
      { name: "...args", type: "unknown[]", description: "Additional values." },
    ],
    returnType: "boolean",
    lazy: true,
  },
  handler: ([a, b, ...rest], ctx) => {
    let i = 0;
    const args = [a, b, ...rest];
    const next = (): any => {
      if (i >= args.length) return true;

      const arg = args[i++]!;
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

/** Logical OR. */
export const or = defineFullOpcode<[boolean, boolean, ...boolean[]], boolean, true>("or", {
  metadata: {
    label: "Greater Than",
    category: "logic",
    layout: "infix",
    description: "Logical OR. Returns true if at least one argument is true.",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
    parameters: [
      { name: "a", type: "unknown", description: "The first value." },
      { name: "b", type: "unknown", description: "The second value." },
      { name: "...args", type: "unknown[]", description: "Additional values." },
    ],
    returnType: "boolean",
    lazy: true,
  },
  handler: ([a, b, ...rest], ctx) => {
    let i = 0;
    const args = [a, b, ...rest];
    const next = (): any => {
      if (i >= args.length) return false;

      const arg = args[i++]!;
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
export const not = defineFullOpcode<[boolean], boolean>("not", {
  metadata: {
    label: "Not",
    category: "logic",
    description: "Logical NOT. Returns the opposite boolean value.",
    slots: [{ name: "Val", type: "block" }],
    parameters: [
      {
        name: "value",
        type: "unknown",
        optional: false,
        description: "The boolean value to negate.",
      },
    ],
    returnType: "boolean",
  },
  handler: ([val], _ctx) => {
    return !val;
  },
});
