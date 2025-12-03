import { ScriptValue } from "./def";
import { Entity } from "@viwo/shared/jsonrpc";

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
        str += `  at ${frame.name} (${frame.args
          .map((a) => JSON.stringify(a))
          .join(", ")})\n`;
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
  parameters?: { name: string; type: string }[];
  genericParameters?: string[];
  returnType?: string;
}

export type OpcodeHandler<Ret> = (args: any[], ctx: ScriptContext) => Ret;

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

export function executeLambda(
  lambda: any,
  args: unknown[],
  ctx: ScriptContext,
): any {
  if (!lambda || lambda.type !== "lambda") return null;

  // Create new context
  const newVars = { ...lambda.closure };
  // Bind arguments
  for (let i = 0; i < lambda.args.length; i++) {
    newVars[lambda.args[i]] = args[i];
  }

  return evaluate(lambda.body, {
    ...ctx,
    vars: newVars,
  });
}

/**
 * Evaluates a script expression.
 *
 * @param ast - The script AST (S-expression) to evaluate.
 * @param ctx - The execution context.
 * @returns The result of the evaluation.
 * @throws ScriptError if execution fails or gas runs out.
 */
export function evaluate<T>(ast: ScriptValue<T>, ctx: ScriptContext): T {
  if (ctx.gas !== undefined) {
    ctx.gas -= 1;
    if (ctx.gas < 0) {
      throw new ScriptError("Script ran out of gas!");
    }
  }
  if (Array.isArray(ast)) {
    const [op, ...args] = ast;
    if (typeof op === "string" && OPS[op]) {
      try {
        return OPS[op].handler(args, ctx) as T;
      } catch (e: any) {
        let scriptError: ScriptError;
        if (e instanceof ScriptError) {
          scriptError = e;
          if (scriptError.stackTrace.length === 0) {
            scriptError.stackTrace = [...(ctx.stack ?? [])];
          }
        } else {
          scriptError = new ScriptError(e.message ?? String(e), [
            ...(ctx.stack ?? []),
          ]);
        }
        if (!scriptError.context) {
          scriptError.context = { op, args };
        }
        throw scriptError;
      }
    } else {
      throw new ScriptError(`Unknown opcode: ${op}`, [...(ctx.stack ?? [])]);
    }
  }
  return ast as never;
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
    ...ctx,
  };
}
