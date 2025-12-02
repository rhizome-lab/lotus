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
`;

  const namespaces: Record<string, string[]> = {};

  for (const op of opcodes) {
    const parts = op.opcode.split(".");
    if (parts.length > 1 && parts[0]) {
      const ns = parts[0];
      const name = parts.slice(1).join("_"); // Handle multiple dots? usually just one.

      if (!namespaces[ns]) namespaces[ns] = [];

      const params =
        op.parameters?.map((p) => `${p.name}: ${p.type}`).join(", ") ?? "";
      const ret = op.returnType ?? "any";

      const sanitizedName = RESERVED_TYPESCRIPT_KEYWORDS.has(name)
        ? `${name}_`
        : name;
      namespaces[ns].push(`function ${sanitizedName}(${params}): ${ret};`);
    } else {
      // Global function
      const params =
        op.parameters?.map((p) => `${p.name}: ${p.type}`).join(", ") ?? "";
      const ret = op.returnType ?? "any";
      const sanitizedOpcode = RESERVED_TYPESCRIPT_KEYWORDS.has(op.opcode)
        ? `${op.opcode}_`
        : op.opcode;
      definitions += `declare function ${sanitizedOpcode}(${params}): ${ret};\n`;
    }
  }

  for (const [ns, funcs] of Object.entries(namespaces)) {
    definitions += `
declare namespace ${ns} {
  ${funcs.join("\n  ")}
}
    `;
  }

  return definitions;
}
