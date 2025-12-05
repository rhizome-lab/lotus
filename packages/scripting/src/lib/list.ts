import { executeLambda } from "../interpreter";
import { defineFullOpcode, ScriptError } from "../types";

/** Creates a new list. */
export const listNew = defineFullOpcode<[...unknown[]], any[]>("list.new", {
  metadata: {
    label: "Length",
    category: "list",
    description: "Creates a new list from the provided arguments.",
    slots: [],
    genericParameters: ["T"],
    parameters: [
      {
        name: "...items",
        type: "unknown[]",
        optional: false,
        description: "The items to include in the list.",
      },
    ],
    returnType: "T[]",
  },
  handler: ([...args], _ctx) => {
    // args are already evaluated
    return args;
  },
});

/** Returns the length of a list. */
export const listLen = defineFullOpcode<[readonly unknown[]], number>("list.len", {
  metadata: {
    label: "List Length",
    category: "list",
    description: "Returns the number of items in the list.",
    slots: [{ name: "List", type: "block" }],
    parameters: [
      {
        name: "list",
        type: "readonly unknown[]",
        optional: false,
        description: "The list to check.",
      },
    ],
    returnType: "number",
  },
  handler: ([list], _ctx) => {
    return list.length;
  },
});

/** Checks if a list is empty. */
export const listEmpty = defineFullOpcode<[readonly unknown[]], boolean>("list.empty", {
  metadata: {
    label: "Index Of",
    category: "list",
    description: "Checks if the list has no items.",
    slots: [{ name: "List", type: "block" }],
    parameters: [
      {
        name: "list",
        type: "readonly unknown[]",
        optional: false,
        description: "The list to check.",
      },
    ],
    returnType: "boolean",
  },
  handler: ([list], _ctx) => {
    return list.length === 0;
  },
});

/** Retrieves an item from a list at a specific index. */
export const listGet = defineFullOpcode<[readonly unknown[], number], any>("list.get", {
  metadata: {
    label: "Insert Item",
    category: "list",
    description: "Retrieves the item at the specified index.",
    slots: [
      { name: "List", type: "block" },
      { name: "Index", type: "number" },
    ],
    parameters: [
      { name: "list", type: "any[]", description: "The list to access." },
      { name: "index", type: "number", description: "The index of the item." },
    ],
    returnType: "any",
  },
  handler: ([list, index], _ctx) => {
    return list[index as number];
  },
});

/** Sets an item in a list at a specific index. */
export const listSet = defineFullOpcode<[unknown[], number, unknown], any>("list.set", {
  metadata: {
    label: "Shift Item",
    category: "list",
    description: "Sets the item at the specified index.",
    slots: [
      { name: "List", type: "block" },
      { name: "Index", type: "number" },
      { name: "Value", type: "block" },
    ],
    parameters: [
      { name: "list", type: "any[]", description: "The list to modify." },
      { name: "index", type: "number", description: "The index to set." },
      { name: "value", type: "unknown", description: "The new value." },
    ],
    returnType: "any",
  },
  handler: ([list, index, val], _ctx) => {
    list[index] = val;
    return val;
  },
});

/** Adds an item to the end of a list. */
export const listPush = defineFullOpcode<[unknown[], unknown], number>("list.push", {
  metadata: {
    label: "Push",
    category: "list",
    description: "Adds an item to the end of the list.",
    slots: [
      { name: "List", type: "block" },
      { name: "Value", type: "block" },
    ],
    parameters: [
      { name: "list", type: "unknown[]", description: "The list to modify." },
      { name: "value", type: "any", description: "The item to add." },
    ],
    returnType: "number",
  },
  handler: ([list, val], _ctx) => {
    list.push(val);
    return list.length;
  },
});

/** Removes and returns the last item of a list. */
export const listPop = defineFullOpcode<[unknown[]], any>("list.pop", {
  metadata: {
    label: "Pop",
    category: "list",
    description: "Removes and returns the last item of the list.",
    slots: [{ name: "List", type: "block" }],
    parameters: [{ name: "list", type: "unknown[]", description: "The list to modify." }],
    returnType: "any",
  },
  handler: ([list], _ctx) => {
    return list.pop();
  },
});

/** Adds an item to the beginning of a list. */
export const listUnshift = defineFullOpcode<[unknown[], unknown], number>("list.unshift", {
  metadata: {
    label: "Unshift Item",
    category: "list",
    description: "Adds an item to the beginning of the list.",
    slots: [
      { name: "List", type: "block" },
      { name: "Value", type: "block" },
    ],
    parameters: [
      { name: "list", type: "unknown[]", description: "The list to modify." },
      { name: "value", type: "any", description: "The item to add." },
    ],
    returnType: "number",
  },
  handler: ([list, val], _ctx) => {
    list.unshift(val);
    return list.length;
  },
});

/** Removes and returns the first item of a list. */
export const listShift = defineFullOpcode<[unknown[]], any>("list.shift", {
  metadata: {
    label: "Shift",
    category: "list",
    description: "Removes and returns the first item of the list.",
    slots: [{ name: "List", type: "block" }],
    parameters: [{ name: "list", type: "unknown[]", description: "The list to modify." }],
    returnType: "any",
  },
  handler: ([list], _ctx) => {
    return list.shift();
  },
});

/** Returns a shallow copy of a portion of a list. */
export const listSlice = defineFullOpcode<[readonly unknown[], number, number?], any[]>(
  "list.slice",
  {
    metadata: {
      label: "Slice List",
      category: "list",
      description: "Returns a shallow copy of a portion of the list.",
      slots: [
        { name: "List", type: "block" },
        { name: "Start", type: "number" },
        { name: "End", type: "number", default: null },
      ],
      parameters: [
        { name: "list", type: "any[]", description: "The list to slice." },
        { name: "start", type: "number", description: "The start index." },
        { name: "end", type: "number", optional: true, description: "The end index (exclusive)." },
      ],
      returnType: "any[]",
    },
    handler: ([list, start, end], _ctx) => {
      return list.slice(start, end);
    },
  },
);

/** Changes the contents of a list by removing or replacing existing elements and/or adding new elements. */
export const listSplice = defineFullOpcode<[unknown[], number, number, ...unknown[]], any[]>(
  "list.splice",
  {
    metadata: {
      label: "Splice List",
      category: "list",
      description:
        "Changes the contents of a list by removing or replacing existing elements and/or adding new elements.",
      slots: [
        { name: "List", type: "block" },
        { name: "Start", type: "number" },
        { name: "Delete Count", type: "number" },
        { name: "Items", type: "block" }, // Variadic
      ],
      parameters: [
        { name: "list", type: "unknown[]", description: "The list to modify." },
        { name: "start", type: "number", description: "The start index." },
        {
          name: "deleteCount",
          type: "number",
          optional: false,
          description: "The number of items to remove.",
        },
        { name: "...items", type: "any[]", description: "The items to add." },
      ],
      returnType: "any[]",
    },
    handler: ([list, start, deleteCount, ...items], _ctx) => {
      return list.splice(start, deleteCount, ...items);
    },
  },
);

/** Merges two or more lists. */
export const listConcat = defineFullOpcode<(readonly unknown[])[], any[]>("list.concat", {
  metadata: {
    label: "Concat Lists",
    category: "list",
    description: "Merges two or more lists.",
    slots: [{ name: "Lists", type: "block" }],
    parameters: [
      {
        name: "...lists",
        type: "any[][]",
        optional: false,
        description: "The lists to concatenate.",
      },
    ],
    returnType: "any[]",
  },
  handler: (lists, _ctx) => {
    return lists.flat();
  },
});

/** Determines whether a list includes a certain value. */
export const listIncludes = defineFullOpcode<[readonly unknown[], unknown], boolean>(
  "list.includes",
  {
    metadata: {
      label: "List Includes",
      category: "list",
      description: "Determines whether a list includes a certain value.",
      slots: [
        { name: "List", type: "block" },
        { name: "Value", type: "block" },
      ],
      parameters: [
        {
          name: "list",
          type: "readonly unknown[]",
          optional: false,
          description: "The list to check.",
        },
        { name: "value", type: "any", description: "The value to search for." },
      ],
      returnType: "boolean",
    },
    handler: ([list, val], _ctx) => {
      return list.includes(val);
    },
  },
);

// TODO: toReversed, toSorted?

/** Reverses a list in place. */
export const listReverse = defineFullOpcode<[unknown[]], any[]>("list.reverse", {
  metadata: {
    label: "Reverse List",
    category: "list",
    description: "Reverses a list in place.",
    slots: [{ name: "List", type: "block" }],
    parameters: [{ name: "list", type: "any[]", description: "The list to reverse." }],
    returnType: "any[]",
  },
  handler: ([list], _ctx) => {
    return list.reverse();
  },
});

/** Sorts the elements of a list in place. */
export const listSort = defineFullOpcode<[unknown[]], any[]>("list.sort", {
  metadata: {
    label: "Sort List",
    category: "list",
    description: "Sorts the elements of a list in place.",
    slots: [{ name: "List", type: "block" }],
    parameters: [{ name: "list", type: "any[]", description: "The list to sort." }],
    returnType: "any[]",
  },
  handler: ([list], _ctx) => {
    return list.sort();
  },
});

/** Returns the first element in the provided list that satisfies the provided testing function. */
export const listFind = defineFullOpcode<[readonly unknown[], unknown], any>("list.find", {
  metadata: {
    label: "Find Item",
    category: "list",
    description:
      "Returns the first element in the provided list that satisfies the provided testing function.",
    slots: [
      { name: "List", type: "block" },
      { name: "Lambda", type: "block" },
    ],
    parameters: [
      { name: "list", type: "any[]", description: "The list to search." },
      { name: "lambda", type: "unknown", description: "The testing function." },
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

/** Creates a new list populated with the results of calling a provided function on each element in the calling list. */
export const listMap = defineFullOpcode<[readonly unknown[], unknown], any[]>("list.map", {
  metadata: {
    label: "Map List",
    category: "list",
    description:
      "Creates a new list populated with the results of calling a provided function on each element in the calling list.",
    slots: [
      { name: "List", type: "block" },
      { name: "Lambda", type: "block" },
    ],
    parameters: [
      { name: "list", type: "any[]", description: "The list to map." },
      { name: "lambda", type: "unknown", description: "The mapping function." },
    ],
    returnType: "any[]",
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

/** Creates a shallow copy of a portion of a given list, filtered down to just the elements from the given list that pass the test implemented by the provided function. */
export const listFilter = defineFullOpcode<[readonly unknown[], unknown], any[]>("list.filter", {
  metadata: {
    label: "Filter List",
    category: "list",
    description:
      "Creates a shallow copy of a portion of a given list, filtered down to just the elements from the given list that pass the test implemented by the provided function.",
    slots: [
      { name: "List", type: "block" },
      { name: "Lambda", type: "block" },
    ],
    parameters: [
      { name: "list", type: "any[]", description: "The list to filter." },
      { name: "lambda", type: "unknown", description: "The testing function." },
    ],
    returnType: "any[]",
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

/** Executes a user-supplied "reducer" callback function on each element of the list, in order, passing in the return value from the calculation on the preceding element. */
export const listReduce = defineFullOpcode<[readonly unknown[], unknown, unknown], any>(
  "list.reduce",
  {
    metadata: {
      label: "Reduce List",
      category: "list",
      description:
        "Executes a user-supplied 'reducer' callback function on each element of the list, in order, passing in the return value from the calculation on the preceding element.",
      slots: [
        { name: "List", type: "block" },
        { name: "Lambda", type: "block" },
        { name: "Init", type: "block" },
      ],
      parameters: [
        { name: "list", type: "any[]", description: "The list to reduce." },
        { name: "lambda", type: "unknown", description: "The reducer function." },
        {
          name: "initialValue",
          type: "unknown",
          optional: false,
          description: "The initial value.",
        },
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
  },
);

/** Creates a new list by applying a given callback function to each element of the list, and then flattening the result by one level. */
export const listFlatMap = defineFullOpcode<[readonly unknown[], unknown], any[]>("list.flatMap", {
  metadata: {
    label: "FlatMap List",
    category: "list",
    description:
      "Creates a new list by applying a given callback function to each element of the list, and then flattening the result by one level.",
    slots: [
      { name: "List", type: "block" },
      { name: "Lambda", type: "block" },
    ],
    parameters: [
      { name: "list", type: "readonly unknown[]", description: "The list to map." },
      { name: "lambda", type: "object", description: "The mapping function." },
    ],
    returnType: "any[]",
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
