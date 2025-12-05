import { defineFullOpcode } from "../types";

/** Adds numbers.*/
export const add = defineFullOpcode<[number, number, ...number[]], number>("+", {
  metadata: {
    label: "Add",
    category: "math",
    description: "Adds numbers.",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
    parameters: [
      { name: "a", type: "number", description: "The first number." },
      { name: "b", type: "number", description: "The second number." },
      {
        name: "...args",
        type: "number[]",
        optional: false,
        description: "Additional numbers to add.",
      },
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

/** Subtracts numbers. */
export const sub = defineFullOpcode<[number, number, ...number[]], number>("-", {
  metadata: {
    label: "-",
    category: "math",
    description: "Subtracts numbers.",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
    parameters: [
      { name: "a", type: "number", description: "The number to subtract from." },
      { name: "b", type: "number", description: "The number to subtract." },
      {
        name: "...args",
        type: "number[]",
        optional: false,
        description: "Additional numbers to subtract.",
      },
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

/** Multiplies numbers. */
export const mul = defineFullOpcode<[number, number, ...number[]], number>("*", {
  metadata: {
    label: "*",
    category: "math",
    description: "Multiplies numbers.",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
    parameters: [
      { name: "a", type: "number", description: "The first number." },
      { name: "b", type: "number", description: "The second number." },
      {
        name: "...args",
        type: "number[]",
        optional: false,
        description: "Additional numbers to multiply.",
      },
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

/** Divides numbers. */
export const div = defineFullOpcode<[number, number, ...number[]], number>("/", {
  metadata: {
    label: "/",
    category: "math",
    description: "Divides numbers.",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
    parameters: [
      { name: "a", type: "number", description: "The dividend." },
      { name: "b", type: "number", description: "The divisor." },
      { name: "...args", type: "number[]", description: "Additional divisors." },
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

/** Calculates the modulo of two numbers. */
export const mod = defineFullOpcode<[number, number], number>("%", {
  metadata: {
    label: "%",
    category: "math",
    description: "Calculates the modulo of two numbers.",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
    parameters: [
      { name: "a", type: "number", description: "The dividend." },
      { name: "b", type: "number", description: "The divisor." },
    ],
    returnType: "number",
  },
  handler: ([a, b], _ctx) => {
    return a % b;
  },
});

/** Calculates exponentiation (power tower). */
export const pow = defineFullOpcode<[number, number, ...number[]], number>("^", {
  metadata: {
    label: "^",
    category: "math",
    description: "Calculates exponentiation (power tower).",
    layout: "infix",
    slots: [
      { name: "Base", type: "block" },
      { name: "Exp", type: "block" },
    ],
    parameters: [
      { name: "base", type: "number", description: "The base number." },
      { name: "exp", type: "number", description: "The exponent." },
      { name: "...args", type: "number[]", description: "Additional exponents." },
    ],
    returnType: "number",
  },
  handler: (args, _ctx) => {
    // Power tower
    let pow = args[args.length - 1]!;
    for (let i = args.length - 2; i >= 0; i--) {
      const next = args[i]!;
      pow = next ** pow;
    }
    return pow;
  },
});

/**
 * Generates a random number.
 * - `random()`: Returns a float between 0 (inclusive) and 1 (exclusive).
 * - `random(max)`: Returns a number between 0 (inclusive) and `max` (inclusive). If `max` is an integer, returns an integer.
 * - `random(min, max)`: Returns a number between `min` (inclusive) and `max` (inclusive). If `min` and `max` are integers, returns an integer.
 */
export const random = defineFullOpcode<[number?, number?], number>("random", {
  metadata: {
    label: "Round",
    category: "math",
    description: "Generates a random number.",
    slots: [
      { name: "Min", type: "number", default: 0 },
      { name: "Max", type: "number", default: 1 },
    ],
    parameters: [
      {
        name: "min",
        type: "number",
        optional: true,
        description: "The minimum value (inclusive).",
      },
      {
        name: "max",
        type: "number",
        optional: true,
        description: "The maximum value (inclusive).",
      },
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
