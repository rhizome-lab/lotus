export type BlockType = "container" | "statement" | "expression";

export interface BlockDefinition {
  type: BlockType;
  label: string;
  opcode: string;
  category: "logic" | "action" | "math" | "data";
  layout?: "infix" | "standard" | "primitive"; // New layout property
  slots?: {
    name: string;
    type: "block" | "string" | "number" | "boolean";
    default?: any;
  }[];
}

export const BLOCK_DEFINITIONS: BlockDefinition[] = [
  // Logic
  {
    type: "container",
    label: "If",
    opcode: "if",
    category: "logic",
    slots: [
      { name: "Condition", type: "block" },
      { name: "Then", type: "block" },
      { name: "Else", type: "block" },
    ],
  },
  {
    type: "container",
    label: "Sequence",
    opcode: "seq",
    category: "logic",
    slots: [],
  },
  {
    type: "expression",
    label: "==",
    opcode: "==",
    category: "logic",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
  },
  {
    type: "expression",
    label: "!=",
    opcode: "!=",
    category: "logic",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
  },
  {
    type: "expression",
    label: ">",
    opcode: ">",
    category: "logic",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
  },
  {
    type: "expression",
    label: "<",
    opcode: "<",
    category: "logic",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
  },
  {
    type: "expression",
    label: ">=",
    opcode: ">=",
    category: "logic",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
  },
  {
    type: "expression",
    label: "<=",
    opcode: "<=",
    category: "logic",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
  },
  {
    type: "expression",
    label: "Not",
    opcode: "not",
    category: "logic",
    slots: [{ name: "Val", type: "block" }],
  },
  {
    type: "expression",
    label: "And",
    opcode: "and",
    category: "logic",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
  },
  {
    type: "expression",
    label: "Or",
    opcode: "or",
    category: "logic",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
  },

  // Actions
  {
    type: "statement",
    label: "Set",
    opcode: "set",
    category: "action",
    slots: [
      { name: "Target", type: "block", default: "this" },
      { name: "Key", type: "string" },
      { name: "Value", type: "block" },
    ],
  },
  {
    type: "statement",
    label: "Tell",
    opcode: "tell",
    category: "action",
    slots: [
      { name: "Target", type: "block", default: "caller" },
      { name: "Message", type: "string" },
    ],
  },

  // Math
  {
    type: "expression",
    label: "+",
    opcode: "+",
    category: "math",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
  },
  {
    type: "expression",
    label: "-",
    opcode: "-",
    category: "math",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
  },
  {
    type: "expression",
    label: "*",
    opcode: "*",
    category: "math",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
  },
  {
    type: "expression",
    label: "/",
    opcode: "/",
    category: "math",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
  },
  {
    type: "expression",
    label: "%",
    opcode: "%",
    category: "math",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
  },
  {
    type: "expression",
    label: "^",
    opcode: "^",
    category: "math",
    layout: "infix",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
  },

  // Data
  {
    type: "expression",
    label: ".",
    opcode: "prop",
    category: "data",
    layout: "infix",
    slots: [
      { name: "Target", type: "block" },
      { name: "Key", type: "string" },
    ],
  },
  {
    type: "expression",
    label: "String",
    opcode: "string",
    category: "data",
    layout: "primitive",
    slots: [{ name: "Val", type: "string" }],
  },
  {
    type: "expression",
    label: "Number",
    opcode: "number",
    category: "data",
    layout: "primitive",
    slots: [{ name: "Val", type: "number" }],
  },
  {
    type: "expression",
    label: "Boolean",
    opcode: "boolean",
    category: "data",
    layout: "primitive",
    slots: [{ name: "Val", type: "boolean" }],
  },
];
