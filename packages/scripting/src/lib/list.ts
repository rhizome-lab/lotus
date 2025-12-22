import {
  ScriptError,
  type ScriptExpression,
  type ScriptValue,
  type UnwrapScriptExpression,
  defineFullOpcode,
} from "../types";
import { executeLambda } from "../interpreter";

/** Creates a new list. */
const listNew_ = defineFullOpcode<[...items: unknown[]], any[]>("list.new", {
  handler: ([...args], _ctx) => args,
  metadata: {
    category: "list",
    description: "Creates a new list from the provided arguments.",
    genericParameters: ["Type"],
    label: "New List",
    parameters: [
      {
        description: "The items to include in the list.",
        name: "...items",
        optional: false,
        type: "unknown[]",
      },
    ],
    returnType: "Type[]",
    slots: [],
  },
});
export const listNew = listNew_ as { [Key in keyof typeof listNew_]: (typeof listNew_)[Key] } & {
  <Ts extends unknown[]>(
    ...args: Ts
  ): ScriptExpression<any[], { [Key in keyof Ts]: UnwrapScriptExpression<Ts[Key]> }>;
};

/** Returns the length of a list. */
export const listLen = defineFullOpcode<[list: readonly unknown[]], number>("list.len", {
  handler: ([list], _ctx) => list.length,
  metadata: {
    category: "list",
    description: "Returns the number of items in the list.",
    label: "List Length",
    parameters: [
      {
        description: "The list to check.",
        name: "list",
        optional: false,
        type: "readonly unknown[]",
      },
    ],
    returnType: "number",
    slots: [{ name: "List", type: "block" }],
  },
});

/** Checks if a list is empty. */
export const listEmpty = defineFullOpcode<[list: readonly unknown[]], boolean>("list.empty", {
  handler: ([list], _ctx) => list.length === 0,
  metadata: {
    category: "list",
    description: "Checks if the list has no items.",
    label: "Is Empty",
    parameters: [
      {
        description: "The list to check.",
        name: "list",
        optional: false,
        type: "readonly unknown[]",
      },
    ],
    returnType: "boolean",
    slots: [{ name: "List", type: "block" }],
  },
});

/** Retrieves an item from a list at a specific index. */
const listGet_ = defineFullOpcode<[list: readonly unknown[], index: number], any>("list.get", {
  handler: ([list, index], _ctx) => list[index],
  metadata: {
    category: "list",
    description: "Retrieves the item at the specified index.",
    genericParameters: ["Type"],
    label: "Get Item",
    parameters: [
      { description: "The list to access.", name: "list", type: "Type[]" },
      { description: "The index of the item.", name: "index", type: "number" },
    ],
    returnType: "Type | undefined",
    slots: [
      { name: "List", type: "block" },
      { name: "Index", type: "number" },
    ],
  },
});
export const listGet = listGet_ as { [Key in keyof typeof listGet_]: (typeof listGet_)[Key] } & {
  <Type>(
    list: ScriptValue<readonly Type[]>,
    index: ScriptValue<number>,
  ): ScriptExpression<any[], Type | undefined>;
};

/** Sets an item in a list at a specific index. */
const listSet_ = defineFullOpcode<[list: unknown[], index: number, value: unknown], any>(
  "list.set",
  {
    handler: ([list, index, val], _ctx) => {
      list[index] = val;
      return val;
    },
    metadata: {
      category: "list",
      description: "Sets the item at the specified index.",
      genericParameters: ["Type"],
      label: "Set Item",
      parameters: [
        { description: "The list to modify.", name: "list", type: "Type[]" },
        { description: "The index to set.", name: "index", type: "number" },
        { description: "The new value.", name: "value", type: "Type" },
      ],
      returnType: "Type",
      slots: [
        { name: "List", type: "block" },
        { name: "Index", type: "number" },
        { name: "Value", type: "block" },
      ],
    },
  },
);
export const listSet = listSet_ as { [Key in keyof typeof listSet_]: (typeof listSet_)[Key] } & {
  <Type>(
    list: ScriptValue<Type[]>,
    index: ScriptValue<number>,
    value: ScriptValue<Type>,
  ): ScriptExpression<any[], Type>;
};

/** Adds an item to the end of a list. */
const listPush_ = defineFullOpcode<[list: unknown[], value: unknown], number>("list.push", {
  handler: ([list, val], _ctx) => {
    list.push(val);
    return list.length;
  },
  metadata: {
    category: "list",
    description: "Adds an item to the end of the list.",
    genericParameters: ["Type"],
    label: "Push",
    parameters: [
      { description: "The list to modify.", name: "list", type: "Type[]" },
      { description: "The item to add.", name: "value", type: "Type" },
    ],
    returnType: "number",
    slots: [
      { name: "List", type: "block" },
      { name: "Value", type: "block" },
    ],
  },
});
export const listPush = listPush_ as {
  [Key in keyof typeof listPush_]: (typeof listPush_)[Key];
} & {
  <Type>(list: ScriptValue<Type[]>, value: ScriptValue<Type>): ScriptExpression<any[], number>;
};

/** Removes and returns the last item of a list. */
const listPop_ = defineFullOpcode<[list: unknown[]], any>("list.pop", {
  handler: ([list], _ctx) => list.pop(),
  metadata: {
    category: "list",
    description: "Removes and returns the last item of the list.",
    genericParameters: ["Type"],
    label: "Pop",
    parameters: [{ description: "The list to modify.", name: "list", type: "Type[]" }],
    returnType: "Type",
    slots: [{ name: "List", type: "block" }],
  },
});
export const listPop = listPop_ as {
  [Key in keyof typeof listPop_]: (typeof listPop_)[Key];
} & {
  <Type>(list: ScriptValue<Type[]>): ScriptExpression<any[], Type>;
};

/** Adds an item to the beginning of a list. */
const listUnshift_ = defineFullOpcode<[list: unknown[], value: unknown], number>("list.unshift", {
  handler: ([list, val], _ctx) => {
    list.unshift(val);
    return list.length;
  },
  metadata: {
    category: "list",
    description: "Adds an item to the beginning of the list.",
    genericParameters: ["Type"],
    label: "Unshift Item",
    parameters: [
      { description: "The list to modify.", name: "list", type: "Type[]" },
      { description: "The item to add.", name: "value", type: "Type" },
    ],
    returnType: "number",
    slots: [
      { name: "List", type: "block" },
      { name: "Value", type: "block" },
    ],
  },
});
export const listUnshift = listUnshift_ as {
  [Key in keyof typeof listUnshift_]: (typeof listUnshift_)[Key];
} & {
  <Type>(list: ScriptValue<Type[]>, value: ScriptValue<Type>): ScriptExpression<any[], number>;
};

/** Removes and returns the first item of a list. */
const listShift_ = defineFullOpcode<[list: unknown[]], any>("list.shift", {
  handler: ([list], _ctx) => list.shift(),
  metadata: {
    category: "list",
    description: "Removes and returns the first item of the list.",
    genericParameters: ["Type"],
    label: "Shift",
    parameters: [{ description: "The list to modify.", name: "list", type: "Type[]" }],
    returnType: "Type",
    slots: [{ name: "List", type: "block" }],
  },
});
export const listShift = listShift_ as {
  [Key in keyof typeof listShift_]: (typeof listShift_)[Key];
} & {
  <Type>(list: ScriptValue<Type[]>): ScriptExpression<any[], Type>;
};

/** Returns a shallow copy of a portion of a list. */
const listSlice_ = defineFullOpcode<[list: readonly unknown[], start: number, end?: number], any[]>(
  "list.slice",
  {
    handler: ([list, start, end], _ctx) => list.slice(start, end),
    metadata: {
      category: "list",
      description: "Returns a shallow copy of a portion of the list.",
      genericParameters: ["Type"],
      label: "Slice List",
      parameters: [
        { description: "The list to slice.", name: "list", type: "readonly Type[]" },
        { description: "The start index.", name: "start", type: "number" },
        { description: "The end index (exclusive).", name: "end", optional: true, type: "number" },
      ],
      returnType: "Type[]",
      slots: [
        { name: "List", type: "block" },
        { name: "Start", type: "number" },
        { default: null, name: "End", type: "number" },
      ],
    },
  },
);
export const listSlice = listSlice_ as {
  [Key in keyof typeof listSlice_]: (typeof listSlice_)[Key];
} & {
  <Type>(
    list: ScriptValue<readonly Type[]>,
    start: ScriptValue<number>,
    end?: ScriptValue<number>,
  ): ScriptExpression<any[], Type[]>;
};

/** Changes the contents of a list by removing or replacing existing elements and/or adding new elements. */
const listSplice_ = defineFullOpcode<
  [list: unknown[], start: number, deleteCount: number, ...items: unknown[]],
  any[]
>("list.splice", {
  handler: ([list, start, deleteCount, ...items], _ctx) =>
    list.splice(start, deleteCount, ...items),
  metadata: {
    category: "list",
    description:
      "Changes the contents of a list by removing or replacing existing elements and/or adding new elements.",
    genericParameters: ["Type"],
    label: "Splice List",
    parameters: [
      { description: "The list to modify.", name: "list", type: "Type[]" },
      { description: "The start index.", name: "start", type: "number" },
      {
        description: "The number of items to remove.",
        name: "deleteCount",
        optional: false,
        type: "number",
      },
      { description: "The items to add.", name: "...items", type: "Type[]" },
    ],
    returnType: "Type[]",
    slots: [
      { name: "List", type: "block" },
      { name: "Start", type: "number" },
      { name: "Delete Count", type: "number" },
      { name: "Items", type: "block" }, // Variadic
    ],
  },
});
export const listSplice = listSplice_ as {
  [Key in keyof typeof listSplice_]: (typeof listSplice_)[Key];
} & {
  <Type>(
    list: ScriptValue<Type[]>,
    start: ScriptValue<number>,
    deleteCount: ScriptValue<number>,
    ...items: ScriptValue<Type>[]
  ): ScriptExpression<any[], Type[]>;
};

/** Merges two or more lists. */
const listConcat_ = defineFullOpcode<[...lists: (readonly unknown[])[]], any[]>("list.concat", {
  handler: (lists, _ctx) => lists.flat(),
  metadata: {
    category: "list",
    description: "Merges two or more lists.",
    genericParameters: ["Type"],
    label: "Concat Lists",
    parameters: [
      {
        description: "The lists to concatenate.",
        name: "...lists",
        optional: false,
        type: "(readonly Type[])[]",
      },
    ],
    returnType: "Type[]",
    slots: [{ name: "Lists", type: "block" }],
  },
});
export const listConcat = listConcat_ as {
  [Key in keyof typeof listConcat_]: (typeof listConcat_)[Key];
} & {
  <Type>(...lists: ScriptValue<readonly Type[]>[]): ScriptExpression<any[], Type[]>;
};

/** Determines whether a list includes a certain value. */
const listIncludes_ = defineFullOpcode<[list: readonly unknown[], value: unknown], boolean>(
  "list.includes",
  {
    handler: ([list, val], _ctx) => list.includes(val),
    metadata: {
      category: "list",
      description: "Determines whether a list includes a certain value.",
      genericParameters: ["Type"],
      label: "List Includes",
      parameters: [
        {
          description: "The list to check.",
          name: "list",
          optional: false,
          type: "readonly Type[]",
        },
        { description: "The value to search for.", name: "value", type: "Type" },
      ],
      returnType: "boolean",
      slots: [
        { name: "List", type: "block" },
        { name: "Value", type: "block" },
      ],
    },
  },
);
export const listIncludes = listIncludes_ as {
  [Key in keyof typeof listIncludes_]: (typeof listIncludes_)[Key];
} & {
  <Type>(
    list: ScriptValue<readonly Type[]>,
    value: ScriptValue<Type>,
  ): ScriptExpression<any[], boolean>;
};

/** Reverses a list. */
const listReverse_ = defineFullOpcode<[list: readonly unknown[]], any[]>("list.reverse", {
  handler: ([list], _ctx) => list.toReversed(),
  metadata: {
    category: "list",
    description: "Reverses a list in place.",
    genericParameters: ["Type"],
    label: "Reverse List",
    parameters: [{ description: "The list to reverse.", name: "list", type: "readonly Type[]" }],
    returnType: "Type[]",
    slots: [{ name: "List", type: "block" }],
  },
});
export const listReverse = listReverse_ as {
  [Key in keyof typeof listReverse_]: (typeof listReverse_)[Key];
} & {
  <Type>(list: ScriptValue<readonly Type[]>): ScriptExpression<any[], Type[]>;
};

/** Sorts the elements of a list. */
const listSort_ = defineFullOpcode<[list: readonly unknown[]], any[]>("list.sort", {
  handler: ([list], _ctx) => list.toSorted(),
  metadata: {
    category: "list",
    description: "Sorts the elements of a list in place.",
    genericParameters: ["Type"],
    label: "Sort List",
    parameters: [{ description: "The list to sort.", name: "list", type: "Type[]" }],
    returnType: "Type[]",
    slots: [{ name: "List", type: "block" }],
  },
});
export const listSort = listSort_ as {
  [Key in keyof typeof listSort_]: (typeof listSort_)[Key];
} & {
  <Type>(list: ScriptValue<readonly Type[]>): ScriptExpression<any[], Type[]>;
};

/** Returns the first element in the provided list that satisfies the provided testing function. */
const listFind_ = defineFullOpcode<[list: readonly unknown[], lambda: unknown], any>("list.find", {
  handler: ([list, func], ctx) => {
    if (!func || (func as any).type !== "lambda") {
      throw new ScriptError("list.find: expected lambda");
    }
    let idx = 0;
    const next = (): unknown => {
      for (; idx < list.length; idx += 1) {
        const item = list[idx];
        const res = executeLambda(func as any, [item], ctx);
        if (res instanceof Promise) {
          return res.then((res) => (res ? item : next()));
        }
        if (res) {
          return item;
        }
      }
      return null;
    };
    return next();
  },
  metadata: {
    category: "list",
    description:
      "Returns the first element in the provided list that satisfies the provided testing function.",
    genericParameters: ["Type"],
    label: "Find Item",
    parameters: [
      { description: "The list to search.", name: "list", type: "Type[]" },
      { description: "The testing function.", name: "lambda", type: "(value: Type) => boolean" },
    ],
    returnType: "Type",
    slots: [
      { name: "List", type: "block" },
      { name: "Lambda", type: "block" },
    ],
  },
});
export const listFind = listFind_ as {
  [Key in keyof typeof listFind_]: (typeof listFind_)[Key];
} & {
  <Type>(
    list: ScriptValue<readonly Type[]>,
    func: ScriptValue<(item: Type) => boolean>,
  ): ScriptExpression<any[], Type>;
};

/** Creates a new list populated with the results of calling a provided function on each element in the calling list. */
const listMap_ = defineFullOpcode<[list: readonly unknown[], lambda: unknown], any[]>("list.map", {
  handler: ([list, func], ctx) => {
    if (!func || (func as any).type !== "lambda") {
      throw new ScriptError("list.map: expected lambda");
    }
    const result: unknown[] = [];
    let idx = 0;
    const next = (): unknown[] | Promise<unknown[]> => {
      for (; idx < list.length; idx += 1) {
        const item = list[idx];
        const res = executeLambda(func as any, [item], ctx);
        if (res instanceof Promise) {
          return res.then((res) => {
            result.push(res);
            return next();
          });
        }
        result.push(res);
      }
      return result;
    };
    return next();
  },
  metadata: {
    category: "list",
    description:
      "Creates a new list populated with the results of calling a provided function on each element in the calling list.",
    genericParameters: ["Type", "Result"],
    label: "Map List",
    parameters: [
      { description: "The list to map.", name: "list", type: "Type[]" },
      { description: "The mapping function.", name: "lambda", type: "(value: Type) => Result" },
    ],
    returnType: "Result[]",
    slots: [
      { name: "List", type: "block" },
      { name: "Lambda", type: "block" },
    ],
  },
});
export const listMap = listMap_ as {
  [Key in keyof typeof listMap_]: (typeof listMap_)[Key];
} & {
  <Type, Result>(
    list: ScriptValue<readonly Type[]>,
    func: ScriptValue<(item: Type) => Result>,
  ): ScriptExpression<any[], Result[]>;
};

/** Creates a shallow copy of a portion of a given list, filtered down to just the elements from the given list that pass the test implemented by the provided function. */
const listFilter_ = defineFullOpcode<[list: readonly unknown[], lambda: unknown], any[]>(
  "list.filter",
  {
    handler: ([list, func], ctx) => {
      if (!func || (func as any).type !== "lambda") {
        throw new ScriptError("list.filter: expected lambda");
      }
      const result: unknown[] = [];
      let idx = 0;
      const next = (): unknown[] | Promise<unknown[]> => {
        for (; idx < list.length; idx += 1) {
          const item = list[idx];
          const res = executeLambda(func as any, [item], ctx);
          if (res instanceof Promise) {
            return res.then((res) => {
              if (res) {
                result.push(item);
              }
              return next();
            });
          }
          if (res) {
            result.push(item);
          }
        }
        return result;
      };
      return next();
    },
    metadata: {
      category: "list",
      description:
        "Creates a shallow copy of a portion of a given list, filtered down to just the elements from the given list that pass the test implemented by the provided function.",
      genericParameters: ["Type"],
      label: "Filter List",
      parameters: [
        { description: "The list to filter.", name: "list", type: "Type[]" },
        { description: "The testing function.", name: "lambda", type: "(item: Type) => boolean" },
      ],
      returnType: "Type[]",
      slots: [
        { name: "List", type: "block" },
        { name: "Lambda", type: "block" },
      ],
    },
  },
);
export const listFilter = listFilter_ as {
  [Key in keyof typeof listFilter_]: (typeof listFilter_)[Key];
} & {
  <Type>(
    list: ScriptValue<readonly Type[]>,
    func: ScriptValue<(item: Type) => boolean>,
  ): ScriptExpression<any[], Type[]>;
};

/** Executes a user-supplied "reducer" callback function on each element of the list, in order, passing in the return value from the calculation on the preceding element. */
const listReduce_ = defineFullOpcode<
  [list: readonly unknown[], lambda: unknown, init: unknown],
  any
>("list.reduce", {
  handler: ([list, func, init], ctx) => {
    if (!func || (func as any).type !== "lambda") {
      throw new ScriptError("list.reduce: expected lambda");
    }
    let acc = init;
    let idx = 0;
    const next = (): unknown => {
      for (; idx < list.length; idx += 1) {
        const item = list[idx];
        const res = executeLambda(func as any, [acc, item], ctx);
        if (res instanceof Promise) {
          return res.then((res) => {
            acc = res;
            return next();
          });
        }
        acc = res;
      }
      return acc;
    };
    return next();
  },
  metadata: {
    category: "list",
    description:
      "Executes a user-supplied 'reducer' callback function on each element of the list, in order, passing in the return value from the calculation on the preceding element.",
    genericParameters: ["Type", "Result"],
    label: "Reduce List",
    parameters: [
      { description: "The list to reduce.", name: "list", type: "readonly Type[]" },
      {
        description: "The reducer function.",
        name: "lambda",
        type: "(acc: Result, item: Type) => Result",
      },
      {
        description: "The initial value.",
        name: "initialValue",
        optional: false,
        type: "Result",
      },
    ],
    returnType: "Result",
    slots: [
      { name: "List", type: "block" },
      { name: "Lambda", type: "block" },
      { name: "Init", type: "block" },
    ],
  },
});
export const listReduce = listReduce_ as {
  [Key in keyof typeof listReduce_]: (typeof listReduce_)[Key];
} & {
  <Type, Result>(
    list: ScriptValue<readonly Type[]>,
    func: ScriptValue<(acc: Result, item: Type) => Result>,
    init: ScriptValue<Result>,
  ): ScriptExpression<any[], Result>;
};

/** Creates a new list by applying a given callback function to each element of the list, and then flattening the result by one level. */
const listFlatMap_ = defineFullOpcode<[list: readonly unknown[], lambda: unknown], any[]>(
  "list.flatMap",
  {
    handler: ([list, func], ctx) => {
      if (!func || (func as any).type !== "lambda") {
        throw new ScriptError("list.flatMap: expected lambda");
      }
      const result: unknown[] = [];
      let idx = 0;
      const next = (): unknown[] | Promise<unknown[]> => {
        for (; idx < list.length; idx += 1) {
          const item = list[idx];
          const res = executeLambda(func as any, [item], ctx);
          if (res instanceof Promise) {
            return res.then((res) => {
              if (Array.isArray(res)) {
                result.push(...res);
              } else {
                result.push(res);
              }
              return next();
            });
          }
          if (Array.isArray(res)) {
            result.push(...res);
          } else {
            result.push(res);
          }
        }
        return result;
      };
      return next();
    },
    metadata: {
      category: "list",
      description:
        "Creates a new list by applying a given callback function to each element of the list, and then flattening the result by one level.",
      genericParameters: ["Type", "Result"],
      label: "FlatMap List",
      parameters: [
        { description: "The list to map.", name: "list", type: "readonly Type[]" },
        { description: "The mapping function.", name: "lambda", type: "(item: Type) => Result[]" },
      ],
      returnType: "Result[]",
      slots: [
        { name: "List", type: "block" },
        { name: "Lambda", type: "block" },
      ],
    },
  },
);
export const listFlatMap = listFlatMap_ as {
  [Key in keyof typeof listFlatMap_]: (typeof listFlatMap_)[Key];
} & {
  <Type, Result>(
    list: ScriptValue<readonly Type[]>,
    func: ScriptValue<(item: Type) => Result[]>,
  ): ScriptExpression<any[], Result[]>;
};
