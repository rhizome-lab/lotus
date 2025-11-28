import {
  evaluate,
  executeLambda,
  ScriptError,
  ScriptLibraryDefinition,
} from "../interpreter";

const DISALLOWED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export const ObjectLibrary: ScriptLibraryDefinition = {
  "obj.keys": async (args, ctx) => {
    if (args.length !== 1) {
      throw new ScriptError("obj.keys: expected 1 argument");
    }
    const [objExpr] = args;
    const obj = await evaluate(objExpr, ctx);
    if (!obj || typeof obj !== "object") {
      throw new ScriptError("obj.keys: expected object");
    }
    return Object.getOwnPropertyNames(obj);
  },
  "obj.values": async (args, ctx) => {
    if (args.length !== 1) {
      throw new ScriptError("obj.values: expected 1 argument");
    }
    const [objExpr] = args;
    const obj = await evaluate(objExpr, ctx);
    if (!obj || typeof obj !== "object") {
      throw new ScriptError("obj.values: expected object");
    }
    return Object.getOwnPropertyNames(obj).map((key) => obj[key]);
  },
  "obj.entries": async (args, ctx) => {
    if (args.length !== 1) {
      throw new ScriptError("obj.entries: expected 1 argument");
    }
    const [objExpr] = args;
    const obj = await evaluate(objExpr, ctx);
    if (!obj || typeof obj !== "object") {
      throw new ScriptError("obj.entries: expected object");
    }
    return Object.getOwnPropertyNames(obj).map((key) => [key, obj[key]]);
  },
  "obj.get": async (args, ctx) => {
    if (args.length !== 2) {
      throw new ScriptError("obj.get: expected 2 arguments");
    }
    const [objExpr, keyExpr] = args;
    const obj = await evaluate(objExpr, ctx);
    const key = await evaluate(keyExpr, ctx);
    if (!obj || typeof obj !== "object") {
      throw new ScriptError("obj.get: expected object");
    }
    if (typeof key !== "string") {
      throw new ScriptError("obj.get: expected string");
    }
    if (!Object.hasOwnProperty.call(obj, key)) {
      throw new ScriptError(`obj.get: key '${key}' not found`);
    }
    return obj[key];
  },
  "obj.set": async (args, ctx) => {
    if (args.length !== 3) {
      throw new ScriptError("obj.set: expected 3 arguments");
    }
    const [objExpr, keyExpr, valExpr] = args;
    const obj = await evaluate(objExpr, ctx);
    const key = await evaluate(keyExpr, ctx);
    const val = await evaluate(valExpr, ctx);
    if (!obj || typeof obj !== "object") {
      throw new ScriptError("obj.set: expected object");
    }
    if (typeof key !== "string") {
      throw new ScriptError("obj.set: expected string");
    }
    if (DISALLOWED_KEYS.has(key)) {
      throw new ScriptError(`obj.set: disallowed key '${key}'`);
    }
    obj[key] = val;
    return val;
  },
  "obj.has": async (args, ctx) => {
    if (args.length !== 2) {
      throw new ScriptError("obj.has: expected 2 arguments");
    }
    const [objExpr, keyExpr] = args;
    const obj = await evaluate(objExpr, ctx);
    const key = await evaluate(keyExpr, ctx);
    if (!obj || typeof obj !== "object") {
      throw new ScriptError("obj.has: expected object");
    }
    if (typeof key !== "string") {
      throw new ScriptError("obj.has: expected string");
    }
    return Object.hasOwnProperty.call(obj, key);
  },
  "obj.del": async (args, ctx) => {
    if (args.length !== 2) {
      throw new ScriptError("obj.del: expected 2 arguments");
    }
    const [objExpr, keyExpr] = args;
    const obj = await evaluate(objExpr, ctx);
    const key = await evaluate(keyExpr, ctx);
    if (!obj || typeof obj !== "object") {
      throw new ScriptError("obj.del: expected object");
    }
    if (typeof key !== "string") {
      throw new ScriptError("obj.del: expected string");
    }
    if (Object.hasOwnProperty.call(obj, key)) {
      delete obj[key];
      return true;
    }
    return false;
  },
  "obj.merge": async (args, ctx) => {
    if (args.length < 2) {
      throw new ScriptError("obj.merge: expected at least 2 arguments");
    }
    const objs = [];
    for (let i = 0; i < args.length; i++) {
      const obj = await evaluate(args[i], ctx);
      if (!obj || typeof obj !== "object") {
        throw new ScriptError(`obj.merge: expected object at ${i}`);
      }
      objs.push(obj);
    }
    return Object.assign({}, ...objs);
  },
  "obj.map": async (args, ctx) => {
    if (args.length !== 2) {
      throw new ScriptError("obj.map: expected 2 arguments");
    }
    const [objExpr, funcExpr] = args;
    const obj = await evaluate(objExpr, ctx);
    const func = await evaluate(funcExpr, ctx);

    if (!obj || typeof obj !== "object") {
      throw new ScriptError("obj.map: expected object");
    }
    if (!func || func.type !== "lambda") {
      throw new ScriptError("obj.map: expected lambda");
    }

    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      result[key] = await executeLambda(func, [val, key], ctx);
    }
    return result;
  },
  "obj.filter": async (args, ctx) => {
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
  "obj.reduce": async (args, ctx) => {
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
  "obj.flatMap": async (args, ctx) => {
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
};
