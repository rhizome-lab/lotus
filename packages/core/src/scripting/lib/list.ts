import { evaluate, executeLambda } from "../interpreter";

export const ListLibrary = {
  "list.len": async (args: any[], ctx: any) => {
    const list = await evaluate(args[0], ctx);
    if (!Array.isArray(list)) return 0;
    return list.length;
  },

  "list.empty": async (args: any[], ctx: any) => {
    const list = await evaluate(args[0], ctx);
    if (!Array.isArray(list)) return true;
    return list.length === 0;
  },

  "list.get": async (args: any[], ctx: any) => {
    const list = await evaluate(args[0], ctx);
    const index = await evaluate(args[1], ctx);
    if (!Array.isArray(list)) return null;
    return list[index];
  },

  "list.set": async (args: any[], ctx: any) => {
    const list = await evaluate(args[0], ctx);
    const index = await evaluate(args[1], ctx);
    const val = await evaluate(args[2], ctx);
    if (!Array.isArray(list)) return null;
    list[index] = val;
    return val;
  },

  "list.push": async (args: any[], ctx: any) => {
    const list = await evaluate(args[0], ctx);
    const val = await evaluate(args[1], ctx);
    if (!Array.isArray(list)) return null;
    list.push(val);
    return list.length;
  },

  "list.pop": async (args: any[], ctx: any) => {
    const list = await evaluate(args[0], ctx);
    if (!Array.isArray(list)) return null;
    return list.pop();
  },

  "list.unshift": async (args: any[], ctx: any) => {
    const list = await evaluate(args[0], ctx);
    const val = await evaluate(args[1], ctx);
    if (!Array.isArray(list)) return null;
    list.unshift(val);
    return list.length;
  },

  "list.shift": async (args: any[], ctx: any) => {
    const list = await evaluate(args[0], ctx);
    if (!Array.isArray(list)) return null;
    return list.shift();
  },

  "list.slice": async (args: any[], ctx: any) => {
    const list = await evaluate(args[0], ctx);
    const start = await evaluate(args[1], ctx);
    const end = args.length > 2 ? await evaluate(args[2], ctx) : undefined;
    if (!Array.isArray(list)) return [];
    return list.slice(start, end);
  },

  "list.splice": async (args: any[], ctx: any) => {
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

  "list.concat": async (args: any[], ctx: any) => {
    const list1 = await evaluate(args[0], ctx);
    const list2 = await evaluate(args[1], ctx);
    if (!Array.isArray(list1) || !Array.isArray(list2)) return [];
    return list1.concat(list2);
  },

  "list.includes": async (args: any[], ctx: any) => {
    const list = await evaluate(args[0], ctx);
    const val = await evaluate(args[1], ctx);
    if (!Array.isArray(list)) return false;
    return list.includes(val);
  },

  "list.reverse": async (args: any[], ctx: any) => {
    const list = await evaluate(args[0], ctx);
    if (!Array.isArray(list)) return list;
    return list.reverse();
  },

  "list.sort": async (args: any[], ctx: any) => {
    const list = await evaluate(args[0], ctx);
    if (!Array.isArray(list)) return list;
    return list.sort();
  },

  "list.map": async (args: any[], ctx: any) => {
    const list = await evaluate(args[0], ctx);
    const func = await evaluate(args[1], ctx);
    if (!Array.isArray(list)) return [];

    const result: unknown[] = [];
    for (const item of list) {
      result.push(await executeLambda(func, [item], ctx));
    }
    return result;
  },

  "list.filter": async (args: any[], ctx: any) => {
    const list = await evaluate(args[0], ctx);
    const func = await evaluate(args[1], ctx);
    if (!Array.isArray(list)) return [];

    const result: unknown[] = [];
    for (const item of list) {
      if (await executeLambda(func, [item], ctx)) {
        result.push(item);
      }
    }
    return result;
  },

  "list.reduce": async (args: any[], ctx: any) => {
    const list = await evaluate(args[0], ctx);
    const func = await evaluate(args[1], ctx);
    let acc = await evaluate(args[2], ctx);

    if (!Array.isArray(list)) return acc;

    for (const item of list) {
      acc = await executeLambda(func, [acc, item], ctx);
    }
    return acc;
  },

  "list.flatMap": async (args: any[], ctx: any) => {
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
