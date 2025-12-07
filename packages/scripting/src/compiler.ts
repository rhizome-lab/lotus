import { type ScriptContext, ScriptError, type ScriptOps, type ScriptValue } from "./types";
import { optimize } from "./optimizer";

const HELPERS = {
  chainedCompare: {
    "<": (...args: any[]) => {
      for (let idx = 0; idx < args.length - 1; idx += 1) {
        if (args[idx] >= args[idx + 1]) {
          return false;
        }
      }
      return true;
    },
    "<=": (...args: any[]) => {
      for (let idx = 0; idx < args.length - 1; idx += 1) {
        if (args[idx] > args[idx + 1]) {
          return false;
        }
      }
      return true;
    },
    ">": (...args: any[]) => {
      for (let idx = 0; idx < args.length - 1; idx += 1) {
        if (args[idx] <= args[idx + 1]) {
          return false;
        }
      }
      return true;
    },
    ">=": (...args: any[]) => {
      for (let idx = 0; idx < args.length - 1; idx += 1) {
        if (args[idx] < args[idx + 1]) {
          return false;
        }
      }
      return true;
    },
  },
  checkObjKey: (key: any) => {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      throw new ScriptError(`Security Error: Cannot access dangerous key "${key}"`);
    }
    return key;
  },
  "random.between": (min: number, max: number) => {
    if (min > max) {
      throw new ScriptError("random: min must be less than or equal to max");
    }
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },
  "random.choice": (list: any[]) => {
    if (!Array.isArray(list)) {
      return null;
    }
    if (list.length === 0) {
      return null;
    }
    return list[Math.floor(Math.random() * list.length)];
  },
  timeOffset: (amount: number, unit: string, base?: string) => {
    const date = new Date(base !== undefined ? base : new Date().toISOString());
    switch (unit) {
      case "year":
      case "years": {
        date.setFullYear(date.getFullYear() + amount);
        break;
      }
      case "month":
      case "months": {
        date.setMonth(date.getMonth() + amount);
        break;
      }
      case "day":
      case "days": {
        date.setDate(date.getDate() + amount);
        break;
      }
      case "hour":
      case "hours": {
        date.setHours(date.getHours() + amount);
        break;
      }
      case "minute":
      case "minutes": {
        date.setMinutes(date.getMinutes() + amount);
        break;
      }
      case "second":
      case "seconds": {
        date.setSeconds(date.getSeconds() + amount);
        break;
      }
      default: {
        throw new Error(`time.offset: unknown unit ${unit}`);
      }
    }
    return date.toISOString();
  },
  typeof: (val: any) => (Array.isArray(val) ? "array" : val === null ? "null" : typeof val),
};

export interface CompileOptions {
  optimize?: boolean;
}

export type CompileFn = (
  script: ScriptValue<any>,
  ops: ScriptOps,
  options: { optimize?: boolean },
) => (ctx: ScriptContext) => any;

/**
 * Compiles a script AST into a JavaScript function.
 *
 * @param script - The script AST to compile.
 * @param ops - The opcode registry to use for compilation.
 * @param options - Compiler options.
 * @returns A function that executes the script given a context.
 */
export function compile<Type>(
  script: ScriptValue<Type>,
  ops: ScriptOps,
  options: CompileOptions = {},
): (ctx: ScriptContext) => Type {
  const shouldOptimize = options.optimize ?? true;
  const compileFn: CompileFn = (scriptArg, opsArg, optionsArg) =>
    compile(scriptArg, opsArg, optionsArg);
  const optimizedScript = shouldOptimize ? optimize(script, compileFn) : script;
  const code = compileValue(optimizedScript, ops, true);
  // eslint-disable-next-line no-new-func
  return new Function(
    "__helpers__",
    `return function compiled(__ctx__) {
${code}}`,
  )(HELPERS);
}

const KEYWORDS = new Set([
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "new",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
  "enum",
  "implements",
  "interface",
  "let",
  "package",
  "private",
  "protected",
  "public",
  "static",
  "await",
  "null",
  "true",
  "false",
  "NaN",
  "Infinity",
  "undefined",
  "arguments",
  "eval",
  // Internal variables
  "__ctx__",
  "__ops__",
  "__helpers__",
]);

function toJSName(name: string): string {
  // Replace invalid characters with _
  let safe = name.replaceAll(/[^a-zA-Z0-9_$]/g, "_");
  // Cannot start with digit
  if (/^[0-9]/.test(safe)) {
    safe = `_${safe}`;
  }
  // Avoid keywords
  if (KEYWORDS.has(safe)) {
    return `_${safe}`;
  }
  return safe;
}

function compileChainedComparison(argExprs: string[], op: string): string {
  return argExprs.length < 2
    ? "true"
    : argExprs.length === 2
      ? `(${argExprs[0]} ${op} ${argExprs[1]})`
      : `__helpers__.chainedCompare["${op}"](${argExprs.join(", ")})`;
}

const SPECIAL_FORMS = new Set([
  "std.seq",
  "std.if",
  "std.while",
  "std.for",
  "std.let",
  "std.set",
  "std.break",
  "std.continue",
  "std.try",
  "std.var",
  "std.lambda",
  "std.quote",
  "obj.new",
]);

// Helper to check for dangerous keys at compile time
function validateKey(node: any) {
  if (typeof node === "string") {
    if (node === "__proto__" || node === "constructor" || node === "prototype") {
      throw new Error(`Security Error: Cannot access dangerous key "${node}"`);
    }
  }
}

function compileValue(node: any, ops: ScriptOps, shouldReturn = false): string {
  const prefix = shouldReturn ? "return " : "";
  if (!Array.isArray(node)) {
    if (
      node === null ||
      node === undefined ||
      typeof node === "number" ||
      typeof node === "boolean" ||
      typeof node === "string"
    ) {
      return `${prefix}${JSON.stringify(node)}`;
    }
    throw new Error(`Unknown node type ${typeof node}`);
  }
  const [op, ...args] = node;

  if (SPECIAL_FORMS.has(op)) {
    switch (op) {
      case "std.seq": {
        if (args.length === 0) {
          return "null";
        }
        let code = "";
        for (let idx = 0; idx < args.length; idx += 1) {
          const result = compileValue(args[idx], ops, shouldReturn && idx === args.length - 1);
          code += `${result}\n`;
        }
        return code;
      }
      case "std.if": {
        return `if (${compileValue(args[0], ops)}) {
${compileValue(args[1], ops, shouldReturn)}}${
          args[2]
            ? ` else {
${compileValue(args[2], ops, shouldReturn)}}`
            : shouldReturn
              ? `else {
return null}`
              : ""
        }`;
      }
      case "std.while": {
        return `while (${compileValue(args[0], ops)}) {
${compileValue(args[1], ops)}}`;
      }
      case "std.for": {
        return `for (const ${toJSName(args[0])} of ${compileValue(args[1], ops)}) {
${compileValue(args[2], ops)}}`;
      }
      case "std.let": {
        return `let ${toJSName(args[0])} = ${compileValue(args[1], ops)};`;
      }
      case "std.set": {
        return `${toJSName(args[0])} = ${compileValue(args[1], ops)};`;
      }
      case "std.break": {
        return "break;";
      }
      case "std.continue": {
        return "continue;";
      }
      case "std.try": {
        return `try {
${compileValue(args[0], ops, shouldReturn)}
} catch (${args[1]}) {
${compileValue(args[2], ops, shouldReturn)}
}`;
      }
      case "std.var": {
        return `${prefix}${toJSName(args[0])}`;
      }
      case "std.lambda": {
        return `(${(args[0] as string[]).map((name) => toJSName(name)).join(", ")}) => {
${compileValue(args[1], ops, true)}}`;
      }
      case "std.quote": {
        return `${prefix}${JSON.stringify(args[0])}`;
      }
      case "obj.new": {
        const props = [];
        for (const arg of args) {
          validateKey(arg[0]);
          const keyExpr = compileValue(arg[0], ops);
          const valExpr = compileValue(arg[1], ops);
          const isSafe = typeof arg[0] === "string" || typeof arg[0] === "number";
          props.push(`[${isSafe ? keyExpr : `__helpers__.checkObjKey(${keyExpr})`}]: ${valExpr}`);
        }
        return `${prefix}({ ${props.join(", ")} })`;
      }
    }
  }

  const compiledArgs = args.map((arg: any) => compileValue(arg, ops));

  switch (op) {
    case "std.return": {
      return `return ${compiledArgs[0] ?? "null"};`;
    }
    case "std.throw": {
      return `throw new Error(${compiledArgs[0]});`;
    }
    case "list.new": {
      return `${prefix}[${compiledArgs.join(", ")}]`;
    }
    case "std.apply": {
      return `${prefix}(${compiledArgs[0]})(${compiledArgs.slice(1).join(", ")})`;
    }
    case "+": {
      return `${prefix}(${compiledArgs.join(" + ")})`;
    }
    case "-": {
      return `${prefix}(${compiledArgs.join(" - ")})`;
    }
    case "*": {
      return `${prefix}(${compiledArgs.join(" * ")})`;
    }
    case "/": {
      return `${prefix}(${compiledArgs.join(" / ")})`;
    }
    case "%": {
      return `${prefix}(${compiledArgs.join(" % ")})`;
    }
    case "^": {
      return `${prefix}(${compiledArgs.join(" ** ")})`;
    }
    case "==": {
      return `${prefix}(${compiledArgs.join(" === ")})`;
    }
    case "!=": {
      return `${prefix}(${compiledArgs.join(" !== ")})`;
    }
    case "<": {
      return `${prefix}${compileChainedComparison(compiledArgs, "<")}`;
    }
    case ">": {
      return `${prefix}${compileChainedComparison(compiledArgs, ">")}`;
    }
    case "<=": {
      return `${prefix}${compileChainedComparison(compiledArgs, "<=")}`;
    }
    case ">=": {
      return `${prefix}${compileChainedComparison(compiledArgs, ">=")}`;
    }
    case "and": {
      return `${prefix}(${compiledArgs.join(" && ")})`;
    }
    case "or": {
      return `${prefix}(${compiledArgs.join(" || ")})`;
    }
    case "not": {
      return `${prefix}!${compiledArgs[0]}`;
    }
    case "std.log": {
      return `${prefix}console.log(${compiledArgs.join(", ")})`;
    }
    case "str.concat": {
      return `${prefix}("" + ${compiledArgs.join(" + ")})`;
    }
    case "std.this": {
      return `${prefix}__ctx__.this`;
    }
    case "std.caller": {
      return `${prefix}__ctx__.caller`;
    }
    case "std.arg": {
      return `${prefix}(__ctx__.args?.[${compiledArgs[0]}] ?? null)`;
    }
    case "std.args": {
      return `${prefix}[...(__ctx__.args ?? [])]`;
    }
    case "std.warn": {
      return `${prefix}__ctx__.warnings.push(String(${compiledArgs[0]}))`;
    }
    case "send": {
      return `${prefix}(__ctx__.send?.(${compiledArgs[0]}, ${compiledArgs[1]}) || null)`;
    }
    case "math.floor": {
      return `${prefix}Math.floor(${compiledArgs[0]})`;
    }
    case "math.ceil": {
      return `${prefix}Math.ceil(${compiledArgs[0]})`;
    }
    case "math.trunc": {
      return `${prefix}Math.trunc(${compiledArgs[0]})`;
    }
    case "math.round": {
      return `${prefix}Math.round(${compiledArgs[0]})`;
    }
    case "math.sin": {
      return `${prefix}Math.sin(${compiledArgs[0]})`;
    }
    case "math.cos": {
      return `${prefix}Math.cos(${compiledArgs[0]})`;
    }
    case "math.tan": {
      return `${prefix}Math.tan(${compiledArgs[0]})`;
    }
    case "math.asin": {
      return `${prefix}Math.asin(${compiledArgs[0]})`;
    }
    case "math.acos": {
      return `${prefix}Math.acos(${compiledArgs[0]})`;
    }
    case "math.atan": {
      return `${prefix}Math.atan(${compiledArgs[0]})`;
    }
    case "math.atan2": {
      return `${prefix}Math.atan2(${compiledArgs[0]}, ${compiledArgs[1]})`;
    }
    case "math.log": {
      return `${prefix}Math.log(${compiledArgs[0]})`;
    }
    case "math.log2": {
      return `${prefix}Math.log2(${compiledArgs[0]})`;
    }
    case "math.log10": {
      return `${prefix}Math.log10(${compiledArgs[0]})`;
    }
    case "math.exp": {
      return `${prefix}Math.exp(${compiledArgs[0]})`;
    }
    case "math.sqrt": {
      return `${prefix}Math.sqrt(${compiledArgs[0]})`;
    }
    case "math.abs": {
      return `${prefix}Math.abs(${compiledArgs[0]})`;
    }
    case "math.min": {
      return `${prefix}Math.min(${compiledArgs.join(", ")})`;
    }
    case "math.max": {
      return `${prefix}Math.max(${compiledArgs.join(", ")})`;
    }
    case "math.clamp": {
      return `${prefix}Math.min(Math.max(${compiledArgs[0]}, ${compiledArgs[1]}), ${compiledArgs[2]})`;
    }
    case "math.sign": {
      return `${prefix}Math.sign(${compiledArgs[0]})`;
    }
    case "random.number": {
      return `${prefix}Math.random()`;
    }
    case "random.between": {
      // Inline optimization for constant 0 min?
      return `${prefix}__helpers__["random.between"](${compiledArgs.join(", ")})`;
    }
    case "random.choice": {
      return `${prefix}__helpers__["random.choice"](${compiledArgs[0]})`;
    }
    case "list.len": {
      return `${prefix}${compiledArgs[0]}.length`;
    }
    case "list.empty": {
      return `${prefix}(${compiledArgs[0]}.length === 0)`;
    }
    case "list.get": {
      validateKey(args[1]);
      const [listExpr, keyExpr] = compiledArgs;
      const [, keyArg] = args;
      const isSafe = typeof keyArg === "string" || typeof keyArg === "number";
      return `${prefix}${listExpr}[${isSafe ? keyExpr : `__helpers__.checkObjKey(${keyExpr})`}]`;
    }
    case "list.set": {
      validateKey(args[1]);
      const [listExpr, keyExpr, valExpr] = compiledArgs;
      const [, keyArg] = args;
      const isSafe = typeof keyArg === "string" || typeof keyArg === "number";
      return `${prefix}(${listExpr}[${
        isSafe ? keyExpr : `__helpers__.checkObjKey(${keyExpr})`
      }] = ${valExpr})`;
    }
    case "list.push": {
      return `${prefix}${compiledArgs[0]}.push(${compiledArgs[1]})`;
    }
    case "list.pop": {
      return `${prefix}${compiledArgs[0]}.pop()`;
    }
    case "list.unshift": {
      return `${prefix}${compiledArgs[0]}.unshift(${compiledArgs[1]})`;
    }
    case "list.shift": {
      return `${prefix}${compiledArgs[0]}.shift()`;
    }
    case "list.slice": {
      return `${prefix}${compiledArgs[0]}.slice(${compiledArgs[1]}${
        compiledArgs[2] !== undefined ? `, ${compiledArgs[2]}` : ""
      })`;
    }
    case "list.splice": {
      const items = compiledArgs.slice(3);
      return `${prefix}${compiledArgs[0]}.splice(${compiledArgs[1]}, ${compiledArgs[2]}${
        items.length > 0 ? `, ${items.join(", ")}` : ""
      })`;
    }
    case "list.find": {
      return `${prefix}(${compiledArgs[0]}.find((item) => (${compiledArgs[1]})(item)) ?? null)`;
    }
    case "list.map": {
      return `${prefix}${compiledArgs[0]}.map((item) => (${compiledArgs[1]})(item))`;
    }
    case "list.filter": {
      return `${prefix}${compiledArgs[0]}.filter((item) => (${compiledArgs[1]})(item))`;
    }
    case "list.reduce": {
      return `${prefix}${compiledArgs[0]}.reduce((acc, item) => (${compiledArgs[1]})(acc, item), ${compiledArgs[2]})`;
    }
    case "list.flatMap": {
      return `${prefix}${compiledArgs[0]}.flatMap((item) => (${compiledArgs[1]})(item))`;
    }
    case "list.concat": {
      return `${prefix}[].concat(${compiledArgs.join(", ")})`;
    }
    case "list.includes": {
      return `${prefix}${compiledArgs[0]}.includes(${compiledArgs[1]})`;
    }
    case "list.reverse": {
      return `${prefix}${compiledArgs[0]}.toReversed()`;
    }
    case "list.sort": {
      return `${prefix}${compiledArgs[0]}.toSorted()`;
    }
    case "obj.get": {
      validateKey(args[1]);
      const [objExpr, keyExpr, defExpr] = compiledArgs;
      const [, keyArg] = args;
      const isSafe = typeof keyArg === "string" || typeof keyArg === "number";
      return `${prefix}((${objExpr})[${
        isSafe ? keyExpr : `__helpers__.checkObjKey(${keyExpr})`
      }] ?? ${defExpr !== undefined ? defExpr : "null"})`;
    }
    case "obj.set": {
      validateKey(args[1]);
      const [objExpr, keyExpr, valExpr] = compiledArgs;
      const [, keyArg] = args;
      const isSafe = typeof keyArg === "string" || typeof keyArg === "number";
      return `${prefix}((${objExpr})[${
        isSafe ? keyExpr : `__helpers__.checkObjKey(${keyExpr})`
      }] = ${valExpr})`;
    }
    case "obj.has": {
      validateKey(args[1]);
      const [objExpr, keyExpr] = compiledArgs;
      const [, keyArg] = args;
      const isSafe = typeof keyArg === "string" || typeof keyArg === "number";
      return `${prefix}(${isSafe ? keyExpr : `__helpers__.checkObjKey(${keyExpr})`} in ${objExpr})`;
    }
    case "obj.del": {
      validateKey(args[1]);
      const [objExpr, keyExpr] = compiledArgs;
      const [, keyArg] = args;
      const isSafe = typeof keyArg === "string" || typeof keyArg === "number";
      return `${prefix}(delete ${objExpr}[${
        isSafe ? keyExpr : `__helpers__.checkObjKey(${keyExpr})`
      }])`;
    }
    case "obj.keys": {
      return `${prefix}Object.getOwnPropertyNames(${compiledArgs[0]})`;
    }
    case "obj.values": {
      return `${prefix}Object.getOwnPropertyNames(${compiledArgs[0]}).map(k => ${compiledArgs[0]}[k])`;
    }
    case "obj.entries": {
      return `${prefix}Object.getOwnPropertyNames(${compiledArgs[0]}).map(k => [k, ${compiledArgs[0]}[k]])`;
    }
    case "obj.merge": {
      return `${prefix}Object.assign({}, ${compiledArgs.join(", ")})`;
    }
    case "obj.map": {
      return `${prefix}Object.fromEntries(Object.entries(${compiledArgs[0]}).map(([k, v]) => [k, (${compiledArgs[1]})(v, k)]))`;
    }
    case "obj.filter": {
      return `${prefix}Object.fromEntries(Object.entries(${compiledArgs[0]}).filter(([k, v]) => (${compiledArgs[1]})(v, k)))`;
    }
    case "obj.reduce": {
      return `${prefix}Object.entries(${compiledArgs[0]}).reduce((acc, [k, v]) => (${compiledArgs[1]})(acc, v, k), ${compiledArgs[2]})`;
    }
    case "obj.flatMap": {
      return `${prefix}Object.entries(${compiledArgs[0]}).reduce((acc, [k, v]) => {
        const res = (${compiledArgs[1]})(v, k);
        if (res && typeof res === 'object' && !Array.isArray(res)) Object.assign(acc, res);
        return acc;
      }, {})`;
    }
    case "json.stringify": {
      return `${prefix}JSON.stringify(${compiledArgs[0]})`;
    }
    case "json.parse": {
      return `${prefix}JSON.parse(${compiledArgs[0]})`;
    }
    case "std.typeof": {
      return `${prefix}__helpers__.typeof(${compiledArgs[0]})`;
    }
    case "str.len": {
      return `${prefix}${compiledArgs[0]}.length`;
    }
    case "str.split": {
      return `${prefix}${compiledArgs[0]}.split(${compiledArgs[1]})`;
    }
    case "str.slice": {
      return `${prefix}${compiledArgs[0]}.slice(${compiledArgs[1]}, ${
        compiledArgs[2] !== undefined ? compiledArgs[2] : "undefined"
      })`;
    }
    case "str.upper": {
      return `${prefix}${compiledArgs[0]}.toUpperCase()`;
    }
    case "str.lower": {
      return `${prefix}${compiledArgs[0]}.toLowerCase()`;
    }
    case "str.trim": {
      return `${prefix}${compiledArgs[0]}.trim()`;
    }
    case "str.replace": {
      return `${prefix}${compiledArgs[0]}.replace(${compiledArgs[1]}, ${
        compiledArgs[2] !== undefined ? compiledArgs[2] : "undefined"
      })`;
    }
    case "str.includes": {
      return `${prefix}${compiledArgs[0]}.includes(${compiledArgs[1]})`;
    }
    case "str.join": {
      return `${prefix}${compiledArgs[0]}.join(${compiledArgs[1]})`;
    }
    case "time.now": {
      return `${prefix}new Date().toISOString()`;
    }
    case "time.format": {
      return `${prefix}new Date(${compiledArgs[0]}).toISOString()`;
    }
    case "time.parse": {
      return `${prefix}new Date(${compiledArgs[0]}).toISOString()`;
    }
    case "time.from_timestamp": {
      return `${prefix}new Date(${compiledArgs[0]}).toISOString()`;
    }
    case "time.to_timestamp": {
      return `${prefix}new Date(${compiledArgs[0]}).getTime()`;
    }
    case "time.offset": {
      const [amount, unit, base] = compiledArgs;
      return `${prefix}__helpers__.timeOffset(${amount}, ${unit}${base ? `, ${base}` : ""})`;
    }
    case "std.int": {
      return `${prefix}parseInt(${compiledArgs[0]}, ${
        compiledArgs[1] !== undefined ? compiledArgs[1] : 10
      })`;
    }
    case "std.float": {
      return `${prefix}parseFloat(${compiledArgs[0]})`;
    }
    case "std.number": {
      return `${prefix}Number(${compiledArgs[0]})`;
    }
    case "std.string": {
      return `${prefix}String(${compiledArgs[0]})`;
    }
    case "std.boolean": {
      return `${prefix}Boolean(${compiledArgs[0]})`;
    }
    default: {
      const def = ops[op];
      if (!def) {
        throw new ScriptError(`Unknown opcode: ${op}`);
      }
      return `__ctx__.ops[${JSON.stringify(op)}].handler(${
        def.metadata.lazy ? JSON.stringify(args) : `[${compiledArgs.join(", ")}]`
      }, __ctx__)`;
    }
  }
}
