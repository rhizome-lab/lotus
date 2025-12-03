import { ScriptError } from "../interpreter";
import { defineOpcode } from "../def";

// Arithmetic
/**
 * Adds numbers.
 */
const add = defineOpcode<
  [number, number, ...number[]],
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
  handler: (args, _ctx) => {
    if (args.length < 2) {
      throw new ScriptError("+: expected at least 2 arguments");
    }
    let sum = args[0];
    if (typeof sum !== "number") {
      throw new ScriptError(
        `+: expected a number at index 0, got ${JSON.stringify(sum)}`,
      );
    }
    for (let i = 1; i < args.length; i++) {
      const next = args[i];
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

/**
 * Subtracts numbers.
 */
const sub = defineOpcode<
  [number, number, ...number[]],
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
  handler: (args, _ctx) => {
    if (args.length < 2) {
      throw new ScriptError("-: expected at least 2 arguments");
    }
    let diff = args[0];
    if (typeof diff !== "number") {
      throw new ScriptError(
        `-: expected a number at index 0, got ${JSON.stringify(diff)}`,
      );
    }
    for (let i = 1; i < args.length; i++) {
      const next = args[i];
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

/**
 * Multiplies numbers.
 */
const mul = defineOpcode<
  [number, number, ...number[]],
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
  handler: (args, _ctx) => {
    if (args.length < 2) {
      throw new ScriptError("*: expected at least 2 arguments");
    }
    let prod = args[0];
    if (typeof prod !== "number") {
      throw new ScriptError(
        `*: expected a number at index 0, got ${JSON.stringify(prod)}`,
      );
    }
    for (let i = 1; i < args.length; i++) {
      const next = args[i];
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

/**
 * Divides numbers.
 */
const div = defineOpcode<
  [number, number, ...number[]],
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
  handler: (args, _ctx) => {
    if (args.length < 2) {
      throw new ScriptError("/: expected at least 2 arguments");
    }
    let quot = args[0];
    if (typeof quot !== "number") {
      throw new ScriptError(
        `/: expected a number at index 0, got ${JSON.stringify(quot)}`,
      );
    }
    for (let i = 1; i < args.length; i++) {
      const next = args[i];
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

/**
 * Calculates the modulo of two numbers.
 */
const mod = defineOpcode<[number, number], number>(
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
    handler: (args, _ctx) => {
      if (args.length !== 2) {
        throw new ScriptError("%: expected 2 arguments");
      }
      const aEval = args[0];
      if (typeof aEval !== "number") {
        throw new ScriptError(
          `%: expected a number at index 0, got ${JSON.stringify(aEval)}`,
        );
      }
      const bEval = args[1];
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

/**
 * Calculates exponentiation (power tower).
 */
const pow = defineOpcode<
  [number, number, ...number[]],
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
  handler: (args, _ctx) => {
    // Power tower
    if (args.length < 2) {
      throw new ScriptError("^: expected at least 2 arguments");
    }
    let pow = args[args.length - 1];
    if (typeof pow !== "number") {
      throw new ScriptError(
        `^: expected a number at index ${args.length - 1}, got ${JSON.stringify(
          pow,
        )}`,
      );
    }
    for (let i = args.length - 2; i >= 0; i--) {
      const next = args[i];
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

/**
 * Generates a random number.
 * - `random()`: Returns a float between 0 (inclusive) and 1 (exclusive).
 * - `random(max)`: Returns a number between 0 (inclusive) and `max` (inclusive). If `max` is an integer, returns an integer.
 * - `random(min, max)`: Returns a number between `min` (inclusive) and `max` (inclusive). If `min` and `max` are integers, returns an integer.
 */
export const random = defineOpcode<
  [number?, number?],
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
  handler: (args, _ctx) => {
    // random(max), random(min, max) or random() -> 0..1
    if (args.length > 2) {
      throw new ScriptError("random: expected 0, 1, or 2 arguments");
    }
    if (args.length === 0) return Math.random();
    const min = args.length === 2 ? args[0] : 0;
    const max = args[args.length === 2 ? 1 : 0];
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
