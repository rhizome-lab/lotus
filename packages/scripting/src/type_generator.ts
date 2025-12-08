import type { ClassMetadata, OpcodeMetadata } from "./types";

export const RESERVED_TYPESCRIPT_KEYWORDS = new Set([
  "if",
  "else",
  "while",
  "for",
  "return",
  "break",
  "continue",
  "switch",
  "case",
  "default",
  "var",
  "let",
  "const",
  "function",
  "class",
  "new",
  "this",
  "super",
  "return",
  "throw",
  "try",
  "catch",
  "finally",
  "import",
  "export",
  "default",
  "from",
  "as",
  "type",
  "interface",
  "enum",
  "namespace",
  "typeof",
]);

const OPERATOR_MAP: Record<string, string> = {
  "!=": "neq",
  "%": "mod",
  "*": "mul",
  "+": "add",
  "-": "sub",
  "/": "div",
  "<": "lt",
  "<=": "lte",
  "==": "eq",
  ">": "gt",
  ">=": "gte",
  "^": "pow",
};

function generateJSDoc(op: {
  description?: string;
  parameters?: readonly { name: string; description?: string }[];
}): string {
  if (
    !op.description &&
    (!op.parameters || op.parameters.every((parameter) => !parameter.description))
  ) {
    return "";
  }
  let jsdoc = "/**\n";
  if (op.description) {
    jsdoc += ` * ${op.description}\n`;
  }
  if (op.parameters && op.parameters.some((parameter) => parameter.description)) {
    if (op.description) {
      jsdoc += " *\n";
    }
    for (const parameter of op.parameters) {
      if (parameter.description) {
        jsdoc += ` * @param ${parameter.name.replace(/^[.][.][.]/, "")} ${parameter.description}\n`;
      }
    }
  }
  jsdoc += " */\n";
  return jsdoc;
}

function renderNamespaceContent(name: string, content: any, indent: string): string {
  let output = `${indent}namespace ${name} {\n`;
  const innerIndent = `${indent}  `;
  if (content._funcs) {
    for (const func of content._funcs) {
      output += `${(func as string).replaceAll(/^/gm, innerIndent)}\n`;
    }
  }
  for (const key of Object.keys(content)) {
    if (key === "_funcs") {
      continue;
    }
    output += renderNamespaceContent(key, content[key], innerIndent);
  }
  output += `${indent}}\n`;
  return output;
}

function renderNamespace(name: string, content: any, indent: string): string {
  let output = `${indent}namespace ${name} {\n`;
  const innerIndent = `${indent}  `;
  if (content._funcs) {
    for (const func of content._funcs) {
      output += `${(func as string).replaceAll(/^/gm, innerIndent)}\n`;
    }
  }
  for (const key of Object.keys(content)) {
    if (key === "_funcs") {
      continue;
    }
    // Recursive render for sub-namespaces, but we don't need 'declare' inside
    output += renderNamespaceContent(key, content[key], innerIndent);
  }
  output += `${indent}}\n`;
  return output;
}

function renderClass(meta: ClassMetadata): string {
  let output = "";
  if (meta.description) {
    output += `/** ${meta.description} */\n`;
  }
  const implementsClause = meta.implements?.length
    ? ` implements ${meta.implements.join(", ")}`
    : "";
  output += `class ${meta.name}${implementsClause} {\n`;

  // Properties
  if (meta.properties) {
    for (const prop of meta.properties) {
      if (prop.description) {
        output += `  /** ${prop.description} */\n`;
      }
      output += `  ${prop.name}: ${prop.type};\n`;
    }
  }
  // Index Signature
  if (meta.indexSignature) {
    output += `  ${meta.indexSignature};\n`;
  }
  // Methods
  for (const method of meta.methods) {
    if (method.name === "constructor") {
      continue; // skip constructor in declaration for now if not explicit
    }
    output += generateJSDoc(method).replaceAll(/^/gm, "  ");
    const params = method.parameters
      .map((parameter) => {
        const question = parameter.optional ? "?" : "";
        return `${parameter.name}${question}: ${parameter.type}`;
      })
      .join(", ");
    output += `  ${method.name}(${params}): ${method.returnType};\n`;
  }
  output += "}\n";
  return output;
}

export function generateTypeDefinitions(
  opcodes: readonly OpcodeMetadata[],
  classes: readonly ClassMetadata[] = [],
): string {
  let definitions = `\
/** Represents a scriptable action (verb) attached to an entity. */
interface Verb {
  id: number;
  entity_id: number;
  /** The name of the verb (command) */
  name: string;
  /** The compiled S-expression code for the verb */
  code: ScriptValue<unknown>;
}

const RAW_MARKER: unique symbol;
interface ScriptRaw<Type> {
  [RAW_MARKER]: Type;
}

interface Capability {
  readonly __brand: "Capability";
  readonly id: string;
  readonly ownerId: number;
}

type UnionToIntersection<Type> = (Type extends Type ? (type: Type) => 0 : never) extends (
  intersection: infer Intersection,
) => 0
  ? Extract<Intersection, Type>
  : never;

type UnknownUnion =
  | string
  | number
  | boolean
  | null
  | undefined
  | Capability
  | (Record<string, unknown> & { readonly length?: never })
  | (Record<string, unknown> & { readonly slice?: never });

type ScriptValue_<Type> = Exclude<Type, readonly unknown[]>;

/**
 * Represents a value in the scripting language.
 * Can be a primitive, an object, or a nested S-expression (array).
 */
type ScriptValue<Type> =
  | (unknown extends Type
      ? ScriptValue_<UnknownUnion>
      : object extends Type
      ? Extract<ScriptValue_<UnknownUnion>, object>
      : ScriptValue_<Type>)
  | ScriptExpression<any[], Type>;

// Phantom type for return type safety
type ScriptExpression<Args extends (string | ScriptValue_<unknown>)[], Result> = [
  string,
  ...Args,
] & {
  __returnType: Result;
};

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
interface OpcodeMetadata<Lazy extends boolean = boolean, Full extends boolean = false> {
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

interface FullOpcodeMetadata<Lazy extends boolean = boolean>
  extends Omit<OpcodeMetadata<Lazy, true>, "slots" | "description" | "parameters" | "returnType">,
    Required<
      Pick<OpcodeMetadata<Lazy, true>, "slots" | "description" | "parameters" | "returnType">
    > {}

type OpcodeHandler<Args extends readonly unknown[], Ret, Lazy extends boolean = boolean> = (
  args: {
    [Key in keyof Args]: Args[Key] extends ScriptRaw<infer Type>
      ? Type
      : Lazy extends true
      ? ScriptValue<Args[Key]>
      : Args[Key];
  },
  ctx: ScriptContext,
) => Ret | Promise<Ret>;

type IsAny<Type> = 0 extends 1 & Type ? true : false;

interface OpcodeBuilder<
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

interface StackFrame {
  name: string;
  args: unknown[];
}

interface ScriptContext {
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

// Standard library functions
`;

  // Render Classes
  for (const cls of classes) {
    definitions += `${renderClass(cls)}\n`;
  }

  const rootNamespace: Record<string, any> = {};

  for (const op of opcodes) {
    const parts = op.opcode.split(".");
    if (parts.length > 1) {
      let current = rootNamespace;
      for (let idx = 0; idx < parts.length - 1; idx += 1) {
        const part = parts[idx];
        if (!part) {
          continue;
        }
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }
      const name = parts.at(-1);
      current["_funcs"] ??= [];

      const params =
        op.parameters
          ?.map((parameter) => {
            const paramName = RESERVED_TYPESCRIPT_KEYWORDS.has(parameter.name)
              ? `${parameter.name}_`
              : parameter.name;
            const question = parameter.optional ? "?" : "";
            return `${paramName}${question}: ${parameter.type}`;
          })
          .join(", ") ?? "";
      const ret = op.returnType ?? "any";
      const sanitizedName = RESERVED_TYPESCRIPT_KEYWORDS.has(name!) ? `${name}_` : name;
      const generics = op.genericParameters?.length ? `<${op.genericParameters.join(", ")}>` : "";

      const jsdoc = generateJSDoc(op);
      current["_funcs"].push(`${jsdoc}function ${sanitizedName}${generics}(${params}): ${ret};`);
    } else {
      // Global function
      const params =
        op.parameters
          ?.map((parameter) => {
            const paramName = RESERVED_TYPESCRIPT_KEYWORDS.has(parameter.name)
              ? `${parameter.name}_`
              : parameter.name;
            const question = parameter.optional ? "?" : "";
            return `${paramName}${question}: ${parameter.type}`;
          })
          .join(", ") ?? "";
      const ret = op.returnType ?? "any";
      let sanitizedOpcode = op.opcode;
      const mapped = OPERATOR_MAP[sanitizedOpcode];
      if (mapped) {
        sanitizedOpcode = mapped;
      } else if (RESERVED_TYPESCRIPT_KEYWORDS.has(op.opcode)) {
        sanitizedOpcode = `${op.opcode}_`;
      }
      const generics = op.genericParameters?.length ? `<${op.genericParameters.join(", ")}>` : "";
      const jsdoc = generateJSDoc(op);
      definitions += `${jsdoc}function ${sanitizedOpcode}${generics}(${params}): ${ret};\n`;
    }
  }
  for (const key of Object.keys(rootNamespace)) {
    definitions += renderNamespace(key, rootNamespace[key], "");
  }
  return `\
// oxlint-disable max-params, ban-types
declare global {
${definitions.replaceAll(/^(.)/gm, "  $1")}
}

// oxlint-disable-next-line require-module-specifiers
export {};`;
}
