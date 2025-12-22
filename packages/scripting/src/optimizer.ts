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
    "std.throw": StdLib.throw,
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

const CREATES_NEW_SCOPE = new Set(["std.for", "std.while", "std.if", "std.seq"]);

/**
 * Callback for optimization warnings (e.g., when partial evaluation fails).
 */
export type OptimizeWarningCallback = (warning: {
  message: string;
  script: ScriptValue<any>;
  error: unknown;
}) => void;

/**
 * Options for the optimize function.
 */
export interface OptimizeOptions {
  /** Callback for warnings during optimization. If not provided, warnings are logged to console.error. */
  onWarning?: OptimizeWarningCallback | undefined;
}

/**
 * Optimizes a script by partially evaluating pure expressions with constant arguments.
 *
 * @param script - The script AST to optimize.
 * @param compileFn - The compile function to use for partial evaluation.
 * @param options - Optimization options including warning callback.
 * @returns The optimized script AST.
 */
export function optimize<Type>(
  script: ScriptValue<Type>,
  compileFn: CompileFn,
  options: OptimizeOptions | boolean = {},
): ScriptValue<Type> {
  // Handle legacy boolean isTopLevel parameter for backwards compatibility
  const isTopLevel = typeof options === "boolean" ? options : true;
  const onWarning = typeof options === "object" ? options.onWarning : undefined;
  // If it's a primitive value, it's already constant
  if (!Array.isArray(script) || typeof script[0] !== "string") {
    return script;
  }
  if (!isPureSubtree(script, isTopLevel)) {
    switch (script[0]) {
      case "std.quote":
      case "std.lambda":
      case "obj.new": {
        return script;
      }
    }
    // 1. Recursively optimize children (pass options for warning callback)
    const childOptions: OptimizeOptions = { onWarning };
    return [
      script[0],
      ...script.slice(1).map((child) => optimizeInternal(child, compileFn, false, childOptions)),
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
  } catch (error) {
    // Surface optimization failure via callback or console
    const warning = {
      error,
      message: "Optimization failed for pure expression",
      script,
    };
    if (onWarning) {
      onWarning(warning);
    } else {
      console.error("Could not optimize script:", script);
      console.error("Error:", error);
    }
    // Failed to compile or run (e.g. type error, runtime error), keep original
    return script;
  }
}

/**
 * Internal optimization function that accepts isTopLevel as a separate parameter.
 */
function optimizeInternal<Type>(
  script: ScriptValue<Type>,
  compileFn: CompileFn,
  isTopLevel: boolean,
  options: OptimizeOptions,
): ScriptValue<Type> {
  const { onWarning } = options;
  // If it's a primitive value, it's already constant
  if (!Array.isArray(script) || typeof script[0] !== "string") {
    return script;
  }
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
      ...script.slice(1).map((child) => optimizeInternal(child, compileFn, false, options)),
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
  } catch (error) {
    // Surface optimization failure via callback or console
    const warning = {
      error,
      message: "Optimization failed for pure expression",
      script,
    };
    if (onWarning) {
      onWarning(warning);
    } else {
      console.error("Could not optimize script:", script);
      console.error("Error:", error);
    }
    // Failed to compile or run (e.g. type error, runtime error), keep original
    return script;
  }
}

function isPureSubtree(
  ast: ScriptValue<any>,
  isTopLevel: boolean,
  scope = new Map<string, true>(),
): boolean {
  if (!Array.isArray(ast)) {
    return true;
  } // Primitive is pure
  const [op, ...args] = ast;
  if (typeof op !== "string") {
    return false;
  } // Invalid AST
  switch (op) {
    // The following opcodes have special forms, so their arguments can be ignored
    case "std.quote": {
      return true;
    }
    case "std.let": {
      scope.set(args[0], true);
      break;
    }
    case "std.set":
    case "std.var": {
      if (!scope.has(args[0])) {
        // We found a set or var that doesn't reference a let we found
        return false;
      }
      break;
    }
  }
  // Check opcode
  // 1. Must be in PURE_OPS
  if (!(isTopLevel ? EXTENDED_PURE_OPS : PURE_OPS)[op]) {
    return false;
  }
  const childScope = CREATES_NEW_SCOPE.has(op) ? new Map(scope) : scope;
  // Recursively check args
  for (const arg of args) {
    if (!isPureSubtree(arg, isTopLevel, childScope)) {
      return false;
    }
  }
  return true;
}

/** Converts a JavaScript value back into a ViwoScript AST. */
function quote(value: unknown): ScriptValue<any> {
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
