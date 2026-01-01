import {
  type OpcodeBuilder,
  type OpcodeMetadata,
  type ScriptContext,
  ScriptError,
  type ScriptOps,
  type ScriptValue,
  type StackFrame,
} from "./types";

export { type OpcodeBuilder, type ScriptContext, ScriptError, type ScriptValue, type StackFrame };

let typecheck = true;

const WHITELISTED_TYPES = new Set<string>(["any", "unknown", "Entity", "Capability"]);

export function setTypechecking(enabled: boolean) {
  typecheck = enabled;
}

/**
 * Creates a new opcode registry by merging multiple libraries.
 *
 * @param libs - List of libraries (records of opcode definitions) to merge.
 * @returns A single record containing all opcodes.
 */
export function createOpcodeRegistry(...libs: ScriptOps[]): ScriptOps {
  const registry: ScriptOps = {};
  for (const lib of libs) {
    for (const def of Object.values(lib)) {
      if (typeof def === "function" && "metadata" in def && (def as any).metadata?.opcode) {
        registry[(def as any).metadata.opcode] = def;
      }
    }
  }
  return registry;
}

export function executeLambda(lambda: any, args: unknown[], ctx: ScriptContext): any {
  if (!lambda || lambda.type !== "lambda") {
    return null;
  }
  // Create new context
  const newVars = Object.create(lambda.closure ?? null);
  // Bind arguments
  for (let idx = 0; idx < lambda.args.length; idx += 1) {
    newVars[lambda.args[idx]] = args[idx];
  }
  return evaluate(lambda.body, { ...ctx, vars: newVars });
}

/** Signal thrown to break out of a loop. */
// oxlint-disable-next-line no-extraneous-class
export class BreakSignal {}

/** Signal thrown to return from a function. */
export class ReturnSignal {
  constructor(public value: any) {}
}

/** Signal thrown to continue to the next iteration of a loop. */
// oxlint-disable-next-line no-extraneous-class
export class ContinueSignal {}

/**
 * Unsafely casts a value to its awaited type. Use this when you are sure that the value is not a Promise.
 *
 * @param value - The value to cast.
 * @returns The value cast to its awaited type.
 */
export function unsafeAsAwaited<Type>(value: Type): Awaited<Type> {
  return value as Awaited<Type>;
}

/**
 * Evaluates a script expression using an explicit stack machine with SOA (Structure of Arrays).
 *
 * @param ast - The script AST (S-expression) to evaluate.
 * @param ctx - The execution context.
 * @returns The result of the evaluation (or a Promise if async).
 * @throws ScriptError if execution fails or gas runs out.
 */
export function evaluate<Type>(
  ast: ScriptValue<Type>,
  ctx: ScriptContext,
  { catchReturn = true }: { catchReturn?: boolean } = {},
): Type | Promise<Type> {
  // If it's a simple value, return immediately
  if (!Array.isArray(ast)) {
    return ast as Type;
  }

  // Track initial gas for debugging
  const initialGas = ctx.gas;

  // SOA Stack (Dynamic)
  const stackOp: string[] = [];
  const stackArgs: unknown[][] = [];
  const stackAst: any[][] = [];
  const stackIdx: number[] = [];
  let sp = 0;

  // Push initial frame
  const [op] = ast;
  if (typeof op !== "string" || !ctx.ops[op]) {
    throw new ScriptError(`Unknown opcode: ${op}`, []);
  }

  stackOp[0] = op;
  stackArgs[0] = [];
  stackAst[0] = ast;
  stackIdx[0] = 1;
  sp = 1;

  return executeLoop(ctx, sp, stackOp, stackArgs, stackAst, stackIdx, { catchReturn, initialGas });
}

// oxlint-disable-next-line max-params
function executeLoop(
  ctx: ScriptContext,
  sp: number,
  stackOp: string[],
  stackArgs: unknown[][],
  stackAst: any[][],
  stackIdx: number[],
  options: { catchReturn?: boolean; initialGas?: number },
): any {
  while (sp > 0) {
    if (ctx.gas !== undefined) {
      ctx.gas -= 1;
      if (ctx.gas < 0) {
        const error = new ScriptError("Script ran out of gas!");
        if (options.initialGas !== undefined) {
          error.gasLimit = options.initialGas;
          error.gasUsed = options.initialGas;
        }
        throw error;
      }
    }

    const top = sp - 1;
    const op = stackOp[top]!;
    const def = ctx.ops[op];
    if (!def) {
      throw new ScriptError(`Unknown opcode: ${op}`);
    }

    // If Lazy, pass all remaining args as is and execute immediately
    if (def.metadata.lazy) {
      const ast = stackAst[top]!;
      let idx = stackIdx[top]!;
      if (idx < ast.length) {
        const args = stackArgs[top]!;
        while (idx < ast.length) {
          args.push(ast[idx]);
          idx += 1;
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
        const [nextOp] = nextArg;
        if (typeof nextOp !== "string" || !ctx.ops[nextOp]) {
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
      } catch (error) {
        if (error instanceof BreakSignal) {
          throw error;
        }
        if (error instanceof ReturnSignal) {
          if (options.catchReturn) {
            return error.value;
          }
          throw error;
        }
        if (error instanceof ContinueSignal) {
          throw error; // Propagate continue signal to loop handler
        }
        let scriptError: ScriptError;
        if (error instanceof ScriptError) {
          scriptError = error;
          if (scriptError.stackTrace.length === 0) {
            scriptError.stackTrace = [
              ...(ctx.stack ?? []),
              ...createStackTrace(sp, stackOp, stackArgs),
            ];
          }
        } else {
          scriptError = new ScriptError((error as any).message ?? String(error), [
            ...(ctx.stack ?? []),
            ...createStackTrace(sp, stackOp, stackArgs),
          ]);
        }
        scriptError.context ??= { args: args, op: op };
        // This *is* an error object.
        // oxlint-disable-next-line no-throw-literal
        throw scriptError;
      }

      // Handle Async Result
      if (result instanceof Promise) {
        return handleAsyncResult(result, ctx, sp, stackOp, stackArgs, stackAst, stackIdx, options);
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

// oxlint-disable-next-line max-params
async function handleAsyncResult(
  promise: Promise<unknown>,
  ctx: ScriptContext,
  sp: number,
  stackOp: string[],
  stackArgs: unknown[][],
  stackAst: any[][],
  stackIdx: number[],
  options: { catchReturn?: boolean; initialGas?: number },
): Promise<unknown> {
  let currentResult: unknown;
  try {
    currentResult = await promise;
  } catch (error) {
    // Handle ReturnSignal from async operations (e.g., std.return after async op in std.seq)
    if (error instanceof ReturnSignal && options.catchReturn) {
      return error.value;
    }
    throw error;
  }
  // Push result to parent frame and continue loop
  if (sp === 0) {
    return currentResult;
  }
  stackArgs[sp - 1]!.push(currentResult);
  // Resume the loop
  return executeLoop(ctx, sp, stackOp, stackArgs, stackAst, stackIdx, options);
}

function createStackTrace(sp: number, stackOp: string[], stackArgs: unknown[][]): StackFrame[] {
  const trace: StackFrame[] = [];
  for (let idx = 0; idx < sp; idx += 1) {
    trace.push({ args: stackArgs[idx]!, name: stackOp[idx]! });
  }
  return trace;
}

function validateArgs(op: string, args: unknown[], metadata: OpcodeMetadata) {
  const { parameters, lazy } = metadata;
  if (!parameters || lazy) {
    return;
  }
  const hasRest = parameters.some((parameter) => parameter.name.startsWith("..."));
  const minArgs = parameters.filter(
    (parameter) => !parameter.optional && !parameter.name.startsWith("..."),
  ).length;

  if (args.length < minArgs) {
    throw new ScriptError(`${op}: expected at least ${minArgs} arguments, got ${args.length}`);
  }

  if (!hasRest && args.length > parameters.length) {
    throw new ScriptError(
      `${op}: expected at most ${parameters.length} arguments, got ${args.length}`,
    );
  }

  // Type checking
  for (let idx = 0; idx < args.length; idx += 1) {
    const param = idx < parameters.length ? parameters[idx] : parameters.at(-1);
    if (!param) {
      throw new ScriptError(
        `${op}: expected at least ${parameters.length} arguments, got ${args.length}`,
      );
    }
    // Handle rest param logic
    const currentParam =
      param.name.startsWith("...") || idx >= parameters.length ? parameters.at(-1) : param;
    if (!currentParam) {
      throw new ScriptError(
        `${op}: expected at least ${parameters.length} arguments, got ${args.length}`,
      );
    }

    const arg = args[idx];
    const type = currentParam.type.replace("[]", "");

    if (WHITELISTED_TYPES.has(type)) {
      continue;
    }

    if (currentParam.type.endsWith("[]") && !currentParam.type.startsWith("(")) {
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
            throw new ScriptError(
              `${op}: expected ${type} for ${currentParam.name} at index ${idx}`,
            );
          }
          if (
            type !== "object" &&
            typeof arg !== type &&
            !/\W/.test(type) &&
            !metadata.genericParameters?.some(
              (param) => param.replace(/\s*\bextends\b.+/, "") === type,
            )
          ) {
            throw new ScriptError(
              `${op}: expected ${type} for ${currentParam.name} at index ${idx}`,
            );
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
        const types = new Set(type.split("|").map((type) => type.trim()));
        const argType = arg === null ? "null" : typeof arg;
        if (
          types.has("Capability") &&
          arg &&
          typeof arg === "object" &&
          (arg as any).__brand === "Capability"
        ) {
          continue;
        }
        if (
          types.has("Entity") &&
          arg &&
          typeof arg === "object" &&
          typeof (arg as any).id === "number"
        ) {
          continue;
        }
        if (
          !types.has(argType) &&
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
 * Retrieves metadata for all opcodes in a registry.
 *
 * @param ops - The opcode registry.
 * @returns A record of opcode metadata.
 */
export function getOpcodeMetadata(ops: ScriptOps): Record<string, OpcodeMetadata> {
  const metadata: Record<string, OpcodeMetadata> = {};
  for (const [key, def] of Object.entries(ops)) {
    metadata[key] = def.metadata;
  }
  return metadata;
}

/**
 * Creates a new script context with default values.
 *
 * @param ctx - Partial context to override defaults.
 * @returns A complete ScriptContext.
 */
export function createScriptContext(
  ctx: Pick<ScriptContext, "caller" | "this" | "ops"> & Partial<ScriptContext>,
): ScriptContext {
  return {
    args: [],
    cow: false,
    gas: 1000,
    stack: [],
    vars: {},
    warnings: [],
    ...ctx,
  };
}
