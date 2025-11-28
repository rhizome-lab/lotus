import {
  evaluate,
  executeLambda,
  ScriptError,
  ScriptLibraryDefinition,
} from "../interpreter";

export const ListLibrary: ScriptLibraryDefinition = {
  "list.len": async (args, ctx) => {
    const list = await evaluate(args[0], ctx);
    if (!Array.isArray(list)) return 0;
    return list.length;
  },

  "list.empty": async (args, ctx) => {
    const list = await evaluate(args[0], ctx);
    if (!Array.isArray(list)) return true;
    return list.length === 0;
  },

  "list.get": async (args, ctx) => {
    const list = await evaluate(args[0], ctx);
    const index = await evaluate(args[1], ctx);
    if (!Array.isArray(list)) return null;
    return list[index];
  },

  "list.set": async (args, ctx) => {
    const list = await evaluate(args[0], ctx);
    const index = await evaluate(args[1], ctx);
    const val = await evaluate(args[2], ctx);
    if (!Array.isArray(list)) return null;
    list[index] = val;
    return val;
  },

  "list.push": async (args, ctx) => {
    const list = await evaluate(args[0], ctx);
    const val = await evaluate(args[1], ctx);
    if (!Array.isArray(list)) return null;
    list.push(val);
    return list.length;
  },

  "list.pop": async (args, ctx) => {
    if (args.length !== 1) {
      throw new ScriptError("list.pop: expected 1 argument");
    }
    const [listExpr] = args;
    const list = await evaluate(listExpr, ctx);
    if (!Array.isArray(list)) return null;
    return list.pop();
  },

  "list.unshift": async (args, ctx) => {
    const list = await evaluate(args[0], ctx);
    const val = await evaluate(args[1], ctx);
    if (!Array.isArray(list)) return null;
    list.unshift(val);
    return list.length;
  },

  "list.shift": async (args, ctx) => {
    const list = await evaluate(args[0], ctx);
    if (!Array.isArray(list)) return null;
    return list.shift();
  },

  "list.slice": async (args, ctx) => {
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

  "list.splice": async (args, ctx) => {
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

  "list.concat": async (args, ctx) => {
    if (args.length !== 2) {
      throw new ScriptError("list.concat: expected 2 arguments");
    }
    const [list1Expr, list2Expr] = args;
    const list1 = await evaluate(list1Expr, ctx);
    const list2 = await evaluate(list2Expr, ctx);
    if (!Array.isArray(list1) || !Array.isArray(list2)) return [];
    return list1.concat(list2);
  },

  "list.includes": async (args, ctx) => {
    const list = await evaluate(args[0], ctx);
    const val = await evaluate(args[1], ctx);
    if (!Array.isArray(list)) return false;
    return list.includes(val);
  },

  "list.reverse": async (args, ctx) => {
    const list = await evaluate(args[0], ctx);
    if (!Array.isArray(list)) return list;
    return list.reverse();
  },

  "list.sort": async (args, ctx) => {
    const list = await evaluate(args[0], ctx);
    if (!Array.isArray(list)) return list;
    return list.sort();
  },

  "list.join": async (args, ctx) => {
    if (args.length !== 2) {
      throw new ScriptError("list.join: expected 2 arguments");
    }
    const [listExpr, sepExpr] = args;
    const list = await evaluate(listExpr, ctx);
    const sep = await evaluate(sepExpr, ctx);
    if (!Array.isArray(list) || typeof sep !== "string") return "";
    return list.join(sep);
  },

  "list.find": async (args, ctx) => {
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

  "list.map": async (args, ctx) => {
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

  "list.filter": async (args, ctx) => {
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

  "list.reduce": async (args, ctx) => {
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

  "list.flatMap": async (args, ctx) => {
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
};
