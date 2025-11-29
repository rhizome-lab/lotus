import {
  evaluate,
  executeLambda,
  ScriptError,
  OpcodeDefinition,
} from "../interpreter";

export const ListLibrary: Record<string, OpcodeDefinition> = {
  "list.new": {
    metadata: {
      label: "List",
      category: "list",
      description: "Create a list",
      // TODO: List of slots
      slots: [],
    },
    handler: async (args, ctx) => {
      const result = [];
      for (const arg of args) {
        result.push(await evaluate(arg, ctx));
      }
      return result;
    },
  },
  "list.len": {
    metadata: {
      label: "List Length",
      category: "list",
      description: "Get list length",
      slots: [{ name: "List", type: "block" }],
    },
    handler: async (args, ctx) => {
      const list = await evaluate(args[0], ctx);
      if (!Array.isArray(list)) return 0;
      return list.length;
    },
  },

  "list.empty": {
    metadata: {
      label: "Is Empty",
      category: "list",
      description: "Check if list is empty",
      slots: [{ name: "List", type: "block" }],
    },
    handler: async (args, ctx) => {
      const list = await evaluate(args[0], ctx);
      if (!Array.isArray(list)) return true;
      return list.length === 0;
    },
  },

  "list.get": {
    metadata: {
      label: "Get Item",
      category: "list",
      description: "Get item at index",
      slots: [
        { name: "List", type: "block" },
        { name: "Index", type: "number" },
      ],
    },
    handler: async (args, ctx) => {
      const list = await evaluate(args[0], ctx);
      const index = await evaluate(args[1], ctx);
      if (!Array.isArray(list)) return null;
      return list[index];
    },
  },

  "list.set": {
    metadata: {
      label: "Set Item",
      category: "list",
      description: "Set item at index",
      slots: [
        { name: "List", type: "block" },
        { name: "Index", type: "number" },
        { name: "Value", type: "block" },
      ],
    },
    handler: async (args, ctx) => {
      const list = await evaluate(args[0], ctx);
      const index = await evaluate(args[1], ctx);
      const val = await evaluate(args[2], ctx);
      if (!Array.isArray(list)) return null;
      list[index] = val;
      return val;
    },
  },

  "list.push": {
    metadata: {
      label: "Push",
      category: "list",
      description: "Add item to end",
      slots: [
        { name: "List", type: "block" },
        { name: "Value", type: "block" },
      ],
    },
    handler: async (args, ctx) => {
      const list = await evaluate(args[0], ctx);
      const val = await evaluate(args[1], ctx);
      if (!Array.isArray(list)) return null;
      list.push(val);
      return list.length;
    },
  },

  "list.pop": {
    metadata: {
      label: "Pop",
      category: "list",
      description: "Remove item from end",
      slots: [{ name: "List", type: "block" }],
    },
    handler: async (args, ctx) => {
      if (args.length !== 1) {
        throw new ScriptError("list.pop: expected 1 argument");
      }
      const [listExpr] = args;
      const list = await evaluate(listExpr, ctx);
      if (!Array.isArray(list)) return null;
      return list.pop();
    },
  },

  "list.unshift": {
    metadata: {
      label: "Unshift",
      category: "list",
      description: "Add item to start",
      slots: [
        { name: "List", type: "block" },
        { name: "Value", type: "block" },
      ],
    },
    handler: async (args, ctx) => {
      const list = await evaluate(args[0], ctx);
      const val = await evaluate(args[1], ctx);
      if (!Array.isArray(list)) return null;
      list.unshift(val);
      return list.length;
    },
  },

  "list.shift": {
    metadata: {
      label: "Shift",
      category: "list",
      description: "Remove item from start",
      slots: [{ name: "List", type: "block" }],
    },
    handler: async (args, ctx) => {
      const list = await evaluate(args[0], ctx);
      if (!Array.isArray(list)) return null;
      return list.shift();
    },
  },

  "list.slice": {
    metadata: {
      label: "Slice List",
      category: "list",
      description: "Extract part of list",
      slots: [
        { name: "List", type: "block" },
        { name: "Start", type: "number" },
        { name: "End", type: "number", default: null },
      ],
    },
    handler: async (args, ctx) => {
      if (args.length < 2 || args.length > 3) {
        throw new ScriptError("list.slice: expected 2 or 3 arguments");
      }
      const [listExpr, startExpr, endExpr] = args;
      const list = await evaluate(listExpr, ctx);
      const start = await evaluate(startExpr, ctx);
      const end = endExpr ? await evaluate(endExpr, ctx) : undefined;
      if (!Array.isArray(list) || typeof start !== "number") return [];
      return list.slice(start, end);
    },
  },

  "list.splice": {
    metadata: {
      label: "Splice List",
      category: "list",
      description: "Remove/Replace items",
      slots: [
        { name: "List", type: "block" },
        { name: "Start", type: "number" },
        { name: "Delete Count", type: "number" },
        { name: "Items", type: "block" }, // Variadic
      ],
    },
    handler: async (args, ctx) => {
      const list = await evaluate(args[0], ctx);
      const start = await evaluate(args[1], ctx);
      const deleteCount = await evaluate(args[2], ctx);
      // Remaining args are items to insert
      const items = [];
      for (let i = 3; i < args.length; i++) {
        items.push(await evaluate(args[i], ctx));
      }
      if (!Array.isArray(list)) return [];
      return list.splice(start, deleteCount, ...items);
    },
  },

  "list.concat": {
    metadata: {
      label: "Concat Lists",
      category: "list",
      description: "Concatenate lists",
      slots: [
        { name: "List 1", type: "block" },
        { name: "List 2", type: "block" },
      ],
    },
    handler: async (args, ctx) => {
      if (args.length !== 2) {
        throw new ScriptError("list.concat: expected 2 arguments");
      }
      const [list1Expr, list2Expr] = args;
      const list1 = await evaluate(list1Expr, ctx);
      const list2 = await evaluate(list2Expr, ctx);
      if (!Array.isArray(list1) || !Array.isArray(list2)) return [];
      return list1.concat(list2);
    },
  },

  "list.includes": {
    metadata: {
      label: "List Includes",
      category: "list",
      description: "Check if list includes item",
      slots: [
        { name: "List", type: "block" },
        { name: "Value", type: "block" },
      ],
    },
    handler: async (args, ctx) => {
      const list = await evaluate(args[0], ctx);
      const val = await evaluate(args[1], ctx);
      if (!Array.isArray(list)) return false;
      return list.includes(val);
    },
  },

  "list.reverse": {
    metadata: {
      label: "Reverse List",
      category: "list",
      description: "Reverse list order",
      slots: [{ name: "List", type: "block" }],
    },
    handler: async (args, ctx) => {
      const list = await evaluate(args[0], ctx);
      if (!Array.isArray(list)) return list;
      return list.reverse();
    },
  },

  "list.sort": {
    metadata: {
      label: "Sort List",
      category: "list",
      description: "Sort list",
      slots: [{ name: "List", type: "block" }],
    },
    handler: async (args, ctx) => {
      const list = await evaluate(args[0], ctx);
      if (!Array.isArray(list)) return list;
      return list.sort();
    },
  },

  "list.join": {
    metadata: {
      label: "Join List",
      category: "list",
      description: "Join list to string",
      slots: [
        { name: "List", type: "block" },
        { name: "Separator", type: "string" },
      ],
    },
    handler: async (args, ctx) => {
      if (args.length !== 2) {
        throw new ScriptError("list.join: expected 2 arguments");
      }
      const [listExpr, sepExpr] = args;
      const list = await evaluate(listExpr, ctx);
      const sep = await evaluate(sepExpr, ctx);
      if (!Array.isArray(list) || typeof sep !== "string") return "";
      return list.join(sep);
    },
  },

  "list.find": {
    metadata: {
      label: "Find Item",
      category: "list",
      description: "Find item in list",
      slots: [
        { name: "List", type: "block" },
        { name: "Lambda", type: "block" },
      ],
    },
    handler: async (args, ctx) => {
      if (args.length !== 2) {
        throw new ScriptError("list.find: expected 2 arguments");
      }
      const [listExpr, funcExpr] = args;
      const list = await evaluate(listExpr, ctx);
      const func = await evaluate(funcExpr, ctx);

      if (!Array.isArray(list) || !func || func.type !== "lambda") return null;

      for (const item of list) {
        if (await executeLambda(func, [item], ctx)) {
          return item;
        }
      }
      return null;
    },
  },

  "list.map": {
    metadata: {
      label: "Map List",
      category: "list",
      description: "Map list items",
      slots: [
        { name: "List", type: "block" },
        { name: "Lambda", type: "block" },
      ],
    },
    handler: async (args, ctx) => {
      if (args.length !== 2) {
        throw new ScriptError("list.map: expected 2 arguments");
      }
      const [listExpr, funcExpr] = args;
      const list = await evaluate(listExpr, ctx);
      const func = await evaluate(funcExpr, ctx);

      if (!Array.isArray(list) || !func || func.type !== "lambda") return [];

      const result: unknown[] = [];
      for (const item of list) {
        result.push(await executeLambda(func, [item], ctx));
      }
      return result;
    },
  },

  "list.filter": {
    metadata: {
      label: "Filter List",
      category: "list",
      description: "Filter list items",
      slots: [
        { name: "List", type: "block" },
        { name: "Lambda", type: "block" },
      ],
    },
    handler: async (args, ctx) => {
      if (args.length !== 2) {
        throw new ScriptError("list.filter: expected 2 arguments");
      }
      const [listExpr, funcExpr] = args;
      const list = await evaluate(listExpr, ctx);
      const func = await evaluate(funcExpr, ctx);

      if (!Array.isArray(list) || !func || func.type !== "lambda") return [];

      const result: unknown[] = [];
      for (const item of list) {
        if (await executeLambda(func, [item], ctx)) {
          result.push(item);
        }
      }
      return result;
    },
  },

  "list.reduce": {
    metadata: {
      label: "Reduce List",
      category: "list",
      description: "Reduce list items",
      slots: [
        { name: "List", type: "block" },
        { name: "Lambda", type: "block" },
        { name: "Init", type: "block" },
      ],
    },
    handler: async (args, ctx) => {
      if (args.length !== 3) {
        throw new ScriptError("list.reduce: expected 3 arguments");
      }
      const [listExpr, funcExpr, initExpr] = args;
      const list = await evaluate(listExpr, ctx);
      const func = await evaluate(funcExpr, ctx);
      let acc = await evaluate(initExpr, ctx);

      if (!Array.isArray(list) || !func || func.type !== "lambda") return acc;

      for (const item of list) {
        acc = await executeLambda(func, [acc, item], ctx);
      }
      return acc;
    },
  },

  "list.flatMap": {
    metadata: {
      label: "FlatMap List",
      category: "list",
      description: "FlatMap list items",
      slots: [
        { name: "List", type: "block" },
        { name: "Lambda", type: "block" },
      ],
    },
    handler: async (args, ctx) => {
      const list = await evaluate(args[0], ctx);
      const func = await evaluate(args[1], ctx);
      if (!Array.isArray(list)) return [];

      const result: unknown[] = [];
      for (const item of list) {
        const mapped = await executeLambda(func, [item], ctx);
        if (Array.isArray(mapped)) {
          result.push(...mapped);
        } else {
          result.push(mapped);
        }
      }
      return result;
    },
  },
};
