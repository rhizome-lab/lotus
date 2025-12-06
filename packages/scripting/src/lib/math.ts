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
    label: "Random",
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

/** Rounds down a number. */
export const floor = defineFullOpcode<[number], number>("math.floor", {
  metadata: {
    label: "Floor",
    category: "math",
    description: "Rounds down a number.",
    slots: [{ name: "Num", type: "block" }],
    parameters: [{ name: "num", type: "number", description: "The number to floor." }],
    returnType: "number",
  },
  handler: ([num], _ctx) => {
    return Math.floor(num);
  },
});

/** Rounds up a number. */
export const ceil = defineFullOpcode<[number], number>("math.ceil", {
  metadata: {
    label: "Ceil",
    category: "math",
    description: "Rounds up a number.",
    slots: [{ name: "Num", type: "block" }],
    parameters: [{ name: "num", type: "number", description: "The number to ceil." }],
    returnType: "number",
  },
  handler: ([num], _ctx) => {
    return Math.ceil(num);
  },
});

/** Returns the integer part of a number. */
export const trunc = defineFullOpcode<[number], number>("math.trunc", {
  metadata: {
    label: "Trunc",
    category: "math",
    description: "Returns the integer part of a number.",
    slots: [{ name: "Num", type: "block" }],
    parameters: [{ name: "num", type: "number", description: "The number to truncate." }],
    returnType: "number",
  },
  handler: ([num], _ctx) => {
    return Math.trunc(num);
  },
});

/** Rounds a number to the nearest integer. */
export const round = defineFullOpcode<[number], number>("math.round", {
  metadata: {
    label: "Round",
    category: "math",
    description: "Rounds a number to the nearest integer.",
    slots: [{ name: "Num", type: "block" }],
    parameters: [{ name: "num", type: "number", description: "The number to round." }],
    returnType: "number",
  },
  handler: ([num], _ctx) => {
    return Math.round(num);
  },
});

// Trigonometry

/** Returns the sine of a number. */
export const sin = defineFullOpcode<[number], number>("math.sin", {
  metadata: {
    label: "Sin",
    category: "math",
    description: "Returns the sine of a number.",
    slots: [{ name: "Angle", type: "block" }],
    parameters: [{ name: "angle", type: "number", description: "The angle in radians." }],
    returnType: "number",
  },
  handler: ([angle], _ctx) => {
    return Math.sin(angle);
  },
});

/** Returns the cosine of a number. */
export const cos = defineFullOpcode<[number], number>("math.cos", {
  metadata: {
    label: "Cos",
    category: "math",
    description: "Returns the cosine of a number.",
    slots: [{ name: "Angle", type: "block" }],
    parameters: [{ name: "angle", type: "number", description: "The angle in radians." }],
    returnType: "number",
  },
  handler: ([angle], _ctx) => {
    return Math.cos(angle);
  },
});

/** Returns the tangent of a number. */
export const tan = defineFullOpcode<[number], number>("math.tan", {
  metadata: {
    label: "Tan",
    category: "math",
    description: "Returns the tangent of a number.",
    slots: [{ name: "Angle", type: "block" }],
    parameters: [{ name: "angle", type: "number", description: "The angle in radians." }],
    returnType: "number",
  },
  handler: ([angle], _ctx) => {
    return Math.tan(angle);
  },
});

/** Returns the arcsine of a number. */
export const asin = defineFullOpcode<[number], number>("math.asin", {
  metadata: {
    label: "Asin",
    category: "math",
    description: "Returns the arcsine of a number.",
    slots: [{ name: "Num", type: "block" }],
    parameters: [{ name: "num", type: "number", description: "The number." }],
    returnType: "number",
  },
  handler: ([num], _ctx) => {
    return Math.asin(num);
  },
});

/** Returns the arccosine of a number. */
export const acos = defineFullOpcode<[number], number>("math.acos", {
  metadata: {
    label: "Acos",
    category: "math",
    description: "Returns the arccosine of a number.",
    slots: [{ name: "Num", type: "block" }],
    parameters: [{ name: "num", type: "number", description: "The number." }],
    returnType: "number",
  },
  handler: ([num], _ctx) => {
    return Math.acos(num);
  },
});

/** Returns the arctangent of a number. */
export const atan = defineFullOpcode<[number], number>("math.atan", {
  metadata: {
    label: "Atan",
    category: "math",
    description: "Returns the arctangent of a number.",
    slots: [{ name: "Num", type: "block" }],
    parameters: [{ name: "num", type: "number", description: "The number." }],
    returnType: "number",
  },
  handler: ([num], _ctx) => {
    return Math.atan(num);
  },
});

/** Returns the angle (in radians) from the X axis to a point. */
export const atan2 = defineFullOpcode<[number, number], number>("math.atan2", {
  metadata: {
    label: "Atan2",
    category: "math",
    description: "Returns the angle (in radians) from the X axis to a point.",
    slots: [
      { name: "Y", type: "block" },
      { name: "X", type: "block" },
    ],
    parameters: [
      { name: "y", type: "number", description: "The y coordinate." },
      { name: "x", type: "number", description: "The x coordinate." },
    ],
    returnType: "number",
  },
  handler: ([y, x], _ctx) => {
    return Math.atan2(y, x);
  },
});

// Log/Exp

/** Returns the natural logarithm (base e) of a number. */
export const log = defineFullOpcode<[number], number>("math.log", {
  metadata: {
    label: "Log",
    category: "math",
    description: "Returns the natural logarithm (base e) of a number.",
    slots: [{ name: "Num", type: "block" }],
    parameters: [{ name: "num", type: "number", description: "The number." }],
    returnType: "number",
  },
  handler: ([num], _ctx) => {
    return Math.log(num);
  },
});

/** Returns the base 2 logarithm of a number. */
export const log2 = defineFullOpcode<[number], number>("math.log2", {
  metadata: {
    label: "Log2",
    category: "math",
    description: "Returns the base 2 logarithm of a number.",
    slots: [{ name: "Num", type: "block" }],
    parameters: [{ name: "num", type: "number", description: "The number." }],
    returnType: "number",
  },
  handler: ([num], _ctx) => {
    return Math.log2(num);
  },
});

/** Returns the base 10 logarithm of a number. */
export const log10 = defineFullOpcode<[number], number>("math.log10", {
  metadata: {
    label: "Log10",
    category: "math",
    description: "Returns the base 10 logarithm of a number.",
    slots: [{ name: "Num", type: "block" }],
    parameters: [{ name: "num", type: "number", description: "The number." }],
    returnType: "number",
  },
  handler: ([num], _ctx) => {
    return Math.log10(num);
  },
});

/** Returns e raised to the power of a number. */
export const exp = defineFullOpcode<[number], number>("math.exp", {
  metadata: {
    label: "Exp",
    category: "math",
    description: "Returns e raised to the power of a number.",
    slots: [{ name: "Num", type: "block" }],
    parameters: [{ name: "num", type: "number", description: "The exponent." }],
    returnType: "number",
  },
  handler: ([num], _ctx) => {
    return Math.exp(num);
  },
});

/** Returns the square root of a number. */
export const sqrt = defineFullOpcode<[number], number>("math.sqrt", {
  metadata: {
    label: "Sqrt",
    category: "math",
    description: "Returns the square root of a number.",
    slots: [{ name: "Num", type: "block" }],
    parameters: [{ name: "num", type: "number", description: "The number." }],
    returnType: "number",
  },
  handler: ([num], _ctx) => {
    return Math.sqrt(num);
  },
});

// Utilities

/** Returns the absolute value of a number. */
export const abs = defineFullOpcode<[number], number>("math.abs", {
  metadata: {
    label: "Abs",
    category: "math",
    description: "Returns the absolute value of a number.",
    slots: [{ name: "Num", type: "block" }],
    parameters: [{ name: "num", type: "number", description: "The number." }],
    returnType: "number",
  },
  handler: ([num], _ctx) => {
    return Math.abs(num);
  },
});

/** Returns the smallest of the given numbers. */
export const min = defineFullOpcode<[number, ...number[]], number>("math.min", {
  metadata: {
    label: "Min",
    category: "math",
    description: "Returns the smallest of the given numbers.",
    slots: [{ name: "Args", type: "block" }],
    parameters: [
      { name: "arg0", type: "number", description: "First number." },
      { name: "...args", type: "number[]", description: "Additional numbers." },
    ],
    returnType: "number",
  },
  handler: (args, _ctx) => {
    return Math.min(...args);
  },
});

/** Returns the largest of the given numbers. */
export const max = defineFullOpcode<[number, ...number[]], number>("math.max", {
  metadata: {
    label: "Max",
    category: "math",
    description: "Returns the largest of the given numbers.",
    slots: [{ name: "Args", type: "block" }],
    parameters: [
      { name: "arg0", type: "number", description: "First number." },
      { name: "...args", type: "number[]", description: "Additional numbers." },
    ],
    returnType: "number",
  },
  handler: (args, _ctx) => {
    return Math.max(...args);
  },
});

/** Clamps a number between a minimum and maximum value. */
export const clamp = defineFullOpcode<[number, number, number], number>("math.clamp", {
  metadata: {
    label: "Clamp",
    category: "math",
    description: "Clamps a number between a minimum and maximum value.",
    slots: [
      { name: "Val", type: "block" },
      { name: "Min", type: "block" },
      { name: "Max", type: "block" },
    ],
    parameters: [
      { name: "val", type: "number", description: "The value to clamp." },
      { name: "min", type: "number", description: "The minimum value." },
      { name: "max", type: "number", description: "The maximum value." },
    ],
    returnType: "number",
  },
  handler: ([val, min, max], _ctx) => {
    return Math.min(Math.max(val, min), max);
  },
});

/** Returns the sign of a number. */
export const sign = defineFullOpcode<[number], number>("math.sign", {
  metadata: {
    label: "Sign",
    category: "math",
    description:
      "Returns the sign of a number, indicating whether the number is positive, negative or zero.",
    slots: [{ name: "Num", type: "block" }],
    parameters: [{ name: "num", type: "number", description: "The number." }],
    returnType: "number",
  },
  handler: ([num], _ctx) => {
    return Math.sign(num);
  },
});
