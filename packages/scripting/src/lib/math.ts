import { defineOpcode } from "../def";

// Arithmetic
/**
 * Adds numbers.
 */
const add = defineOpcode<[number, number, ...number[]], number>("+", {
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
  handler: ([first, ...rest], _ctx) => {
    let sum = first;
    for (const val of rest) {
      sum += val;
    }
    return sum;
  },
});
export { add as "+" };

/**
 * Subtracts numbers.
 */
const sub = defineOpcode<[number, number, ...number[]], number>("-", {
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
  handler: ([first, ...rest], _ctx) => {
    let diff = first;
    for (const val of rest) {
      diff -= val;
    }
    return diff;
  },
});
export { sub as "-" };

/**
 * Multiplies numbers.
 */
const mul = defineOpcode<[number, number, ...number[]], number>("*", {
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
  handler: ([first, ...rest], _ctx) => {
    let prod = first;
    for (const val of rest) {
      prod *= val;
    }
    return prod;
  },
});
export { mul as "*" };

/**
 * Divides numbers.
 */
const div = defineOpcode<[number, number, ...number[]], number>("/", {
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
  handler: ([first, ...rest], _ctx) => {
    let quot = first;
    for (const val of rest) {
      quot /= val;
    }
    return quot;
  },
});
export { div as "/" };

/**
 * Calculates the modulo of two numbers.
 */
const mod = defineOpcode<[number, number], number>("%", {
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
  handler: ([a, b], _ctx) => {
    return a % b;
  },
});
export { mod as "%" };

/**
 * Calculates exponentiation (power tower).
 */
const pow = defineOpcode<[number, number, ...number[]], number>("^", {
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
    let pow = args[args.length - 1];
    for (let i = args.length - 2; i >= 0; i--) {
      const next = args[i];
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
export const random = defineOpcode<[number?, number?], number>("random", {
  metadata: {
    label: "Random",
    category: "math",
    description: "Generate random number",
    slots: [
      { name: "Min", type: "number", default: 0 },
      { name: "Max", type: "number", default: 1 },
    ],
    parameters: [
      { name: "min", type: "number", optional: true },
      { name: "max", type: "number", optional: true },
    ],
    returnType: "number",
  },
  handler: (args, _ctx) => {
    // random(max), random(min, max) or random() -> 0..1
    if (args.length === 0) return Math.random();

    let min = 0;
    let max = 1;

    if (args.length === 1) {
      max = args[0] as number;
    } else {
      [min, max] = args as [number, number];
    }

    const shouldFloor = min % 1 === 0 && max % 1 === 0;

    if (min > max) {
      throw new Error("random: min must be less than or equal to max");
    }
    const roll = Math.random() * (max - min + 1) + min;
    return shouldFloor ? Math.floor(roll) : roll;
  },
});
