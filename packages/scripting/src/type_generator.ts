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
]);

export function generateTypeDefinitions(opcodes: OpcodeMetadata[]): string {
  let definitions = `\
interface Entity {
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
interface Verb {
  id: number;
  entity_id: number;
  /** The name of the verb (command) */
  name: string;
  /** The compiled S-expression code for the verb */
  code: ScriptValue<unknown>;
  /** Permission settings for the verb */
  permissions: Record<string, unknown>;
}

// Standard library functions
interface Capability {
  readonly __brand: "Capability";
  readonly id: string;
}
`;

  const rootNamespace: Record<string, any> = {};

  for (const op of opcodes) {
    const parts = op.opcode.split(".");
    if (parts.length > 1) {
      let current = rootNamespace;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!current[part]) current[part] = {};
        current = current[part];
      }
      const name = parts[parts.length - 1];
      if (!current._funcs) current._funcs = [];

      const params =
        op.parameters?.map((p) => `${p.name}: ${p.type}`).join(", ") ?? "";
      const ret = op.returnType ?? "any";
      const sanitizedName = RESERVED_TYPESCRIPT_KEYWORDS.has(name)
        ? `${name}_`
        : name;
      const generics = op.genericParameters?.length
        ? `<${op.genericParameters.join(", ")}>`
        : "";

      current._funcs.push(
        `function ${sanitizedName}${generics}(${params}): ${ret};`,
      );
    } else {
      // Global function
      const params =
        op.parameters?.map((p) => `${p.name}: ${p.type}`).join(", ") ?? "";
      const ret = op.returnType ?? "any";
      const sanitizedOpcode = RESERVED_TYPESCRIPT_KEYWORDS.has(op.opcode)
        ? `${op.opcode}_`
        : op.opcode;
      const generics = op.genericParameters?.length
        ? `<${op.genericParameters.join(", ")}>`
        : "";
      definitions += `declare function ${sanitizedOpcode}${generics}(${params}): ${ret};\n`;
    }
  }

  function renderNamespace(name: string, content: any, indent: string): string {
    let output = `${indent}declare namespace ${name} {\n`;
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

  function renderNamespaceContent(
    name: string,
    content: any,
    indent: string,
  ): string {
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

  return definitions;
}
