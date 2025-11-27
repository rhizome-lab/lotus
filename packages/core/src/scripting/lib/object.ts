import { evaluate, registerOpcode } from "../interpreter";

export function registerObjectLibrary() {
  registerOpcode("obj.keys", async (args, ctx) => {
    const obj = await evaluate(args[0], ctx);
    if (typeof obj !== "object" || obj === null || Array.isArray(obj))
      return [];
    return Object.keys(obj);
  });

  registerOpcode("obj.values", async (args, ctx) => {
    const obj = await evaluate(args[0], ctx);
    if (typeof obj !== "object" || obj === null || Array.isArray(obj))
      return [];
    return Object.values(obj);
  });

  registerOpcode("obj.entries", async (args, ctx) => {
    const obj = await evaluate(args[0], ctx);
    if (typeof obj !== "object" || obj === null || Array.isArray(obj))
      return [];
    return Object.entries(obj);
  });

  registerOpcode("obj.get", async (args, ctx) => {
    const obj = await evaluate(args[0], ctx);
    const key = await evaluate(args[1], ctx);
    if (typeof obj !== "object" || obj === null || Array.isArray(obj))
      return null;
    return obj[key];
  });

  registerOpcode("obj.set", async (args, ctx) => {
    const obj = await evaluate(args[0], ctx);
    const key = await evaluate(args[1], ctx);
    const val = await evaluate(args[2], ctx);
    if (typeof obj !== "object" || obj === null || Array.isArray(obj))
      return null;
    obj[key] = val;
    return val;
  });

  registerOpcode("obj.has", async (args, ctx) => {
    const obj = await evaluate(args[0], ctx);
    const key = await evaluate(args[1], ctx);
    if (typeof obj !== "object" || obj === null || Array.isArray(obj))
      return false;
    return key in obj;
  });

  registerOpcode("obj.del", async (args, ctx) => {
    const obj = await evaluate(args[0], ctx);
    const key = await evaluate(args[1], ctx);
    if (typeof obj !== "object" || obj === null || Array.isArray(obj))
      return false;
    if (key in obj) {
      delete obj[key];
      return true;
    }
    return false;
  });

  registerOpcode("obj.merge", async (args, ctx) => {
    const obj1 = await evaluate(args[0], ctx);
    const obj2 = await evaluate(args[1], ctx);
    if (typeof obj1 !== "object" || obj1 === null || Array.isArray(obj1))
      return {};
    if (typeof obj2 !== "object" || obj2 === null || Array.isArray(obj2))
      return { ...obj1 };
    return { ...obj1, ...obj2 };
  });
}
