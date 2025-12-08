import type { Entity } from "@viwo/shared/jsonrpc";

/**
 * Execution context for a script.
 * Contains the current state, variables, and environment.
 */
export interface StackFrame {
  name: string;
  args: unknown[];
}

export interface ScriptContext {
  /** The entity that initiated the script execution. */
  readonly caller: Entity;
  /** The entity the script is currently attached to/executing on. */
  readonly this: Entity;
  /** Arguments passed to the script. */
  readonly args: readonly unknown[];
  /** Gas limit to prevent infinite loops. */
  gas: number;
  /** Function to send messages back to the caller. */
  readonly send?: (type: string, payload: unknown) => void;
  /** List of warnings generated during execution. */
  readonly warnings: string[];
  /** Copy-On-Write flag for scope forking. */
  cow: boolean;
  /** Local variables in the current scope. */
  vars: Record<string, unknown>;
  /** Call stack for error reporting. */
  readonly stack: StackFrame[];
  /** Opcode registry for this context. */
  readonly ops: Record<string, OpcodeBuilder<any[], any>>;
}

export type ScriptLibraryDefinition = Record<
  string,
  (args: readonly unknown[], ctx: ScriptContext) => unknown
>;

/** Error thrown when script execution fails. */
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
      for (let idx = this.stackTrace.length - 1; idx >= 0; idx -= 1) {
        const frame = this.stackTrace[idx];
        if (!frame) {
          continue;
        }
        str += `  at ${frame.name} (${frame.args.map((arg) => JSON.stringify(arg)).join(", ")})\n`;
      }
    }
    return str;
  }
}

interface OpcodeParameter {
  name: string;
  type: string;
  optional?: boolean;
  description?: string;
}

interface FullOpcodeParameter extends OpcodeParameter {
  description: string;
}

/** Metadata describing an opcode for documentation and UI generation. */
export interface OpcodeMetadata<Lazy extends boolean = boolean, Full extends boolean = false> {
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
  parameters?: readonly (Full extends true ? FullOpcodeParameter : OpcodeParameter)[];
  genericParameters?: string[];
  returnType?: string;
  /** If true, arguments are NOT evaluated before being passed to the handler. Default: false (Strict). */
  lazy?: Lazy;
}

export interface FullOpcodeMetadata<Lazy extends boolean = boolean>
  extends
    Omit<OpcodeMetadata<Lazy, true>, "slots" | "description" | "parameters" | "returnType">,
    Required<
      Pick<OpcodeMetadata<Lazy, true>, "slots" | "description" | "parameters" | "returnType">
    > {}

export type OpcodeHandler<Args extends readonly unknown[], Ret, Lazy extends boolean = boolean> = (
  args: {
    [Key in keyof Args]: Args[Key] extends ScriptRaw<infer Type>
      ? Type
      : Lazy extends true
        ? ScriptValue<Args[Key]>
        : Args[Key];
  },
  ctx: ScriptContext,
) => Ret | Promise<Ret>;

declare const RAW_MARKER: unique symbol;
export interface ScriptRaw<Type> {
  [RAW_MARKER]: Type;
}

export interface Capability {
  readonly __brand: "Capability";
  readonly id: string;
}

type UnknownUnion =
  | string
  | number
  | boolean
  | null
  | undefined
  | (Record<string, unknown> & { readonly length?: never })
  | (Record<string, unknown> & { readonly slice?: never });

export type ScriptValue_<Type> = Exclude<Type, readonly unknown[]>;

/**
 * Represents a value in the scripting language.
 * Can be a primitive, an object, or a nested S-expression (array).
 */
export type ScriptValue<Type> =
  | (unknown extends Type
      ? ScriptValue_<UnknownUnion>
      : object extends Type
        ? Extract<ScriptValue_<UnknownUnion>, object>
        : ScriptValue_<Type>)
  | ScriptExpression<any[], Type>;

// Phantom type for return type safety
export type ScriptExpression<Args extends (string | ScriptValue_<unknown>)[], Ret> = [
  string,
  ...Args,
] & {
  __returnType: Ret;
};

export type UnwrapScriptExpression<Type> =
  Type extends ScriptExpression<any, infer Ret> ? Ret : Type;

type IsAny<Type> = 0 extends 1 & Type ? true : false;

export interface OpcodeBuilder<
  Args extends (string | ScriptValue_<unknown>)[],
  Ret,
  Lazy extends boolean = boolean,
> {
  (
    ...args: IsAny<Args> extends true
      ? any
      : {
          [Key in keyof Args]: Args[Key] extends ScriptRaw<infer Type>
            ? Type
            : ScriptValue<Args[Key]>;
        }
  ): ScriptExpression<Args, Ret>;
  opcode: string;
  handler: OpcodeHandler<Args, Ret, Lazy>;
  metadata: OpcodeMetadata<Lazy>;
}

export type ScriptOps = Record<string, OpcodeBuilder<any, any>>;

/**
 * Defines a new opcode.
 *
 * @param opcode - The opcode name (e.g., "log", "+").
 * @param def - The opcode definition (metadata and handler).
 * @returns A builder function that can be used to construct S-expressions for this opcode in TypeScript.
 */
export function defineOpcode<
  Args extends (string | ScriptValue_<unknown>)[] = never,
  Ret = never,
  Lazy extends boolean = false,
  Full extends boolean = false,
>(
  opcode: string,
  def: {
    metadata: Omit<Full extends true ? FullOpcodeMetadata<Lazy> : OpcodeMetadata<Lazy>, "opcode">;
    handler: OpcodeHandler<Args, Ret, Lazy>;
  },
): OpcodeBuilder<Args, Ret, Lazy> {
  const builder = ((...args: Args) => {
    const expr = [opcode, ...args] as unknown as ScriptExpression<Args, Ret>;
    return expr;
  }) as OpcodeBuilder<Args, Ret, Lazy>;

  builder.opcode = opcode;
  builder.handler = def.handler;
  builder.metadata = { ...def.metadata, opcode } as OpcodeMetadata<Lazy, false>;

  return builder;
}

export function defineFullOpcode<
  Args extends (string | ScriptValue_<unknown>)[] = never,
  Ret = never,
  Lazy extends boolean = false,
>(
  opcode: string,
  def: {
    metadata: Omit<FullOpcodeMetadata<Lazy>, "opcode">;
    handler: OpcodeHandler<Args, Ret, Lazy>;
  },
): OpcodeBuilder<Args, Ret, Lazy> {
  return defineOpcode(opcode, def);
}

/** Metadata for a method on an SDK class. */
export interface MethodMetadata {
  name: string;
  description?: string;
  parameters: { name: string; type: string; optional?: boolean }[];
  returnType: string;
}

/** Metadata for a property on an SDK class. */
export interface PropertyMetadata {
  name: string;
  type: string;
  description?: string;
}

/** Metadata for an SDK class for type generation. */
export interface ClassMetadata {
  name: string;
  description?: string;
  methods: MethodMetadata[];
  properties?: PropertyMetadata[];
  indexSignature?: string;
  implements?: string[]; // e.g. "Capability"
}

/** Interface for classes that expose metadata for type generation. */
export interface ExposedSDKClass {
  metadata: ClassMetadata;
}
