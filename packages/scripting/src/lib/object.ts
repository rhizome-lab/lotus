import { evaluate, executeLambda, ScriptError } from "../interpreter";
import { defineOpcode, ScriptRaw, ScriptValue } from "../def";

const DISALLOWED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Creates a new object from key-value pairs. */
export const objNew = defineOpcode<
  [...ScriptRaw<[key: ScriptValue<string>, value: ScriptValue<unknown>]>[]],
  any
>("obj.new", {
  metadata: {
    label: "New Object",
    category: "data",
    description: "Create a new object",
    slots: [],
    genericParameters: [
      "Kvs extends [] | readonly (readonly [key: '' | (string & {}), value: unknown])[]",
    ],
    parameters: [{ name: "...kvs", type: "any[]" }],
    returnType:
      "{ [K in keyof Kvs & `${number}` as (Kvs[K] & [string, unknown])[0]]: (Kvs[K] & [string, unknown])[1] }",
    lazy: true,
  },
  handler: async (args, ctx) => {
    // args: [[key1, val1], [key2, val2], ...] (variadic)
    const obj: Record<string, any> = {};
    for (let i = 0; i < args.length; i++) {
      if (!Array.isArray(args[i]) || args[i].length !== 2) {
        throw new ScriptError(
          `obj.new: expected pair at index ${i}, got ${JSON.stringify(args[i])}`,
        );
      }
      const [keyExpr, valueExpr] = args[i];
      const keyRes = evaluate(keyExpr, ctx);
      const key = keyRes instanceof Promise ? await keyRes : keyRes;
      if (typeof key !== "string") {
        throw new ScriptError(
          `obj.new: expected string key at index ${i}, got ${JSON.stringify(key)}`,
        );
      }
      const valRes = evaluate(valueExpr, ctx);
      const val = valRes instanceof Promise ? await valRes : valRes;
      obj[key] = val;
    }
    return obj;
  },
});

/** Returns an array of a given object's own enumerable property names. */
export const objKeys = defineOpcode<[object], string[]>("obj.keys", {
  metadata: {
    label: "Keys",
    category: "object",
    description: "Get object keys",
    slots: [{ name: "Object", type: "block" }],
    parameters: [{ name: "object", type: "object" }],
    returnType: "string[]",
  },
  handler: ([obj], _ctx) => {
    return Object.getOwnPropertyNames(obj);
  },
});

/** Returns an array of a given object's own enumerable property values. */
export const objValues = defineOpcode<[object], any[]>("obj.values", {
  metadata: {
    label: "Values",
    category: "object",
    description: "Get object values",
    slots: [{ name: "Object", type: "block" }],
    parameters: [{ name: "object", type: "object" }],
    returnType: "any[]",
  },
  handler: ([obj], _ctx) => {
    return Object.getOwnPropertyNames(obj).map((key) => (obj as any)[key]);
  },
});

/** Returns an array of a given object's own enumerable string-keyed property [key, value] pairs. */
export const objEntries = defineOpcode<[object], [string, any][]>(
  "obj.entries",
  {
    metadata: {
      label: "Entries",
      category: "object",
      description: "Get object entries",
      slots: [{ name: "Object", type: "block" }],
      parameters: [{ name: "object", type: "object" }],
      returnType: "[string, any][]",
    },
    handler: ([obj], _ctx) => {
      return Object.getOwnPropertyNames(obj).map((key) => [
        key,
        (obj as any)[key],
      ]);
    },
  },
);

/** Retrieves a property from an object. */
export const objGet = defineOpcode<[object, string, unknown?], any>("obj.get", {
  metadata: {
    label: "Get",
    category: "object",
    description: "Get object property",
    slots: [
      { name: "Object", type: "block" },
      { name: "Key", type: "string" },
      { name: "Default", type: "block", default: null },
    ],
    parameters: [
      { name: "object", type: "object" },
      { name: "key", type: "string" },
      { name: "default", type: "any", optional: true },
    ],
    returnType: "any",
  },
  handler: ([obj, key, defVal], _ctx) => {
    if (!Object.hasOwnProperty.call(obj, key)) {
      if (defVal !== undefined) {
        return defVal;
      }
      throw new ScriptError(`obj.get: key '${key}' not found`);
    }
    return (obj as any)[key];
  },
});

/** Sets a property on an object. Returns the entire object. */
export const objSet = defineOpcode<[object, string, unknown], any>("obj.set", {
  metadata: {
    label: "Set",
    category: "object",
    description: "Set object property",
    slots: [
      { name: "Object", type: "block" },
      { name: "Key", type: "string" },
      { name: "Value", type: "block" },
    ],
    parameters: [
      { name: "object", type: "object" },
      { name: "key", type: "string" },
      { name: "value", type: "any" },
    ],
    returnType: "any",
  },
  handler: ([obj, key, val], _ctx) => {
    if (DISALLOWED_KEYS.has(key)) {
      throw new ScriptError(`obj.set: disallowed key '${key}'`);
    }
    (obj as any)[key] = val;
    return obj;
  },
});

/** Checks if an object has a specific property. */
export const objHas = defineOpcode<[object, string], boolean>("obj.has", {
  metadata: {
    label: "Has Key",
    category: "object",
    description: "Check if object has key",
    slots: [
      { name: "Object", type: "block" },
      { name: "Key", type: "string" },
    ],
    parameters: [
      { name: "object", type: "object" },
      { name: "key", type: "string" },
    ],
    returnType: "boolean",
  },
  handler: ([obj, key], _ctx) => {
    return Object.hasOwnProperty.call(obj, key);
  },
});

/** Deletes a property from an object. */
export const objDel = defineOpcode<[object, string], boolean>("obj.del", {
  metadata: {
    label: "Delete Key",
    category: "object",
    description: "Delete object property",
    slots: [
      { name: "Object", type: "block" },
      { name: "Key", type: "string" },
    ],
    parameters: [
      { name: "object", type: "object" },
      { name: "key", type: "string" },
    ],
    returnType: "boolean",
  },
  handler: ([obj, key], _ctx) => {
    if (Object.hasOwnProperty.call(obj, key)) {
      delete (obj as any)[key];
      return true;
    }
    return false;
  },
});

/** Merges multiple objects into a new object. */
export const objMerge = defineOpcode<[object, object, ...object[]], any>(
  "obj.merge",
  {
    metadata: {
      label: "Merge",
      category: "object",
      description: "Merge objects",
      slots: [{ name: "Objects", type: "block" }], // Variadic
      parameters: [{ name: "...objects", type: "object[]" }],
      returnType: "any",
    },
    handler: ([...objs], _ctx) => {
      return Object.assign({}, ...objs);
    },
  },
);

/** Creates a new object with the same keys as the original, but with values transformed by a function. */
export const objMap = defineOpcode<[object, unknown], any>("obj.map", {
  metadata: {
    label: "Map Object",
    category: "object",
    description: "Map object values",
    slots: [
      { name: "Object", type: "block" },
      { name: "Lambda", type: "block" },
    ],
    parameters: [
      { name: "object", type: "object" },
      { name: "lambda", type: "object" },
    ],
    returnType: "any",
  },
  handler: async ([obj, func], ctx) => {
    if (!func || (func as any).type !== "lambda") {
      throw new ScriptError(
        `obj.map: expected lambda, got ${JSON.stringify(func)}`,
      );
    }

    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      const res = executeLambda(func as any, [val, key], ctx);
      result[key] = res instanceof Promise ? await res : res;
    }
    return result;
  },
});

/** Creates a new object with a subset of properties that pass the test implemented by the provided function. */
export const objFilter = defineOpcode<[object, unknown], any>("obj.filter", {
  metadata: {
    label: "Filter Object",
    category: "object",
    description: "Filter object entries",
    slots: [
      { name: "Object", type: "block" },
      { name: "Lambda", type: "block" },
    ],
    parameters: [
      { name: "object", type: "object" },
      { name: "lambda", type: "object" },
    ],
    returnType: "any",
  },
  handler: async ([obj, func], ctx) => {
    if (!func || (func as any).type !== "lambda") {
      return {};
    }

    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      const res = executeLambda(func as any, [val, key], ctx);
      if (res instanceof Promise ? await res : res) {
        result[key] = val;
      }
    }
    return result;
  },
});

/** Executes a user-supplied "reducer" callback function on each entry of the object. */
export const objReduce = defineOpcode<[object, unknown, unknown], any>(
  "obj.reduce",
  {
    metadata: {
      label: "Reduce Object",
      category: "object",
      description: "Reduce object entries",
      slots: [
        { name: "Object", type: "block" },
        { name: "Lambda", type: "block" },
        { name: "Init", type: "block" },
      ],
      parameters: [
        { name: "object", type: "object" },
        { name: "lambda", type: "object" },
        { name: "init", type: "any" },
      ],
      returnType: "any",
    },
    handler: async ([obj, func, init], ctx) => {
      let acc = init;

      if (!func || (func as any).type !== "lambda") {
        return acc;
      }

      for (const [key, val] of Object.entries(obj)) {
        const res = executeLambda(func as any, [acc, val, key], ctx);
        acc = res instanceof Promise ? await res : res;
      }
      return acc;
    },
  },
);

/** Creates a new object by applying a given callback function to each entry of the object, and then flattening the result. */
export const objFlatMap = defineOpcode<[object, unknown], any>("obj.flatMap", {
  metadata: {
    label: "FlatMap Object",
    category: "object",
    description: "FlatMap object entries",
    slots: [
      { name: "Object", type: "block" },
      { name: "Lambda", type: "block" },
    ],
    parameters: [
      { name: "object", type: "object" },
      { name: "lambda", type: "object" },
    ],
    returnType: "any",
  },
  handler: async ([obj, func], ctx) => {
    if (!func || (func as any).type !== "lambda") {
      return {};
    }

    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      const res = executeLambda(func as any, [val, key], ctx);
      const mapped = res instanceof Promise ? await res : res;
      if (
        typeof mapped === "object" &&
        mapped !== null &&
        !Array.isArray(mapped)
      ) {
        Object.assign(result, mapped);
      }
    }
    return result;
  },
});
