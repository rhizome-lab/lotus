export interface OpcodeMetadata {
  opcode: string;
  label: string;
  category: string;
  description?: string;
  parameters?: { name: string; type: string }[];
  returnType?: string;
}

export function generateTypeDefinitions(opcodes: OpcodeMetadata[]): string {
  let definitions = `\
declare const me: Entity;
declare const this: Entity;
declare const here: Entity | null;

interface Entity {
  id: number;
  name: string;
  kind: string;
  location_id?: number;
  owner_id?: number;
  props: Record<string, any>;
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
        op.parameters?.map((p) => `${p.name}: ${p.type}`).join(", ") || "";
      const ret = op.returnType || "any";

      namespaces[ns].push(`function ${name}(${params}): ${ret};`);
    } else {
      // Global function
      const params =
        op.parameters?.map((p) => `${p.name}: ${p.type}`).join(", ") || "";
      const ret = op.returnType || "any";
      definitions += `declare function ${op.opcode}(${params}): ${ret};\n`;
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
