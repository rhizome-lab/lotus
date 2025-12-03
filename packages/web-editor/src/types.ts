export type BlockType = "container" | "statement" | "expression";

export interface BlockDefinition {
  type: BlockType;
  label: string;
  opcode: string;
  category: "logic" | "action" | "math" | "data" | "time" | "world" | "list" | "object" | "func";
  layout?: "infix" | "standard" | "primitive" | "control-flow"; // New layout property
  slots?: {
    name: string;
    type: "block" | "string" | "number" | "boolean";
    default?: any;
  }[];
}
