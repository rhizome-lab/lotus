import { evaluate, ScriptError, ScriptLibraryDefinition } from "../interpreter";

export const StringLibrary: ScriptLibraryDefinition = {
  "str.len": async (args, ctx) => {
    if (args.length !== 1) {
      throw new ScriptError("str.len: expected 1 argument");
    }
    const [strExpr] = args;
    const str = await evaluate(strExpr, ctx);
    if (typeof str !== "string") {
      throw new ScriptError("str.len: expected string for str");
    }
    return str.length;
  },
  "str.concat": async (args, ctx) => {
    const strings: string[] = [];
    for (const arg of args) {
      const str = await evaluate(arg, ctx);
      if (typeof str === "object" || typeof str === "function") {
        throw new ScriptError("str.concat: expected primitive for arg");
      }
      strings.push(String(str));
    }
    return strings.join("");
  },
  "str.split": async (args, ctx) => {
    if (args.length !== 2) {
      throw new ScriptError("str.split: expected 2 arguments");
    }
    const [strExpr, sepExpr] = args;
    const str = await evaluate(strExpr, ctx);
    if (typeof str !== "string") {
      throw new ScriptError("str.split: expected string for str");
    }
    const sep = await evaluate(sepExpr, ctx);
    if (typeof sep !== "string") {
      throw new ScriptError("str.split: expected string for sep");
    }
    return str.split(sep);
  },
  "str.slice": async (args, ctx) => {
    if (args.length < 2 || args.length > 3) {
      throw new ScriptError("str.slice: expected 2 or 3 arguments");
    }
    const [strExpr, startExpr, endExpr] = args;
    const str = await evaluate(strExpr, ctx);
    if (typeof str !== "string") {
      throw new ScriptError("str.slice: expected string for str");
    }
    const start = await evaluate(startExpr, ctx);
    if (typeof start !== "number") {
      throw new ScriptError("str.slice: expected number for start");
    }
    const end = endExpr ? await evaluate(endExpr, ctx) : str.length;
    if (typeof end !== "number") {
      throw new ScriptError("str.slice: expected number for end");
    }
    return str.slice(start, end);
  },
  "str.upper": async (args, ctx) => {
    if (args.length !== 1) {
      throw new ScriptError("str.upper: expected 1 argument");
    }
    const [strExpr] = args;
    const str = await evaluate(strExpr, ctx);
    if (typeof str !== "string") {
      throw new ScriptError("str.upper: expected string for str");
    }
    return str.toUpperCase();
  },
  "str.lower": async (args, ctx) => {
    if (args.length !== 1) {
      throw new ScriptError("str.lower: expected 1 argument");
    }
    const [strExpr] = args;
    const str = await evaluate(strExpr, ctx);
    if (typeof str !== "string") {
      throw new ScriptError("str.lower: expected string for str");
    }
    return str.toLowerCase();
  },
  "str.trim": async (args, ctx) => {
    if (args.length !== 1) {
      throw new ScriptError("str.trim: expected 1 argument");
    }
    const [strExpr] = args;
    const str = await evaluate(strExpr, ctx);
    if (typeof str !== "string") {
      throw new ScriptError("str.trim: expected string for str");
    }
    return str.trim();
  },
  "str.replace": async (args, ctx) => {
    if (args.length !== 3) {
      throw new ScriptError("str.replace: expected 3 arguments");
    }
    const [strExpr, searchExpr, replaceExpr] = args;
    const str = await evaluate(strExpr, ctx);
    if (typeof str !== "string") {
      throw new ScriptError("str.replace: expected string for str");
    }
    const search = await evaluate(searchExpr, ctx);
    if (typeof search !== "string") {
      throw new ScriptError("str.replace: expected string for search");
    }
    const replace = await evaluate(replaceExpr, ctx);
    if (typeof replace !== "string") {
      throw new ScriptError("str.replace: expected string for replace");
    }
    return str.replace(search, replace);
  },
  "str.includes": async (args, ctx) => {
    if (args.length !== 2) {
      throw new ScriptError("str.includes: expected 2 arguments");
    }
    const [strExpr, searchExpr] = args;
    const str = await evaluate(strExpr, ctx);
    if (typeof str !== "string") {
      throw new ScriptError("str.includes: expected string for str");
    }
    const search = await evaluate(searchExpr, ctx);
    if (typeof search !== "string") {
      throw new ScriptError("str.includes: expected string for search");
    }
    return str.includes(search);
  },
  "str.join": async (args, ctx) => {
    if (args.length !== 2) {
      throw new ScriptError("str.join: expected 2 arguments");
    }
    const [listExpr, sepExpr] = args;
    const list = await evaluate(listExpr, ctx);
    if (!Array.isArray(list)) {
      throw new ScriptError("str.join: expected array for list");
    }
    for (let i = 0; i < list.length; i++) {
      if (typeof list[i] === "object" || typeof list[i] === "function") {
        throw new ScriptError(
          `str.join: expected primitive for list element ${i}`,
        );
      }
    }
    const separator = await evaluate(sepExpr, ctx);
    if (typeof separator !== "string") {
      throw new ScriptError("str.join: expected string for separator");
    }
    return list.join(separator);
  },
};
