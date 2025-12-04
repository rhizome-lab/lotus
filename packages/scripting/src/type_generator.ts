import { OpcodeMetadata } from "./interpreter";

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
  "+": "add",
  "-": "sub",
  "*": "mul",
  "/": "div",
  "%": "mod",
  "^": "pow",
  "==": "eq",
  "!=": "neq",
  ">": "gt",
  "<": "lt",
  ">=": "gte",
  "<=": "lte",
};

export function generateTypeDefinitions(opcodes: OpcodeMetadata[]): string {
  let definitions = `\
export interface Entity {
  /** Unique ID of the entity */
  id: number;
  /**
   * Resolved properties (merged from prototype and instance).
   * Contains arbitrary game data like description, adjectives, custom_css.
   */
  [key: string]: unknown;
};

/**
 * Represents a scriptable action (verb) attached to an entity.
 */
export interface Verb {
  id: number;
  entity_id: number;
  /** The name of the verb (command) */
  name: string;
  /** The compiled S-expression code for the verb */
  code: ScriptValue<unknown>;
  /** Permission settings for the verb */
  permissions: Record<string, unknown>;
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
  | Capability
  | (Record<string, unknown> & { readonly length?: never })
  | (Record<string, unknown> & { readonly slice?: never });

export type ScriptValue_<T> = Exclude<T, readonly unknown[]>;

/**
 * Represents a value in the scripting language.
 * Can be a primitive, an object, or a nested S-expression (array).
 */
export type ScriptValue<T> =
  | (unknown extends T
      ? ScriptValue_<UnknownUnion>
      : object extends T
        ? Extract<ScriptValue_<UnknownUnion>, object>
        : ScriptValue_<T>)
  | ScriptExpression<any[], T>;

// Phantom type for return type safety
export type ScriptExpression<Args extends (string | ScriptValue_<unknown>)[], Ret> = [
  string,
  ...Args,
] & {
  __returnType: Ret;
};

// Standard library functions
`;

  const rootNamespace: Record<string, any> = {};

  for (const op of opcodes) {
    const parts = op.opcode.split(".");
    if (parts.length > 1) {
      let current = rootNamespace;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!part) {
          continue;
        }
        if (!current[part]) current[part] = {};
        current = current[part];
      }
      const name = parts[parts.length - 1];
      current["_funcs"] ??= [];

      const params =
        op.parameters
          ?.map((p) => {
            const paramName = RESERVED_TYPESCRIPT_KEYWORDS.has(p.name) ? `${p.name}_` : p.name;
            const question = p.optional ? "?" : "";
            return `${paramName}${question}: ${p.type}`;
          })
          .join(", ") ?? "";
      const ret = op.returnType ?? "any";
      const sanitizedName = RESERVED_TYPESCRIPT_KEYWORDS.has(name!) ? `${name}_` : name;
      const generics = op.genericParameters?.length ? `<${op.genericParameters.join(", ")}>` : "";

      current["_funcs"].push(`function ${sanitizedName}${generics}(${params}): ${ret};`);
    } else {
      // Global function
      const params =
        op.parameters
          ?.map((p) => {
            const paramName = RESERVED_TYPESCRIPT_KEYWORDS.has(p.name) ? `${p.name}_` : p.name;
            const question = p.optional ? "?" : "";
            return `${paramName}${question}: ${p.type}`;
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
      definitions += `function ${sanitizedOpcode}${generics}(${params}): ${ret};\n`;
    }
  }

  function renderNamespace(name: string, content: any, indent: string): string {
    let output = `${indent}namespace ${name} {\n`;
    const innerIndent = indent + "  ";

    if (content._funcs) {
      for (const func of content._funcs) {
        output += `${innerIndent}${func}\n`;
      }
    }

    for (const key of Object.keys(content)) {
      if (key === "_funcs") continue;
      // Recursive render for sub-namespaces, but we don't need 'declare' inside
      output += renderNamespaceContent(key, content[key], innerIndent);
    }

    output += `${indent}}\n`;
    return output;
  }

  function renderNamespaceContent(name: string, content: any, indent: string): string {
    let output = `${indent}namespace ${name} {\n`;
    const innerIndent = indent + "  ";

    if (content._funcs) {
      for (const func of content._funcs) {
        output += `${innerIndent}${func}\n`;
      }
    }

    for (const key of Object.keys(content)) {
      if (key === "_funcs") continue;
      output += renderNamespaceContent(key, content[key], innerIndent);
    }

    output += `${indent}}\n`;
    return output;
  }

  for (const key of Object.keys(rootNamespace)) {
    definitions += renderNamespace(key, rootNamespace[key], "");
  }

  return `\
declare global {
${definitions.replace(/^/gm, "  ")}
}

export {};`;
}
