import {
  evaluate,
  executeLambda,
  ScriptError,
} from "../interpreter";
import { defineOpcode, ScriptValue } from "../def";

const DISALLOWED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Creates a new object from key-value pairs.
 */
const objNew = defineOpcode<[...ScriptValue<unknown>[]], any>(
  "obj.new",
  {
    metadata: {
      label: "New Object",
      category: "data",
      description: "Create a new object",
      slots: [],
      parameters: [{ name: "...args", type: "unknown[]" }],
      returnType: "any",
    },
    handler: async (args, ctx) => {
      // args: [key1, val1, key2, val2, ...]
      const obj: Record<string, any> = {};
      for (let i = 0; i < args.length; i += 2) {
        const keyExpr = args[i];
        const valExpr = args[i+1];
        
        const key = await evaluate(keyExpr, ctx);
        if (typeof key !== "string") {
          throw new ScriptError(
            `obj.new: expected string key at index ${i}, got ${JSON.stringify(
              key,
            )}`,
          );
        }
        const val = await evaluate(valExpr, ctx);
        obj[key] = val;
      }
      return obj;
    },
  }
);
export { objNew as "obj.new" };

/**
 * Returns an array of a given object's own enumerable property names.
 */
const objKeys = defineOpcode<[ScriptValue<object>], string[]>(
  "obj.keys",
  {
    metadata: {
      label: "Keys",
      category: "object",
      description: "Get object keys",
      slots: [{ name: "Object", type: "block" }],
      parameters: [{ name: "object", type: "object" }],
      returnType: "string[]",
    },
    handler: async (args, ctx) => {
      if (args.length !== 1) {
        throw new ScriptError("obj.keys: expected 1 argument");
      }
      const [objExpr] = args;
      const obj = await evaluate(objExpr, ctx);
      if (!obj || typeof obj !== "object") {
        throw new ScriptError(
          `obj.keys: expected object, got ${JSON.stringify(obj)}`,
        );
      }
      return Object.getOwnPropertyNames(obj);
    },
  }
);
export { objKeys as "obj.keys" };

/**
 * Returns an array of a given object's own enumerable property values.
 */
const objValues = defineOpcode<[ScriptValue<object>], any[]>(
  "obj.values",
  {
    metadata: {
      label: "Values",
      category: "object",
      description: "Get object values",
      slots: [{ name: "Object", type: "block" }],
      parameters: [{ name: "object", type: "object" }],
      returnType: "any[]",
    },
    handler: async (args, ctx) => {
      if (args.length !== 1) {
        throw new ScriptError("obj.values: expected 1 argument");
      }
      const [objExpr] = args;
      const obj = await evaluate(objExpr, ctx);
      if (!obj || typeof obj !== "object") {
        throw new ScriptError(
          `obj.values: expected object, got ${JSON.stringify(obj)}`,
        );
      }
      return Object.getOwnPropertyNames(obj).map((key) => obj[key]);
    },
  }
);
export { objValues as "obj.values" };

/**
 * Returns an array of a given object's own enumerable string-keyed property [key, value] pairs.
 */
const objEntries = defineOpcode<[ScriptValue<object>], [string, any][]>(
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
    handler: async (args, ctx) => {
      if (args.length !== 1) {
        throw new ScriptError("obj.entries: expected 1 argument");
      }
      const [objExpr] = args;
      const obj = await evaluate(objExpr, ctx);
      if (!obj || typeof obj !== "object") {
        throw new ScriptError(
          `obj.entries: expected object, got ${JSON.stringify(obj)}`,
        );
      }
      return Object.getOwnPropertyNames(obj).map((key) => [key, obj[key]]);
    },
  }
);
export { objEntries as "obj.entries" };

/**
 * Retrieves a property from an object.
 */
const objGet = defineOpcode<[ScriptValue<object>, ScriptValue<string>, ScriptValue<unknown>?], any>(
  "obj.get",
  {
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
        { name: "default", type: "unknown" },
      ],
      returnType: "any",
    },
    handler: async (args, ctx) => {
      if (args.length < 2 || args.length > 3) {
        throw new ScriptError("obj.get: expected 2 or 3 arguments");
      }
      const [objExpr, keyExpr, defExpr] = args;
      const obj = await evaluate(objExpr, ctx);
      const key = await evaluate(keyExpr, ctx);
      if (!obj || typeof obj !== "object") {
        throw new ScriptError(
          `obj.get: expected object, got ${JSON.stringify(obj)}`,
        );
      }
      if (typeof key !== "string") {
        throw new ScriptError(
          `obj.get: expected string, got ${JSON.stringify(key)}`,
        );
      }
      if (!Object.hasOwnProperty.call(obj, key)) {
        if (args.length === 3) {
          return await evaluate(defExpr, ctx);
        }
        throw new ScriptError(`obj.get: key '${key}' not found`);
      }
      return obj[key];
    },
  }
);
export { objGet as "obj.get" };

/**
 * Sets a property on an object. Returns the entire object.
 */
const objSet = defineOpcode<[ScriptValue<object>, ScriptValue<string>, ScriptValue<unknown>], any>(
  "obj.set",
  {
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
        { name: "value", type: "unknown" },
      ],
      returnType: "any",
    },
    handler: async (args, ctx) => {
      if (args.length !== 3) {
        throw new ScriptError("obj.set: expected 3 arguments");
      }
      const [objExpr, keyExpr, valExpr] = args;
      const obj = await evaluate(objExpr, ctx);
      const key = await evaluate(keyExpr, ctx);
      const val = await evaluate(valExpr, ctx);
      if (!obj || typeof obj !== "object") {
        throw new ScriptError(
          `obj.set: expected object, got ${JSON.stringify(obj)}`,
        );
      }
      if (typeof key !== "string") {
        throw new ScriptError(
          `obj.set: expected string, got ${JSON.stringify(key)}`,
        );
      }
      if (DISALLOWED_KEYS.has(key)) {
        throw new ScriptError(`obj.set: disallowed key '${key}'`);
      }
      obj[key] = val;
      return obj;
    },
  }
);
export { objSet as "obj.set" };

/**
 * Checks if an object has a specific property.
 */
const objHas = defineOpcode<[ScriptValue<object>, ScriptValue<string>], boolean>(
  "obj.has",
  {
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
    handler: async (args, ctx) => {
      if (args.length !== 2) {
        throw new ScriptError("obj.has: expected 2 arguments");
      }
      const [objExpr, keyExpr] = args;
      const obj = await evaluate(objExpr, ctx);
      const key = await evaluate(keyExpr, ctx);
      if (!obj || typeof obj !== "object") {
        throw new ScriptError(
          `obj.has: expected object, got ${JSON.stringify(obj)}`,
        );
      }
      if (typeof key !== "string") {
        throw new ScriptError(
          `obj.has: expected string, got ${JSON.stringify(key)}`,
        );
      }
      return Object.hasOwnProperty.call(obj, key);
    },
  }
);
export { objHas as "obj.has" };

/**
 * Deletes a property from an object.
 */
const objDel = defineOpcode<[ScriptValue<object>, ScriptValue<string>], boolean>(
  "obj.del",
  {
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
    handler: async (args, ctx) => {
      if (args.length !== 2) {
        throw new ScriptError("obj.del: expected 2 arguments");
      }
      const [objExpr, keyExpr] = args;
      const obj = await evaluate(objExpr, ctx);
      const key = await evaluate(keyExpr, ctx);
      if (!obj || typeof obj !== "object") {
        throw new ScriptError(
          `obj.del: expected object, got ${JSON.stringify(obj)}`,
        );
      }
      if (typeof key !== "string") {
        throw new ScriptError(
          `obj.del: expected string, got ${JSON.stringify(key)}`,
        );
      }
      if (Object.hasOwnProperty.call(obj, key)) {
        delete obj[key];
        return true;
      }
      return false;
    },
  }
);
export { objDel as "obj.del" };

/**
 * Merges multiple objects into a new object.
 */
const objMerge = defineOpcode<[ScriptValue<object>, ScriptValue<object>, ...ScriptValue<object>[]], any>(
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
    handler: async (args, ctx) => {
      if (args.length < 2) {
        throw new ScriptError("obj.merge: expected at least 2 arguments");
      }
      const objs = [];
      for (let i = 0; i < args.length; i++) {
        const obj = await evaluate(args[i], ctx);
        if (!obj || typeof obj !== "object") {
          throw new ScriptError(
            `obj.merge: expected object at ${i}, got ${JSON.stringify(obj)}`,
          );
        }
        objs.push(obj);
      }
      return Object.assign({}, ...objs);
    },
  }
);
export { objMerge as "obj.merge" };

/**
 * Creates a new object with the same keys as the original, but with values transformed by a function.
 */
const objMap = defineOpcode<[ScriptValue<object>, ScriptValue<unknown>], any>(
  "obj.map",
  {
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
        { name: "lambda", type: "unknown" },
      ],
      returnType: "any",
    },
    handler: async (args, ctx) => {
      if (args.length !== 2) {
        throw new ScriptError("obj.map: expected 2 arguments");
      }
      const [objExpr, funcExpr] = args;
      const obj = await evaluate(objExpr, ctx);
      const func = await evaluate(funcExpr, ctx);

      if (!obj || typeof obj !== "object") {
        throw new ScriptError(
          `obj.map: expected object, got ${JSON.stringify(obj)}`,
        );
      }
      if (!func || func.type !== "lambda") {
        throw new ScriptError(
          `obj.map: expected lambda, got ${JSON.stringify(func)}`,
        );
      }

      const result: Record<string, any> = {};
      for (const [key, val] of Object.entries(obj)) {
        result[key] = await executeLambda(func, [val, key], ctx);
      }
      return result;
    },
  }
);
export { objMap as "obj.map" };

/**
 * Creates a new object with a subset of properties that pass the test implemented by the provided function.
 */
const objFilter = defineOpcode<[ScriptValue<object>, ScriptValue<unknown>], any>(
  "obj.filter",
  {
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
        { name: "lambda", type: "unknown" },
      ],
      returnType: "any",
    },
    handler: async (args, ctx) => {
      if (args.length !== 2) {
        throw new ScriptError("obj.filter: expected 2 arguments");
      }
      const [objExpr, funcExpr] = args;
      const obj = await evaluate(objExpr, ctx);
      const func = await evaluate(funcExpr, ctx);

      if (!obj || typeof obj !== "object" || !func || func.type !== "lambda") {
        return {};
      }

      const result: Record<string, any> = {};
      for (const [key, val] of Object.entries(obj)) {
        if (await executeLambda(func, [val, key], ctx)) {
          result[key] = val;
        }
      }
      return result;
    },
  }
);
export { objFilter as "obj.filter" };

/**
 * Executes a user-supplied "reducer" callback function on each entry of the object.
 */
const objReduce = defineOpcode<[ScriptValue<object>, ScriptValue<unknown>, ScriptValue<unknown>], any>(
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
        { name: "lambda", type: "unknown" },
        { name: "init", type: "unknown" },
      ],
      returnType: "any",
    },
    handler: async (args, ctx) => {
      if (args.length !== 3) {
        throw new ScriptError("obj.reduce: expected 3 arguments");
      }
      const [objExpr, funcExpr, initExpr] = args;
      const obj = await evaluate(objExpr, ctx);
      const func = await evaluate(funcExpr, ctx);
      let acc = await evaluate(initExpr, ctx);

      if (!obj || typeof obj !== "object" || !func || func.type !== "lambda") {
        return acc;
      }

      for (const [key, val] of Object.entries(obj)) {
        acc = await executeLambda(func, [acc, val, key], ctx);
      }
      return acc;
    },
  }
);
export { objReduce as "obj.reduce" };

/**
 * Creates a new object by applying a given callback function to each entry of the object, and then flattening the result.
 */
const objFlatMap = defineOpcode<[ScriptValue<object>, ScriptValue<unknown>], any>(
  "obj.flatMap",
  {
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
        { name: "lambda", type: "unknown" },
      ],
      returnType: "any",
    },
    handler: async (args, ctx) => {
      if (args.length !== 2) {
        throw new ScriptError("obj.flatMap: expected 2 arguments");
      }
      const [objExpr, funcExpr] = args;
      const obj = await evaluate(objExpr, ctx);
      const func = await evaluate(funcExpr, ctx);
      if (!obj || typeof obj !== "object" || !func || func.type !== "lambda") {
        return {};
      }

      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(obj)) {
        const mapped = await executeLambda(func, [val, key], ctx);
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
  }
);
export { objFlatMap as "obj.flatMap" };
