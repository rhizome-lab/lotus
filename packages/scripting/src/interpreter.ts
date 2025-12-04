import { ScriptValue } from "./def";
import { Entity } from "@viwo/shared/jsonrpc";

let typecheck = true;

const WHITELISTED_TYPES = new Set<string>(["any", "unknown", "Entity", "Capability"]);

export function setTypechecking(enabled: boolean) {
  typecheck = enabled;
}

/**
 * Execution context for a script.
 * Contains the current state, variables, and environment.
 */
export interface StackFrame {
  name: string;
  args: unknown[];
}

export type ScriptContext = {
  /** The entity that initiated the script execution. */
  caller: Entity;
  /** The entity the script is currently attached to/executing on. */
  this: Entity;
  /** Arguments passed to the script. */
  args: readonly unknown[];
  /** Gas limit to prevent infinite loops. */
  gas: number;
  /** Function to send messages back to the caller. */
  send?: (type: string, payload: unknown) => void;
  /** List of warnings generated during execution. */
  warnings: string[];
  /** Copy-On-Write flag for scope forking. */
  cow: boolean;
  /** Local variables in the current scope. */
  vars: Record<string, unknown>;
  /** Call stack for error reporting. */
  stack: StackFrame[];
};

export type ScriptLibraryDefinition = Record<
  string,
  (args: readonly unknown[], ctx: ScriptContext) => unknown
>;

/**
 * Error thrown when script execution fails.
 */
export class ScriptError extends Error {
  public stackTrace: StackFrame[] = [];
  public context?: { op: string; args: unknown[] };

  constructor(message: string, stack: StackFrame[] = []) {
    super(message);
    this.name = "ScriptError";
    this.stackTrace = stack;
  }

  override toString() {
    let str = `ScriptError: ${this.message}`;
    if (this.context) {
      str += `\nAt: (${this.context.op} ...)\n`;
    }
    if (this.stackTrace.length > 0) {
      str += "\nStack trace:\n";
      for (let i = this.stackTrace.length - 1; i >= 0; i--) {
        const frame = this.stackTrace[i];
        if (!frame) {
          continue;
        }
        str += `  at ${frame.name} (${frame.args.map((a) => JSON.stringify(a)).join(", ")})\n`;
      }
    }
    return str;
  }
}

/**
 * Metadata describing an opcode for documentation and UI generation.
 */
export interface OpcodeMetadata {
  /** Human-readable label. */
  label: string;
  /** The opcode name. */
  opcode: string;
  /** Category for grouping. */
  category: string;
  /** Description of what the opcode does. */
  description?: string;
  // For Node Editor
  layout?: "infix" | "standard" | "primitive" | "control-flow";
  slots?: {
    name: string;
    type: "block" | "string" | "number" | "boolean";
    default?: any;
  }[];
  // For Monaco/TS
  parameters?: { name: string; type: string; optional?: boolean }[];
  genericParameters?: string[];
  returnType?: string;
  /** If true, arguments are NOT evaluated before being passed to the handler. Default: false (Strict). */
  lazy?: boolean;
}

export type OpcodeHandler<Ret> = (args: any[], ctx: ScriptContext) => Ret | Promise<Ret>;

export interface OpcodeDefinition {
  handler: OpcodeHandler<unknown>;
  metadata: OpcodeMetadata;
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

/**
 * Signal thrown to break out of a loop.
 */
export class BreakSignal {
  constructor(public value: any = null) {}
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
        if (!scriptError.context) {
          scriptError.context = { op: op, args: args };
        }
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
