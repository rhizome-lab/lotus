import * as BooleanLib from "./lib/boolean";
import * as ListLib from "./lib/list";
import * as MathLib from "./lib/math";
import * as ObjectLib from "./lib/object";
import * as StdLib from "./lib/std";
import * as StringLib from "./lib/string";
import * as TimeLib from "./lib/time";
import type { ScriptContext, ScriptOps, ScriptValue } from "./types";
import { createOpcodeRegistry, createScriptContext } from "./interpreter";

// Type definition for the compile function to avoid import cycle
type CompileFn = (
  script: ScriptValue<any>,
  ops: ScriptOps,
  options: { optimize?: boolean },
) => (ctx: ScriptContext) => any;

const BASE_PURE_OPS = [
  // Arithmetic & Math (excluding random)
  MathLib,
  // Boolean Logic
  BooleanLib,
  // String operations
  StringLib,
  // List operations
  ListLib,
  // Object operations
  ObjectLib,
  {
    // Standard Lib (excluding IO and impure state)
    "json.parse": StdLib.jsonParse,
    "json.stringify": StdLib.jsonStringify,
    "std.break": StdLib.break,
    "std.continue": StdLib.continue,
    "std.for": StdLib.for,
    "std.if": StdLib.if,
    "std.quote": StdLib.quote,
    "std.seq": StdLib.seq,
    "std.typeof": StdLib.typeof,
    "std.while": StdLib.while,
    // Exclude: print, log, warn, throw, time.now, random
    // Time (pure only)
    "time.from_timestamp": TimeLib.timeFromTimestamp,
    "time.offset": TimeLib.timeOffset,
    "time.parse": TimeLib.timeParse,
    "time.to_timestamp": TimeLib.timeToTimestamp,
  },
];

// Construct the registry of pure opcodes safe for partial evaluation
const PURE_OPS = createOpcodeRegistry(...BASE_PURE_OPS);

const EXTENDED_PURE_OPS = createOpcodeRegistry(
  ...BASE_PURE_OPS,
  {
    "std.let": StdLib.let,
    "std.set": StdLib.set,
    "std.var": StdLib.var,
  },
);

/**
 * Optimizes a script by partially evaluating pure expressions with constant arguments.
 *
 * @param script - The script AST to optimize.
 * @param compileFn - The compile function to use for partial evaluation.
 * @returns The optimized script AST.
 */
export function optimize<Type>(
  script: ScriptValue<Type>,
  compileFn: CompileFn,
  isTopLevel = true,
): ScriptValue<Type> {
  // If it's a primitive value, it's already constant
  if (!Array.isArray(script) || typeof script[0] !== "string") {
    return script;
  }
  console.log(script, isPureSubtree(script, isTopLevel));
  if (!isPureSubtree(script, isTopLevel)) {
    switch (script[0]) {
      case "std.quote":
      case "std.lambda":
      case "obj.new": {
        return script;
      }
    }
    // 1. Recursively optimize children
    return [
      script[0],
      ...script.slice(1).map((child) => optimize(child, compileFn, false)),
    ] as ScriptValue<Type>;
  }
  // Try to evaluate
  try {
    // Disable optimization to avoid infinite recursion
    const fn = compileFn(script, PURE_OPS, { optimize: false });
    const ctx = createScriptContext({ caller: { id: 1 }, ops: PURE_OPS, this: { id: 1 } });
    const result = fn(ctx);
    // Quote the result back to AST
    return quote(result) as ScriptValue<Type>;
  } catch {
    // Failed to compile or run (e.g. type error, runtime error), keep original
    return script;
  }
}

function isPureSubtree(ast: ScriptValue<any>, isTopLevel: boolean): boolean {
  if (!Array.isArray(ast)) {
    return true;
  } // Primitive is pure
  const [op, ...args] = ast;
  if (typeof op !== "string") {
    return false;
  } // Invalid AST
  if (op === "quote") {
    return true;
  }
  // Check opcode
  // 1. Must be in PURE_OPS
  if (!(isTopLevel ? EXTENDED_PURE_OPS : PURE_OPS)[op]) {
    return false;
  }
  // Recursively check args
  for (const arg of args) {
    if (!isPureSubtree(arg, isTopLevel)) {
      return false;
    }
  }
  return true;
}

/** Converts a JavaScript value back into a ViwoScript AST. */
export function quote(value: unknown): ScriptValue<any> {
  if (value instanceof Date) {
    return TimeLib.timeFromTimestamp(value.getTime());
  }
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    // Handle special numbers
    if (typeof value === "number" && !Number.isFinite(value)) {
      return null;
    }
    return value;
  }
  return StdLib.quote(value);
}
