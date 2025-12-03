import {
  executeLambda,
  ScriptError,
} from "../interpreter";
import { defineOpcode, ScriptValue } from "../def";

/**
 * Creates a new list.
 */
const listNew = defineOpcode<[...ScriptValue<unknown>[]], any[]>(
  "list.new",
  {
    metadata: {
      label: "List",
      category: "list",
      description: "Create a list",
      slots: [],
      genericParameters: ["T"],
      parameters: [{ name: "...args", type: "T[]" }],
      returnType: "T[]",
    },
    handler: (args, _ctx) => {
      // args are already evaluated
      return [...args];
    },
  }
);
export { listNew as "list.new" };

/**
 * Returns the length of a list.
 */
const listLen = defineOpcode<[ScriptValue<readonly unknown[]>], number>(
  "list.len",
  {
    metadata: {
      label: "List Length",
      category: "list",
      description: "Get list length",
      slots: [{ name: "List", type: "block" }],
      parameters: [{ name: "List", type: "unknown[]" }],
      returnType: "number",
    },
    handler: (args, _ctx) => {
      const list = args[0];
      if (!Array.isArray(list)) return 0;
      return list.length;
    },
  }
);
export { listLen as "list.len" };

/**
 * Checks if a list is empty.
 */
const listEmpty = defineOpcode<[ScriptValue<readonly unknown[]>], boolean>(
  "list.empty",
  {
    metadata: {
      label: "Is Empty",
      category: "list",
      description: "Check if list is empty",
      slots: [{ name: "List", type: "block" }],
      parameters: [{ name: "List", type: "unknown[]" }],
      returnType: "boolean",
    },
    handler: (args, _ctx) => {
      const list = args[0];
      if (!Array.isArray(list)) return true;
      return list.length === 0;
    },
  }
);
export { listEmpty as "list.empty" };

/**
 * Retrieves an item from a list at a specific index.
 */
const listGet = defineOpcode<[ScriptValue<readonly unknown[]>, ScriptValue<number>], any>(
  "list.get",
  {
    metadata: {
      label: "Get Item",
      category: "list",
      description: "Get item at index",
      slots: [
        { name: "List", type: "block" },
        { name: "Index", type: "number" },
      ],
      parameters: [
        { name: "List", type: "unknown[]" },
        { name: "Index", type: "number" },
      ],
      returnType: "any",
    },
    handler: (args, _ctx) => {
      const list = args[0];
      const index = args[1] as number;
      if (!Array.isArray(list)) return null;
      return list[index];
    },
  }
);
export { listGet as "list.get" };

/**
 * Sets an item in a list at a specific index.
 */
const listSet = defineOpcode<[ScriptValue<readonly unknown[]>, ScriptValue<number>, ScriptValue<unknown>], any>(
  "list.set",
  {
    metadata: {
      label: "Set Item",
      category: "list",
      description: "Set item at index",
      slots: [
        { name: "List", type: "block" },
        { name: "Index", type: "number" },
        { name: "Value", type: "block" },
      ],
      parameters: [
        { name: "List", type: "unknown[]" },
        { name: "Index", type: "number" },
        { name: "Value", type: "unknown" },
      ],
      returnType: "any",
    },
    handler: (args, _ctx) => {
      const list = args[0];
      const index = args[1] as number;
      const val = args[2];
      if (!Array.isArray(list)) return null;
      list[index] = val;
      return val;
    },
  }
);
export { listSet as "list.set" };

/**
 * Adds an item to the end of a list.
 */
const listPush = defineOpcode<[ScriptValue<readonly unknown[]>, ScriptValue<unknown>], number>(
  "list.push",
  {
    metadata: {
      label: "Push",
      category: "list",
      description: "Add item to end",
      slots: [
        { name: "List", type: "block" },
        { name: "Value", type: "block" },
      ],
      parameters: [
        { name: "List", type: "unknown[]" },
        { name: "Value", type: "unknown" },
      ],
      returnType: "number",
    },
    handler: (args, _ctx) => {
      const list = args[0];
      if (!Array.isArray(list)) {
        throw new ScriptError("list.push: expected list");
      }
      const val = args[1];
      list.push(val);
      return list.length;
    },
  }
);
export { listPush as "list.push" };

/**
 * Removes and returns the last item of a list.
 */
const listPop = defineOpcode<[ScriptValue<readonly unknown[]>], any>(
  "list.pop",
  {
    metadata: {
      label: "Pop",
      category: "list",
      description: "Remove item from end",
      slots: [{ name: "List", type: "block" }],
      parameters: [{ name: "List", type: "unknown[]" }],
      returnType: "any",
    },
    handler: (args, _ctx) => {
      if (args.length !== 1) {
        throw new ScriptError("list.pop: expected 1 argument");
      }
      const list = args[0];
      if (!Array.isArray(list)) {
        throw new ScriptError("list.pop: expected list");
      }
      return list.pop();
    },
  }
);
export { listPop as "list.pop" };

/**
 * Adds an item to the beginning of a list.
 */
const listUnshift = defineOpcode<[ScriptValue<readonly unknown[]>, ScriptValue<unknown>], number>(
  "list.unshift",
  {
    metadata: {
      label: "Unshift",
      category: "list",
      description: "Add item to start",
      slots: [
        { name: "List", type: "block" },
        { name: "Value", type: "block" },
      ],
      parameters: [
        { name: "List", type: "unknown[]" },
        { name: "Value", type: "unknown" },
      ],
      returnType: "number",
    },
    handler: (args, _ctx) => {
      const list = args[0];
      if (!Array.isArray(list)) {
        throw new ScriptError("list.unshift: expected list");
      }
      const val = args[1];
      list.unshift(val);
      return list.length;
    },
  }
);
export { listUnshift as "list.unshift" };

/**
 * Removes and returns the first item of a list.
 */
const listShift = defineOpcode<[ScriptValue<readonly unknown[]>], any>(
  "list.shift",
  {
    metadata: {
      label: "Shift",
      category: "list",
      description: "Remove item from start",
      slots: [{ name: "List", type: "block" }],
      parameters: [{ name: "List", type: "unknown[]" }],
      returnType: "any",
    },
    handler: (args, _ctx) => {
      const list = args[0];
      if (!Array.isArray(list)) {
        throw new ScriptError("list.shift: expected list");
      }
      return list.shift();
    },
  }
);
export { listShift as "list.shift" };

/**
 * Returns a shallow copy of a portion of a list.
 */
const listSlice = defineOpcode<[ScriptValue<readonly unknown[]>, ScriptValue<number>, ScriptValue<number>?], any[]>(
  "list.slice",
  {
    metadata: {
      label: "Slice List",
      category: "list",
      description: "Extract part of list",
      slots: [
        { name: "List", type: "block" },
        { name: "Start", type: "number" },
        { name: "End", type: "number", default: null },
      ],
      parameters: [
        { name: "List", type: "unknown[]" },
        { name: "Start", type: "number" },
        { name: "End", type: "number" },
      ],
      returnType: "any[]",
    },
    handler: (args, _ctx) => {
      if (args.length < 2 || args.length > 3) {
        throw new ScriptError("list.slice: expected 2 or 3 arguments");
      }
      const list = args[0];
      if (!Array.isArray(list)) {
        throw new ScriptError("list.slice: expected list");
      }
      const start = args[1];
      if (typeof start !== "number") {
        throw new ScriptError("list.slice: expected number");
      }
      const end = args.length === 3 ? args[2] : undefined;
      return list.slice(start, end);
    },
  }
);
export { listSlice as "list.slice" };

/**
 * Changes the contents of a list by removing or replacing existing elements and/or adding new elements.
 */
const listSplice = defineOpcode<[ScriptValue<readonly unknown[]>, ScriptValue<number>, ScriptValue<number>, ...ScriptValue<unknown>[]], any[]>(
  "list.splice",
  {
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
      parameters: [
        { name: "List", type: "unknown[]" },
        { name: "Start", type: "number" },
        { name: "Delete Count", type: "number" },
        { name: "...args", type: "unknown[]" },
      ],
      returnType: "any[]",
    },
    handler: (args, _ctx) => {
      const list = args[0];
      if (!Array.isArray(list)) {
        throw new ScriptError("list.splice: expected list");
      }
      const start = args[1];
      if (typeof start !== "number") {
        throw new ScriptError("list.splice: expected number");
      }
      const deleteCount = args[2];
      if (typeof deleteCount !== "number") {
        throw new ScriptError("list.splice: expected number");
      }
      // Remaining args are items to insert
      const items = args.slice(3);
      return list.splice(start, deleteCount, ...items);
    },
  }
);
export { listSplice as "list.splice" };

/**
 * Merges two or more lists.
 */
const listConcat = defineOpcode<[ScriptValue<readonly unknown[]>, ScriptValue<readonly unknown[]>], any[]>(
  "list.concat",
  {
    metadata: {
      label: "Concat Lists",
      category: "list",
      description: "Concatenate lists",
      slots: [
        { name: "List 1", type: "block" },
        { name: "List 2", type: "block" },
      ],
      parameters: [
        { name: "List 1", type: "unknown[]" },
        { name: "List 2", type: "unknown[]" },
      ],
      returnType: "any[]",
    },
    handler: (args, _ctx) => {
      if (args.length !== 2) {
        throw new ScriptError("list.concat: expected 2 arguments");
      }
      const list1 = args[0];
      const list2 = args[1];
      if (!Array.isArray(list1) || !Array.isArray(list2)) {
        throw new ScriptError("list.concat: expected list");
      }
      return list1.concat(list2);
    },
  }
);
export { listConcat as "list.concat" };

/**
 * Determines whether a list includes a certain value.
 */
const listIncludes = defineOpcode<[ScriptValue<readonly unknown[]>, ScriptValue<unknown>], boolean>(
  "list.includes",
  {
    metadata: {
      label: "List Includes",
      category: "list",
      description: "Check if list includes item",
      slots: [
        { name: "List", type: "block" },
        { name: "Value", type: "block" },
      ],
      parameters: [
        { name: "List", type: "unknown[]" },
        { name: "Value", type: "unknown" },
      ],
      returnType: "boolean",
    },
    handler: (args, _ctx) => {
      const list = args[0];
      const val = args[1];
      if (!Array.isArray(list)) {
        throw new ScriptError("list.includes: expected list");
      }
      return list.includes(val);
    },
  }
);
export { listIncludes as "list.includes" };

/**
 * Reverses a list in place.
 */
const listReverse = defineOpcode<[ScriptValue<readonly unknown[]>], any[]>(
  "list.reverse",
  {
    metadata: {
      label: "Reverse List",
      category: "list",
      description: "Reverse list order",
      slots: [{ name: "List", type: "block" }],
      parameters: [{ name: "List", type: "unknown[]" }],
      returnType: "any[]",
    },
    handler: (args, _ctx) => {
      const list = args[0];
      if (!Array.isArray(list)) {
        throw new ScriptError("list.reverse: expected list");
      }
      return list.reverse();
    },
  }
);
export { listReverse as "list.reverse" };

/**
 * Sorts the elements of a list in place.
 */
const listSort = defineOpcode<[ScriptValue<readonly unknown[]>], any[]>(
  "list.sort",
  {
    metadata: {
      label: "Sort List",
      category: "list",
      description: "Sort list",
      slots: [{ name: "List", type: "block" }],
      parameters: [{ name: "List", type: "unknown[]" }],
      returnType: "any[]",
    },
    handler: (args, _ctx) => {
      const list = args[0];
      if (!Array.isArray(list)) {
        throw new ScriptError("list.sort: expected list");
      }
      return list.sort();
    },
  }
);
export { listSort as "list.sort" };

/**
 * Returns the first element in the provided list that satisfies the provided testing function.
 */
const listFind = defineOpcode<[ScriptValue<readonly unknown[]>, ScriptValue<unknown>], any>(
  "list.find",
  {
    metadata: {
      label: "Find Item",
      category: "list",
      description: "Find item in list",
      slots: [
        { name: "List", type: "block" },
        { name: "Lambda", type: "block" },
      ],
      parameters: [
        { name: "List", type: "unknown[]" },
        { name: "Lambda", type: "unknown" },
      ],
      returnType: "any",
    },
    handler: async (args, ctx) => {
      if (args.length !== 2) {
        throw new ScriptError("list.find: expected 2 arguments");
      }
      const list = args[0];
      if (!Array.isArray(list)) {
        throw new ScriptError("list.find: expected list");
      }
      const func = args[1] as any;
      if (!func || func.type !== "lambda") {
        throw new ScriptError("list.find: expected lambda");
      }
      for (const item of list) {
        const res = executeLambda(func, [item], ctx);
        if (res instanceof Promise ? await res : res) {
          return item;
        }
      }
      return null;
    },
  }
);
export { listFind as "list.find" };

/**
 * Creates a new list populated with the results of calling a provided function on every element in the calling list.
 */
const listMap = defineOpcode<[ScriptValue<readonly unknown[]>, ScriptValue<unknown>], any[]>(
  "list.map",
  {
    metadata: {
      label: "Map List",
      category: "list",
      description: "Map list items",
      slots: [
        { name: "List", type: "block" },
        { name: "Lambda", type: "block" },
      ],
      parameters: [
        { name: "List", type: "unknown[]" },
        { name: "Lambda", type: "unknown" },
      ],
      returnType: "any[]",
    },
    handler: async (args, ctx) => {
      if (args.length !== 2) {
        throw new ScriptError("list.map: expected 2 arguments");
      }
      const list = args[0];
      if (!Array.isArray(list)) {
        throw new ScriptError("list.map: expected list");
      }
      const func = args[1] as any;
      if (!func || func.type !== "lambda") {
        throw new ScriptError("list.map: expected lambda");
      }
      const result: unknown[] = [];
      for (const item of list) {
        const res = executeLambda(func, [item], ctx);
        result.push(res instanceof Promise ? await res : res);
      }
      return result;
    },
  }
);
export { listMap as "list.map" };

/**
 * Creates a shallow copy of a portion of a given list, filtered down to just the elements from the given list that pass the test implemented by the provided function.
 */
const listFilter = defineOpcode<[ScriptValue<readonly unknown[]>, ScriptValue<unknown>], any[]>(
  "list.filter",
  {
    metadata: {
      label: "Filter List",
      category: "list",
      description: "Filter list items",
      slots: [
        { name: "List", type: "block" },
        { name: "Lambda", type: "block" },
      ],
      parameters: [
        { name: "List", type: "unknown[]" },
        { name: "Lambda", type: "unknown" },
      ],
      returnType: "any[]",
    },
    handler: async (args, ctx) => {
      if (args.length !== 2) {
        throw new ScriptError("list.filter: expected 2 arguments");
      }
      const list = args[0];
      if (!Array.isArray(list)) {
        throw new ScriptError("list.filter: expected list");
      }
      const func = args[1] as any;
      if (!func || func.type !== "lambda") {
        throw new ScriptError("list.filter: expected lambda");
      }
      const result: unknown[] = [];
      for (const item of list) {
        const res = executeLambda(func, [item], ctx);
        if (res instanceof Promise ? await res : res) {
          result.push(item);
        }
      }
      return result;
    },
  }
);
export { listFilter as "list.filter" };

/**
 * Executes a user-supplied "reducer" callback function on each element of the list, in order, passing in the return value from the calculation on the preceding element.
 */
const listReduce = defineOpcode<[ScriptValue<readonly unknown[]>, ScriptValue<unknown>, ScriptValue<unknown>], any>(
  "list.reduce",
  {
    metadata: {
      label: "Reduce List",
      category: "list",
      description: "Reduce list items",
      slots: [
        { name: "List", type: "block" },
        { name: "Lambda", type: "block" },
        { name: "Init", type: "block" },
      ],
      parameters: [
        { name: "List", type: "unknown[]" },
        { name: "Lambda", type: "unknown" },
        { name: "Init", type: "unknown" },
      ],
      returnType: "any",
    },
    handler: async (args, ctx) => {
      if (args.length !== 3) {
        throw new ScriptError("list.reduce: expected 3 arguments");
      }
      const list = args[0];
      if (!Array.isArray(list)) {
        throw new ScriptError("list.reduce: expected list");
      }
      const func = args[1] as any;
      if (!func || func.type !== "lambda") {
        throw new ScriptError("list.reduce: expected lambda");
      }
      let acc = args[2];
      for (const item of list) {
        const res = executeLambda(func, [acc, item], ctx);
        acc = res instanceof Promise ? await res : res;
      }
      return acc;
    },
  }
);
export { listReduce as "list.reduce" };

/**
 * Creates a new list by applying a given callback function to each element of the list, and then flattening the result by one level.
 */
const listFlatMap = defineOpcode<[ScriptValue<readonly unknown[]>, ScriptValue<unknown>], any[]>(
  "list.flatMap",
  {
    metadata: {
      label: "FlatMap List",
      category: "list",
      description: "FlatMap list items",
      slots: [
        { name: "List", type: "block" },
        { name: "Lambda", type: "block" },
      ],
      parameters: [
        { name: "List", type: "unknown[]" },
        { name: "Lambda", type: "unknown" },
      ],
      returnType: "any[]",
    },
    handler: async (args, ctx) => {
      if (args.length !== 2) {
        throw new ScriptError("list.flatMap: expected 2 arguments");
      }
      const list = args[0];
      if (!Array.isArray(list)) {
        throw new ScriptError("list.flatMap: expected list");
      }
      const func = args[1] as any;
      if (!func || func.type !== "lambda") {
        throw new ScriptError("list.flatMap: expected lambda");
      }
      const result: unknown[] = [];
      for (const item of list) {
        const res = executeLambda(func, [item], ctx);
        const mapped = res instanceof Promise ? await res : res;
        if (Array.isArray(mapped)) {
          result.push(...mapped);
        } else {
          result.push(mapped);
        }
      }
      return result;
    },
  }
);
export { listFlatMap as "list.flatMap" };
