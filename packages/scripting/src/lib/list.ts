import { executeLambda, ScriptError } from "../interpreter";
import { defineOpcode } from "../def";

/**
 * Creates a new list.
 */
const listNew = defineOpcode<[...unknown[]], any[]>("list.new", {
  metadata: {
    label: "List",
    category: "list",
    description: "Create a list",
    slots: [],
    genericParameters: ["T"],
    parameters: [{ name: "...args", type: "any[]" }],
    returnType: "T[]",
  },
  handler: ([...args], _ctx) => {
    // args are already evaluated
    return args;
  },
});
export { listNew as "list.new" };

/**
 * Returns the length of a list.
 */
const listLen = defineOpcode<[readonly unknown[]], number>("list.len", {
  metadata: {
    label: "List Length",
    category: "list",
    description: "Get list length",
    slots: [{ name: "List", type: "block" }],
    parameters: [{ name: "list", type: "readonly unknown[]" }],
    returnType: "number",
  },
  handler: ([list], _ctx) => {
    return list.length;
  },
});
export { listLen as "list.len" };

/**
 * Checks if a list is empty.
 */
const listEmpty = defineOpcode<[readonly unknown[]], boolean>("list.empty", {
  metadata: {
    label: "Is Empty",
    category: "list",
    description: "Check if list is empty",
    slots: [{ name: "List", type: "block" }],
    parameters: [{ name: "list", type: "readonly unknown[]" }],
    returnType: "boolean",
  },
  handler: ([list], _ctx) => {
    return list.length === 0;
  },
});
export { listEmpty as "list.empty" };

/**
 * Retrieves an item from a list at a specific index.
 */
const listGet = defineOpcode<[readonly unknown[], number], any>("list.get", {
  metadata: {
    label: "Get Item",
    category: "list",
    description: "Get item at index",
    slots: [
      { name: "List", type: "block" },
      { name: "Index", type: "number" },
    ],
    parameters: [
      { name: "list", type: "readonly unknown[]" },
      { name: "index", type: "number" },
    ],
    returnType: "any",
  },
  handler: ([list, index], _ctx) => {
    return list[index as number];
  },
});
export { listGet as "list.get" };

/**
 * Sets an item in a list at a specific index.
 */
const listSet = defineOpcode<[readonly unknown[], number, unknown], any>("list.set", {
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
      { name: "list", type: "readonly unknown[]" },
      { name: "index", type: "number" },
      { name: "value", type: "any" },
    ],
    returnType: "any",
  },
  handler: ([list, index, val], _ctx) => {
    list[index as number] = val;
    return val;
  },
});
export { listSet as "list.set" };

/**
 * Adds an item to the end of a list.
 */
const listPush = defineOpcode<[readonly unknown[], unknown], number>("list.push", {
  metadata: {
    label: "Push",
    category: "list",
    description: "Add item to end",
    slots: [
      { name: "List", type: "block" },
      { name: "Value", type: "block" },
    ],
    parameters: [
      { name: "list", type: "readonly unknown[]" },
      { name: "value", type: "any" },
    ],
    returnType: "number",
  },
  handler: ([list, val], _ctx) => {
    list.push(val);
    return list.length;
  },
});
export { listPush as "list.push" };

/**
 * Removes and returns the last item of a list.
 */
const listPop = defineOpcode<[readonly unknown[]], any>("list.pop", {
  metadata: {
    label: "Pop",
    category: "list",
    description: "Remove item from end",
    slots: [{ name: "List", type: "block" }],
    parameters: [{ name: "list", type: "readonly unknown[]" }],
    returnType: "any",
  },
  handler: ([list], _ctx) => {
    return list.pop();
  },
});
export { listPop as "list.pop" };

/**
 * Adds an item to the beginning of a list.
 */
const listUnshift = defineOpcode<[readonly unknown[], unknown], number>("list.unshift", {
  metadata: {
    label: "Unshift",
    category: "list",
    description: "Add item to start",
    slots: [
      { name: "List", type: "block" },
      { name: "Value", type: "block" },
    ],
    parameters: [
      { name: "list", type: "readonly unknown[]" },
      { name: "value", type: "any" },
    ],
    returnType: "number",
  },
  handler: ([list, val], _ctx) => {
    list.unshift(val);
    return list.length;
  },
});
export { listUnshift as "list.unshift" };

/**
 * Removes and returns the first item of a list.
 */
const listShift = defineOpcode<[readonly unknown[]], any>("list.shift", {
  metadata: {
    label: "Shift",
    category: "list",
    description: "Remove item from start",
    slots: [{ name: "List", type: "block" }],
    parameters: [{ name: "list", type: "readonly unknown[]" }],
    returnType: "any",
  },
  handler: ([list], _ctx) => {
    return list.shift();
  },
});
export { listShift as "list.shift" };

/**
 * Returns a shallow copy of a portion of a list.
 */
const listSlice = defineOpcode<[readonly unknown[], number, number?], any[]>("list.slice", {
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
      { name: "list", type: "readonly unknown[]" },
      { name: "start", type: "number" },
      { name: "end", type: "number", optional: true },
    ],
    returnType: "readonly unknown[]",
  },
  handler: ([list, start, end], _ctx) => {
    return list.slice(start, end);
  },
});
export { listSlice as "list.slice" };

/**
 * Changes the contents of a list by removing or replacing existing elements and/or adding new elements.
 */
const listSplice = defineOpcode<[readonly unknown[], number, number, ...unknown[]], any[]>(
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
        { name: "list", type: "readonly unknown[]" },
        { name: "start", type: "number" },
        { name: "deleteCount", type: "number" },
        { name: "...items", type: "any[]" },
      ],
      returnType: "readonly unknown[]",
    },
    handler: ([list, start, deleteCount, ...items], _ctx) => {
      return list.splice(start, deleteCount, ...items);
    },
  },
);
export { listSplice as "list.splice" };

/**
 * Merges two or more lists.
 */
const listConcat = defineOpcode<[readonly unknown[], readonly unknown[]], any[]>("list.concat", {
  metadata: {
    label: "Concat Lists",
    category: "list",
    description: "Concatenate lists",
    slots: [
      { name: "List 1", type: "block" },
      { name: "List 2", type: "block" },
    ],
    parameters: [
      { name: "list1", type: "readonly unknown[]" },
      { name: "list2", type: "readonly unknown[]" },
    ],
    returnType: "readonly unknown[]",
  },
  handler: ([list1, list2], _ctx) => {
    return list1.concat(list2);
  },
});
export { listConcat as "list.concat" };

/**
 * Determines whether a list includes a certain value.
 */
const listIncludes = defineOpcode<[readonly unknown[], unknown], boolean>("list.includes", {
  metadata: {
    label: "List Includes",
    category: "list",
    description: "Check if list includes item",
    slots: [
      { name: "List", type: "block" },
      { name: "Value", type: "block" },
    ],
    parameters: [
      { name: "list", type: "readonly unknown[]" },
      { name: "value", type: "any" },
    ],
    returnType: "boolean",
  },
  handler: ([list, val], _ctx) => {
    return list.includes(val);
  },
});
export { listIncludes as "list.includes" };

/**
 * Reverses a list in place.
 */
const listReverse = defineOpcode<[readonly unknown[]], any[]>("list.reverse", {
  metadata: {
    label: "Reverse List",
    category: "list",
    description: "Reverse list order",
    slots: [{ name: "List", type: "block" }],
    parameters: [{ name: "list", type: "readonly unknown[]" }],
    returnType: "readonly unknown[]",
  },
  handler: ([list], _ctx) => {
    return list.reverse();
  },
});
export { listReverse as "list.reverse" };

/**
 * Sorts the elements of a list in place.
 */
const listSort = defineOpcode<[readonly unknown[]], any[]>("list.sort", {
  metadata: {
    label: "Sort List",
    category: "list",
    description: "Sort list",
    slots: [{ name: "List", type: "block" }],
    parameters: [{ name: "list", type: "readonly unknown[]" }],
    returnType: "readonly unknown[]",
  },
  handler: ([list], _ctx) => {
    return list.sort();
  },
});
export { listSort as "list.sort" };

/**
 * Returns the first element in the provided list that satisfies the provided testing function.
 */
const listFind = defineOpcode<[readonly unknown[], unknown], any>("list.find", {
  metadata: {
    label: "Find Item",
    category: "list",
    description: "Find item in list",
    slots: [
      { name: "List", type: "block" },
      { name: "Lambda", type: "block" },
    ],
    parameters: [
      { name: "list", type: "readonly unknown[]" },
      { name: "lambda", type: "object" },
    ],
    returnType: "any",
  },
  handler: async ([list, func], ctx) => {
    if (!func || (func as any).type !== "lambda") {
      throw new ScriptError("list.find: expected lambda");
    }
    for (const item of list) {
      const res = executeLambda(func as any, [item], ctx);
      if (res instanceof Promise ? await res : res) {
        return item;
      }
    }
    return null;
  },
});
export { listFind as "list.find" };

/**
 * Creates a new list populated with the results of calling a provided function on each element in the calling list.
 */
const listMap = defineOpcode<[readonly unknown[], unknown], any[]>("list.map", {
  metadata: {
    label: "Map List",
    category: "list",
    description: "Map list items",
    slots: [
      { name: "List", type: "block" },
      { name: "Lambda", type: "block" },
    ],
    parameters: [
      { name: "list", type: "readonly unknown[]" },
      { name: "lambda", type: "object" },
    ],
    returnType: "readonly unknown[]",
  },
  handler: async ([list, func], ctx) => {
    if (!func || (func as any).type !== "lambda") {
      throw new ScriptError("list.map: expected lambda");
    }
    const result: unknown[] = [];
    for (const item of list) {
      const res = executeLambda(func as any, [item], ctx);
      result.push(res instanceof Promise ? await res : res);
    }
    return result;
  },
});
export { listMap as "list.map" };

/**
 * Creates a shallow copy of a portion of a given list, filtered down to just the elements from the given list that pass the test implemented by the provided function.
 */
const listFilter = defineOpcode<[readonly unknown[], unknown], any[]>("list.filter", {
  metadata: {
    label: "Filter List",
    category: "list",
    description: "Filter list items",
    slots: [
      { name: "List", type: "block" },
      { name: "Lambda", type: "block" },
    ],
    parameters: [
      { name: "list", type: "readonly unknown[]" },
      { name: "lambda", type: "object" },
    ],
    returnType: "readonly unknown[]",
  },
  handler: async ([list, func], ctx) => {
    if (!func || (func as any).type !== "lambda") {
      throw new ScriptError("list.filter: expected lambda");
    }
    const result: unknown[] = [];
    for (const item of list) {
      const res = executeLambda(func as any, [item], ctx);
      if (res instanceof Promise ? await res : res) {
        result.push(item);
      }
    }
    return result;
  },
});
export { listFilter as "list.filter" };

/**
 * Executes a user-supplied "reducer" callback function on each element of the list, in order, passing in the return value from the calculation on the preceding element.
 */
const listReduce = defineOpcode<[readonly unknown[], unknown, unknown], any>("list.reduce", {
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
      { name: "list", type: "readonly unknown[]" },
      { name: "lambda", type: "object" },
      { name: "init", type: "any" },
    ],
    returnType: "any",
  },
  handler: async ([list, func, init], ctx) => {
    if (!func || (func as any).type !== "lambda") {
      throw new ScriptError("list.reduce: expected lambda");
    }
    let acc = init;
    for (const item of list) {
      const res = executeLambda(func as any, [acc, item], ctx);
      acc = res instanceof Promise ? await res : res;
    }
    return acc;
  },
});
export { listReduce as "list.reduce" };

/**
 * Creates a new list by applying a given callback function to each element of the list, and then flattening the result by one level.
 */
const listFlatMap = defineOpcode<[readonly unknown[], unknown], any[]>("list.flatMap", {
  metadata: {
    label: "FlatMap List",
    category: "list",
    description: "FlatMap list items",
    slots: [
      { name: "List", type: "block" },
      { name: "Lambda", type: "block" },
    ],
    parameters: [
      { name: "list", type: "readonly unknown[]" },
      { name: "lambda", type: "object" },
    ],
    returnType: "readonly unknown[]",
  },
  handler: async ([list, func], ctx) => {
    if (!func || (func as any).type !== "lambda") {
      throw new ScriptError("list.flatMap: expected lambda");
    }
    const result: unknown[] = [];
    for (const item of list) {
      const res = executeLambda(func as any, [item], ctx);
      const mapped = res instanceof Promise ? await res : res;
      if (Array.isArray(mapped)) {
        result.push(...mapped);
      } else {
        result.push(mapped);
      }
    }
    return result;
  },
});
export { listFlatMap as "list.flatMap" };
