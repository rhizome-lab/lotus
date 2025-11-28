export type BlockType = "container" | "statement" | "expression";

export interface BlockDefinition {
  type: BlockType;
  label: string;
  opcode: string;
  category:
    | "logic"
    | "action"
    | "math"
    | "data"
    | "time"
    | "world"
    | "list"
    | "object"
    | "func";
  layout?: "infix" | "standard" | "primitive" | "control-flow"; // New layout property
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
    layout: "control-flow",
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
      { name: "Target", type: "block", default: "me" },
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
  {
    type: "container",
    label: "For Loop",
    opcode: "for",
    category: "logic",
    layout: "control-flow",
    slots: [
      { name: "Var", type: "string" },
      { name: "List", type: "block" },
      { name: "Do", type: "block" },
    ],
  },
  {
    type: "statement",
    label: "Let",
    opcode: "let",
    category: "logic",
    slots: [
      { name: "Name", type: "string" },
      { name: "Value", type: "block" },
    ],
  },
  {
    type: "expression",
    label: "Get Var",
    opcode: "var",
    category: "data",
    layout: "primitive",
    slots: [{ name: "Name", type: "string" }],
  },

  // New Opcodes
  {
    type: "statement",
    label: "Destroy",
    opcode: "destroy",
    category: "action",
    slots: [{ name: "Target", type: "block", default: "this" }],
  },
  {
    type: "statement",
    label: "Move",
    opcode: "move",
    category: "action",
    slots: [
      { name: "Target", type: "block", default: "this" },
      { name: "Destination", type: "block" },
    ],
  },
  {
    type: "statement",
    label: "Give",
    opcode: "give",
    category: "action",
    slots: [
      { name: "Item", type: "block" },
      { name: "Receiver", type: "block" },
    ],
  },
  {
    type: "expression",
    label: "Create",
    opcode: "create",
    category: "action",
    slots: [{ name: "Data", type: "block" }],
  },
  {
    type: "statement",
    label: "Schedule",
    opcode: "schedule",
    category: "action",
    slots: [
      { name: "Verb", type: "string" },
      { name: "Args", type: "block" },
      { name: "Delay", type: "number" },
    ],
  },
  {
    type: "statement",
    label: "Broadcast",
    opcode: "broadcast",
    category: "action",
    slots: [
      { name: "Message", type: "block" },
      { name: "Location", type: "block", default: null },
    ],
  },
  {
    type: "expression",
    label: "Random",
    opcode: "random",
    category: "math",
    slots: [],
  },
  {
    type: "expression",
    label: "Floor",
    opcode: "floor",
    category: "math",
    slots: [{ name: "Val", type: "block" }],
  },

  // Time
  {
    type: "expression",
    label: "Now",
    opcode: "time.now",
    category: "time",
    slots: [],
  },
  {
    type: "expression",
    label: "Format Time",
    opcode: "time.format",
    category: "time",
    slots: [
      { name: "Time", type: "block" },
      { name: "Format", type: "string" },
    ],
  },
  {
    type: "expression",
    label: "Offset Time",
    opcode: "time.offset",
    category: "time",
    slots: [
      { name: "Time", type: "block" },
      { name: "Amount", type: "number" },
      { name: "Unit", type: "string" },
    ],
  },

  // World
  {
    type: "expression",
    label: "All Entities",
    opcode: "world.entities",
    category: "world",
    slots: [],
  },
  {
    type: "expression",
    label: "Contents",
    opcode: "entity.contents",
    category: "world",
    slots: [{ name: "Target", type: "block" }],
  },
  {
    type: "expression",
    label: "Descendants",
    opcode: "entity.descendants",
    category: "world",
    slots: [{ name: "Target", type: "block" }],
  },
  {
    type: "expression",
    label: "Ancestors",
    opcode: "entity.ancestors",
    category: "world",
    slots: [{ name: "Target", type: "block" }],
  },

  // List
  {
    type: "expression",
    label: "List Len",
    opcode: "list.len",
    category: "list",
    slots: [{ name: "List", type: "block" }],
  },
  {
    type: "expression",
    label: "List Get",
    opcode: "list.get",
    category: "list",
    slots: [
      { name: "List", type: "block" },
      { name: "Index", type: "number" },
    ],
  },
  {
    type: "statement",
    label: "List Set",
    opcode: "list.set",
    category: "list",
    slots: [
      { name: "List", type: "block" },
      { name: "Index", type: "number" },
      { name: "Value", type: "block" },
    ],
  },
  {
    type: "statement",
    label: "List Push",
    opcode: "list.push",
    category: "list",
    slots: [
      { name: "List", type: "block" },
      { name: "Value", type: "block" },
    ],
  },
  {
    type: "statement",
    label: "List Pop",
    opcode: "list.pop",
    category: "list",
    slots: [{ name: "List", type: "block" }],
  },
  {
    type: "expression",
    label: "List Map",
    opcode: "list.map",
    category: "list",
    slots: [
      { name: "List", type: "block" },
      { name: "Func", type: "block" },
    ],
  },
  {
    type: "expression",
    label: "List Filter",
    opcode: "list.filter",
    category: "list",
    slots: [
      { name: "List", type: "block" },
      { name: "Func", type: "block" },
    ],
  },
  {
    type: "expression",
    label: "List Reduce",
    opcode: "list.reduce",
    category: "list",
    slots: [
      { name: "List", type: "block" },
      { name: "Func", type: "block" },
      { name: "Init", type: "block" },
    ],
  },
  {
    type: "expression",
    label: "List FlatMap",
    opcode: "list.flatMap",
    category: "list",
    slots: [
      { name: "List", type: "block" },
      { name: "Func", type: "block" },
    ],
  },

  // Object
  {
    type: "expression",
    label: "Obj Keys",
    opcode: "obj.keys",
    category: "object",
    slots: [{ name: "Obj", type: "block" }],
  },
  {
    type: "expression",
    label: "Obj Values",
    opcode: "obj.values",
    category: "object",
    slots: [{ name: "Obj", type: "block" }],
  },
  {
    type: "expression",
    label: "Obj Entries",
    opcode: "obj.entries",
    category: "object",
    slots: [{ name: "Obj", type: "block" }],
  },
  {
    type: "expression",
    label: "Obj Get",
    opcode: "obj.get",
    category: "object",
    slots: [
      { name: "Obj", type: "block" },
      { name: "Key", type: "string" },
    ],
  },
  {
    type: "statement",
    label: "Obj Set",
    opcode: "obj.set",
    category: "object",
    slots: [
      { name: "Obj", type: "block" },
      { name: "Key", type: "string" },
      { name: "Value", type: "block" },
    ],
  },
  {
    type: "expression",
    label: "Obj Has",
    opcode: "obj.has",
    category: "object",
    slots: [
      { name: "Obj", type: "block" },
      { name: "Key", type: "string" },
    ],
  },
  {
    type: "statement",
    label: "Obj Del",
    opcode: "obj.del",
    category: "object",
    slots: [
      { name: "Obj", type: "block" },
      { name: "Key", type: "string" },
    ],
  },
  {
    type: "expression",
    label: "Obj Merge",
    opcode: "obj.merge",
    category: "object",
    slots: [
      { name: "A", type: "block" },
      { name: "B", type: "block" },
    ],
  },
  {
    type: "expression",
    label: "Obj Map",
    opcode: "obj.map",
    category: "object",
    slots: [
      { name: "Obj", type: "block" },
      { name: "Func", type: "block" },
    ],
  },
  {
    type: "expression",
    label: "Obj Filter",
    opcode: "obj.filter",
    category: "object",
    slots: [
      { name: "Obj", type: "block" },
      { name: "Func", type: "block" },
    ],
  },
  {
    type: "expression",
    label: "Obj Reduce",
    opcode: "obj.reduce",
    category: "object",
    slots: [
      { name: "Obj", type: "block" },
      { name: "Func", type: "block" },
      { name: "Init", type: "block" },
    ],
  },
  {
    type: "expression",
    label: "Obj FlatMap",
    opcode: "obj.flatMap",
    category: "object",
    slots: [
      { name: "Obj", type: "block" },
      { name: "Func", type: "block" },
    ],
  },

  // Functions
  {
    type: "expression",
    label: "Lambda",
    opcode: "lambda",
    category: "func",
    slots: [
      { name: "Args", type: "block" }, // Should be list of strings
      { name: "Body", type: "block" },
    ],
  },
  {
    type: "expression",
    label: "Apply",
    opcode: "apply",
    category: "func",
    slots: [
      { name: "Func", type: "block" },
      { name: "Args...", type: "block" }, // This is variadic, might need special handling in UI
    ],
  },
];
