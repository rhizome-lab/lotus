import {
  OpcodeDefinition,
  OpcodeMetadata,
  ScriptContext,
  ScriptError,
  ScriptValue,
  StackFrame,
} from "./types";

export {
  type OpcodeDefinition,
  type OpcodeMetadata,
  type ScriptContext,
  ScriptError,
  type ScriptValue,
  type StackFrame,
};

let typecheck = true;

const WHITELISTED_TYPES = new Set<string>(["any", "unknown", "Entity", "Capability"]);

export function setTypechecking(enabled: boolean) {
  typecheck = enabled;
}

export const OPS: Record<string, OpcodeDefinition> = {};

/**
 * Registers a library of opcodes.
 *
 * @param library - A record of opcode definitions.
 */
export function registerLibrary(library: Record<string, OpcodeDefinition>) {
  for (const def of Object.values(library)) {
    OPS[def.metadata.opcode] = def;
  }
}

export function getOpcode(name: string) {
  return OPS[name]?.handler;
}

/**
 * Retrieves metadata for all registered opcodes.
 *
 * @returns An array of opcode metadata objects.
 */
export function getOpcodeMetadata() {
  return Object.values(OPS).map((def) => def.metadata);
}

export function executeLambda(lambda: any, args: unknown[], ctx: ScriptContext): any {
  if (!lambda || lambda.type !== "lambda") return null;

  // Create new context
  const newVars = { ...lambda.closure };
  // Bind arguments
  for (let i = 0; i < lambda.args.length; i += 1) {
    newVars[lambda.args[i]] = args[i];
  }

  return evaluate(lambda.body, { ...ctx, vars: newVars });
}

/** Signal thrown to break out of a loop. */
export class BreakSignal {
  constructor() {}
}

/** Signal thrown to return from a function. */
export class ReturnSignal {
  constructor(public value: any = null) {}
}

/** Signal thrown to continue to the next iteration of a loop. */
export class ContinueSignal {
  constructor() {}
}

/**
 * Unsafely casts a value to its awaited type. Use this when you are sure that the value is not a Promise.
 *
 * @param value - The value to cast.
 * @returns The value cast to its awaited type.
 */
export function unsafeAsAwaited<T>(value: T): Awaited<T> {
  return value as Awaited<T>;
}

/**
 * Evaluates a script expression using an explicit stack machine with SOA (Structure of Arrays).
 *
 * @param ast - The script AST (S-expression) to evaluate.
 * @param ctx - The execution context.
 * @returns The result of the evaluation (or a Promise if async).
 * @throws ScriptError if execution fails or gas runs out.
 */
export function evaluate<T>(ast: ScriptValue<T>, ctx: ScriptContext): T | Promise<T> {
  // If it's a simple value, return immediately
  if (!Array.isArray(ast)) {
    return ast as T;
  }

  // SOA Stack (Dynamic)
  const stackOp: string[] = [];
  const stackArgs: unknown[][] = [];
  const stackAst: any[][] = [];
  const stackIdx: number[] = [];
  let sp = 0;

  // Push initial frame
  const op = ast[0];
  if (typeof op !== "string" || !OPS[op]) {
    throw new ScriptError(`Unknown opcode: ${op}`, []);
  }

  stackOp[0] = op;
  stackArgs[0] = [];
  stackAst[0] = ast;
  stackIdx[0] = 1;
  sp = 1;

  return executeLoop(ctx, sp, stackOp, stackArgs, stackAst, stackIdx);
}

function executeLoop(
  ctx: ScriptContext,
  sp: number,
  stackOp: string[],
  stackArgs: unknown[][],
  stackAst: any[][],
  stackIdx: number[],
): any {
  while (sp > 0) {
    if (ctx.gas !== undefined) {
      ctx.gas -= 1;
      if (ctx.gas < 0) {
        throw new ScriptError("Script ran out of gas!");
      }
    }

    const top = sp - 1;
    const op = stackOp[top]!;
    const def = OPS[op];
    if (!def) throw new ScriptError(`Unknown opcode: ${op}`);

    // If Lazy, pass all remaining args as is and execute immediately
    if (def.metadata.lazy) {
      const ast = stackAst[top]!;
      let idx = stackIdx[top]!;
      if (idx < ast.length) {
        const args = stackArgs[top]!;
        while (idx < ast.length) {
          args.push(ast[idx++]);
        }
        stackIdx[top] = idx;
      }
    }

    const ast = stackAst[top]!;
    const idx = stackIdx[top]!;

    if (idx < ast.length) {
      // Process next argument (Strict mode)
      const nextArg = ast[idx];
      stackIdx[top]! += 1; // Advance index

      if (Array.isArray(nextArg)) {
        // It's a nested call, push a new frame
        const nextOp = nextArg[0];
        if (typeof nextOp !== "string" || !OPS[nextOp]) {
          throw new ScriptError(
            `Unknown opcode: ${nextOp}`,
            createStackTrace(sp, stackOp, stackArgs),
          );
        }

        stackOp[sp] = nextOp;
        stackArgs[sp] = [];
        stackAst[sp] = nextArg;
        stackIdx[sp] = 1;
        sp += 1;
      } else {
        // It's a primitive value, push to args directly
        stackArgs[top]!.push(nextArg);
      }
    } else {
      // All arguments evaluated, execute opcode
      const args = stackArgs[top]!;
      sp -= 1; // Pop frame

      let result: unknown;
      try {
        // Validate arguments
        if (typecheck && def.metadata.parameters) {
          validateArgs(op, args, def.metadata);
        }

        result = def.handler(args, ctx);
      } catch (e: any) {
        if (e instanceof BreakSignal) {
          throw e;
        }
        if (e instanceof ReturnSignal) {
          return e.value;
        }
        if (e instanceof ContinueSignal) {
          throw e; // Propagate continue signal to loop handler
        }
        let scriptError: ScriptError;
        if (e instanceof ScriptError) {
          scriptError = e;
          if (scriptError.stackTrace.length === 0) {
            scriptError.stackTrace = [
              ...(ctx.stack ?? []),
              ...createStackTrace(sp, stackOp, stackArgs),
            ];
          }
        } else {
          scriptError = new ScriptError(e.message ?? String(e), [
            ...(ctx.stack ?? []),
            ...createStackTrace(sp, stackOp, stackArgs),
          ]);
        }
        scriptError.context ??= { op: op, args: args };
        throw scriptError;
      }

      // Handle Async Result
      if (result instanceof Promise) {
        return handleAsyncResult(result, ctx, sp, stackOp, stackArgs, stackAst, stackIdx);
      }

      // If stack is empty, we are done
      if (sp === 0) {
        return result;
      }

      // Otherwise, push result to parent frame's args
      stackArgs[sp - 1]!.push(result);
    }
  }

  // Should not be reached if stack logic is correct
  throw new ScriptError("Stack underflow");
}

async function handleAsyncResult(
  promise: Promise<unknown>,
  ctx: ScriptContext,
  sp: number,
  stackOp: string[],
  stackArgs: unknown[][],
  stackAst: any[][],
  stackIdx: number[],
): Promise<unknown> {
  let currentResult = await promise;

  // Push result to parent frame and continue loop
  if (sp === 0) {
    return currentResult;
  }

  stackArgs[sp - 1]!.push(currentResult);

  // Resume the loop
  return executeLoop(ctx, sp, stackOp, stackArgs, stackAst, stackIdx);
}

function createStackTrace(sp: number, stackOp: string[], stackArgs: unknown[][]): StackFrame[] {
  const trace: StackFrame[] = [];
  for (let i = 0; i < sp; i += 1) {
    trace.push({
      name: stackOp[i]!,
      args: stackArgs[i]!,
    });
  }
  return trace;
}

function validateArgs(op: string, args: unknown[], metadata: OpcodeMetadata) {
  const params = metadata.parameters;
  if (!params) {
    return;
  }
  const hasRest = params.some((p) => p.name.startsWith("..."));
  const minArgs = params.filter((p) => !p.optional && !p.name.startsWith("...")).length;

  if (args.length < minArgs) {
    throw new ScriptError(`${op}: expected at least ${minArgs} arguments, got ${args.length}`);
  }

  if (!hasRest && args.length > params.length) {
    throw new ScriptError(`${op}: expected at most ${params.length} arguments, got ${args.length}`);
  }

  // Type checking
  for (let i = 0; i < args.length; i += 1) {
    const param = i < params.length ? params[i] : params[params.length - 1];
    if (!param) {
      throw new ScriptError(
        `${op}: expected at least ${params.length} arguments, got ${args.length}`,
      );
    }
    // Handle rest param logic
    const currentParam =
      param.name.startsWith("...") || i >= params.length ? params[params.length - 1] : param;
    if (!currentParam) {
      throw new ScriptError(
        `${op}: expected at least ${params.length} arguments, got ${args.length}`,
      );
    }

    const arg = args[i];
    const type = currentParam.type.replace("[]", "");

    if (WHITELISTED_TYPES.has(type)) continue;

    if (currentParam.type.endsWith("[]")) {
      if (currentParam.name.startsWith("...")) {
        // Variadic
        if (
          !WHITELISTED_TYPES.has(type) &&
          !/\W/.test(type) &&
          !metadata.genericParameters?.some(
            (param) => param.replace(/\s*\bextends\b.+/, "") === type,
          ) &&
          typeof arg !== type &&
          arg !== null
        ) {
          if (type === "object" && (typeof arg !== "object" || arg === null)) {
            throw new ScriptError(`${op}: expected ${type} for ${currentParam.name} at index ${i}`);
          }
          if (
            type !== "object" &&
            typeof arg !== type &&
            !/\W/.test(type) &&
            !metadata.genericParameters?.some(
              (param) => param.replace(/\s*\bextends\b.+/, "") === type,
            )
          ) {
            throw new ScriptError(`${op}: expected ${type} for ${currentParam.name} at index ${i}`);
          }
        }
      } else {
        // Array argument
        if (!Array.isArray(arg)) {
          throw new ScriptError(`${op}: expected array for ${currentParam.name}`);
        }
      }
    } else {
      if (type === "object") {
        if (typeof arg !== "object" || arg === null) {
          throw new ScriptError(`${op}: expected object for ${currentParam.name}`);
        }
      } else if (typeof arg !== type) {
        const types = type.split("|").map((t) => t.trim());
        const argType = arg === null ? "null" : typeof arg;
        if (
          types.includes("Capability") &&
          arg &&
          typeof arg === "object" &&
          (arg as any).__brand === "Capability"
        ) {
          continue;
        }
        if (
          types.includes("Entity") &&
          arg &&
          typeof arg === "object" &&
          typeof (arg as any).id === "number"
        ) {
          continue;
        }
        if (
          !types.includes(argType) &&
          !/\W/.test(type) &&
          !metadata.genericParameters?.some(
            (param) => param.replace(/\s*\bextends\b.+/, "") === type,
          )
        ) {
          throw new ScriptError(`${op}: expected ${type} for ${currentParam.name}`);
        }
      }
    }
  }
}

/**
 * Creates a new script context with default values.
 *
 * @param ctx - Partial context to override defaults.
 * @returns A complete ScriptContext.
 */
export function createScriptContext(
  ctx: Pick<ScriptContext, "caller" | "this"> & Partial<ScriptContext>,
): ScriptContext {
  return {
    args: [],
    gas: 1000,
    warnings: [],
    vars: {},
    stack: [],
    cow: false,
    ...ctx,
  };
}
