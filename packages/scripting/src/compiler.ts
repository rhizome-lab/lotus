import { OPS } from "./interpreter";
import { ScriptContext, ScriptError, ScriptValue } from "./types";

const chainedCompare = {
  ["<"]: (...args: any[]) => {
    for (let i = 0; i < args.length - 1; i++) {
      if (args[i] >= args[i + 1]) {
        return false;
      }
    }
    return true;
  },
  [">"]: (...args: any[]) => {
    for (let i = 0; i < args.length - 1; i++) {
      if (args[i] <= args[i + 1]) {
        return false;
      }
    }
    return true;
  },
  ["<="]: (...args: any[]) => {
    for (let i = 0; i < args.length - 1; i++) {
      if (args[i] > args[i + 1]) {
        return false;
      }
    }
    return true;
  },
  [">="]: (...args: any[]) => {
    for (let i = 0; i < args.length - 1; i++) {
      if (args[i] < args[i + 1]) {
        return false;
      }
    }
    return true;
  },
};

/**
 * Compiles a ViwoScript AST into a JavaScript function.
 *
 * @param script The script to compile.
 * @returns A function that takes a ScriptContext and returns a Promise resolving to the result.
 */
export function compile<T>(script: ScriptValue<T>): (ctx: ScriptContext) => T {
  return new Function(
    "__ops__",
    "__chained_compare__",
    `return function compiled(__ctx__) {
${compileValue(script, true)}}`,
  )(OPS, chainedCompare);
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
  "__chained_compare__",
]);

function toJSName(name: string): string {
  // Replace invalid characters with _
  let safe = name.replace(/[^a-zA-Z0-9_$]/g, "_");

  // Cannot start with digit
  if (/^[0-9]/.test(safe)) {
    safe = "_" + safe;
  }

  // Avoid keywords
  if (KEYWORDS.has(safe)) {
    return "_" + safe;
  }

  return safe;
}

function compileChainedComparison(argExprs: string[], op: string): string {
  return argExprs.length < 2
    ? "true"
    : argExprs.length === 2
      ? `(${argExprs[0]} ${op} ${argExprs[1]})`
      : `__chained_compare__["${op}"](${argExprs.join(", ")})`;
}

function compileValue(node: any, shouldReturn = false): string {
  const prefix = shouldReturn ? "return " : "";
  if (!Array.isArray(node)) {
    if (
      node === null ||
      node === undefined ||
      typeof node === "number" ||
      typeof node === "boolean" ||
      typeof node === "string"
    ) {
      return `${prefix}${JSON.stringify(node ?? null)}`;
    }
    throw new Error(`Unknown node type ${typeof node}`);
  }
  const [op, ...args] = node;
  switch (op) {
    case "seq":
      if (args.length === 0) return "null";
      let code = "";
      for (let i = 0; i < args.length; i++) {
        const result = compileValue(args[i], shouldReturn && i === args.length - 1);
        code += result + "\n";
      }
      return code;
    case "if":
      return `if (${compileValue(args[0])}) {
${compileValue(args[1], shouldReturn)}}${
        args[2]
          ? ` else {
${compileValue(args[2], shouldReturn)}}`
          : shouldReturn
            ? `else {
return null}`
            : ""
      }`;
    case "while":
      return `while (${compileValue(args[0])}) {
${compileValue(args[1])}}`;
    case "for":
      return `for (const ${toJSName(args[0])} of ${compileValue(args[1])}) {
${compileValue(args[2])}}`;
    case "let":
      return `let ${toJSName(args[0])} = ${compileValue(args[1])};`;
    case "set":
      return `${toJSName(args[0])} = ${compileValue(args[1])};`;
    case "break":
      return "break;";
    case "continue":
      return "continue;";
    case "return":
      return `return ${args[0] ? compileValue(args[0]) : "null"};`;
    case "throw":
      return `throw ${compileValue(args[0])};`;
    case "try":
      return `try {
${compileValue(args[0], shouldReturn)}
} catch (${args[1]}) {
${compileValue(args[2], shouldReturn)}
}`;
    case "var":
      return `${prefix}${toJSName(args[0])}`;
    case "lambda":
      return `(${(args[0] as string[]).map((name) => toJSName(name)).join(", ")}) => {
${compileValue(args[1], true)}}`;
    case "quote":
      return `${prefix}${JSON.stringify(args[0])}`;
    case "list.new":
      const compiledArgs = args.map((a) => compileValue(a));
      return `${prefix}[${compiledArgs.join(", ")}]`;
    case "obj.new":
      const props = [];
      for (const arg of args) {
        const keyExpr = compileValue(arg[0]);
        const valExpr = compileValue(arg[1]);
        props.push(`[${keyExpr}]: ${valExpr}`);
      }
      return `${prefix}({ ${props.join(", ")} })`;
  }
  const exprs = args.map((a) => compileValue(a));
  switch (op) {
    case "apply":
      return `${prefix}(${exprs[0]})(${exprs.slice(1).join(", ")})`;
    case "+":
      return `${prefix}(${exprs.join(" + ")})`;
    case "-":
      return `${prefix}(${exprs.join(" - ")})`;
    case "*":
      return `${prefix}(${exprs.join(" * ")})`;
    case "/":
      return `${prefix}(${exprs.join(" / ")})`;
    case "%":
      return `${prefix}(${exprs.join(" % ")})`;
    case "^":
      return `${prefix}(${exprs.join(" ** ")})`;
    case "==":
      return `${prefix}(${exprs.join(" === ")})`;
    case "!=":
      return `${prefix}(${exprs.join(" !== ")})`;
    case "<":
      return `${prefix}${compileChainedComparison(exprs, "<")}`;
    case ">":
      return `${prefix}${compileChainedComparison(exprs, ">")}`;
    case "<=":
      return `${prefix}${compileChainedComparison(exprs, "<=")}`;
    case ">=":
      return `${prefix}${compileChainedComparison(exprs, ">=")}`;
    case "and":
      return `${prefix}(${exprs.join(" && ")})`;
    case "or":
      return `${prefix}(${exprs.join(" || ")})`;
    case "not":
      return `${prefix}!${exprs[0]}`;
    case "log":
      return `${prefix}console.log(${exprs.join(", ")})`;
    case "str.concat":
      return `${prefix}("" + ${exprs.join(" + ")}`;
    case "this":
      return `${prefix}__ctx__.this`;
    case "caller":
      return `${prefix}__ctx__.caller`;

    // System Opcodes
    case "arg":
      return `${prefix}(__ctx__.args?.[${exprs[0]}] ?? null)`;
    case "args":
      return `${prefix}[...(__ctx__.args ?? [])]`;
    case "warn":
      return `${prefix}__ctx__.warnings.push(String(${exprs[0]}))`;
    case "send":
      return `${prefix}(__ctx__.send?.(${exprs[0]}, ${exprs[1]}) || null)`;

    // Math Opcodes
    case "math.floor":
      return `${prefix}Math.floor(${exprs[0]})`;
    case "math.ceil":
      return `${prefix}Math.ceil(${exprs[0]})`;
    case "math.trunc":
      return `${prefix}Math.trunc(${exprs[0]})`;
    case "math.round":
      return `${prefix}Math.round(${exprs[0]})`;
    case "math.sin":
      return `${prefix}Math.sin(${exprs[0]})`;
    case "math.cos":
      return `${prefix}Math.cos(${exprs[0]})`;
    case "math.tan":
      return `${prefix}Math.tan(${exprs[0]})`;
    case "math.asin":
      return `${prefix}Math.asin(${exprs[0]})`;
    case "math.acos":
      return `${prefix}Math.acos(${exprs[0]})`;
    case "math.atan":
      return `${prefix}Math.atan(${exprs[0]})`;
    case "math.atan2":
      return `${prefix}Math.atan2(${exprs[0]}, ${exprs[1]})`;
    case "math.log":
      return `${prefix}Math.log(${exprs[0]})`;
    case "math.log2":
      return `${prefix}Math.log2(${exprs[0]})`;
    case "math.log10":
      return `${prefix}Math.log10(${exprs[0]})`;
    case "math.exp":
      return `${prefix}Math.exp(${exprs[0]})`;
    case "math.sqrt":
      return `${prefix}Math.sqrt(${exprs[0]})`;
    case "math.abs":
      return `${prefix}Math.abs(${exprs[0]})`;
    case "math.min":
      return `${prefix}Math.min(${exprs.join(", ")})`;
    case "math.max":
      return `${prefix}Math.max(${exprs.join(", ")})`;
    case "math.clamp":
      return `${prefix}Math.min(Math.max(${exprs[0]}, ${exprs[1]}), ${exprs[2]})`;
    case "math.sign":
      return `${prefix}Math.sign(${exprs[0]})`;

    case "random": {
      // Inline implementation of random using IIFE to handle variable arguments and integer checks
      const argsArray = `[${exprs.join(", ")}]`;
      return `${prefix}(() => {
        const args = ${argsArray};
        if (args.length === 0) return Math.random();
        let min = 0, max = 1;
        if (args.length === 1) max = args[0];
        else [min, max] = args;
        if (min > max) throw new Error("random: min must be less than or equal to max");
        const roll = Math.random() * (max - min + 1) + min;
        const shouldFloor = Number.isInteger(min) && Number.isInteger(max);
        return shouldFloor ? Math.floor(roll) : roll;
      })()`;
    }

    // List Opcodes
    case "list.len":
      return `${prefix}${exprs[0]}.length`;
    case "list.empty":
      return `${prefix}(${exprs[0]}.length === 0)`;
    case "list.get":
      return `${prefix}${exprs[0]}[${exprs[1]}]`;
    case "list.set":
      return `${prefix}(${exprs[0]}[${exprs[1]}] = ${exprs[2]})`;
    case "list.push":
      return `${prefix}${exprs[0]}.push(${exprs[1]})`;
    case "list.pop":
      return `${prefix}${exprs[0]}.pop()`;
    case "list.unshift":
      return `${prefix}${exprs[0]}.unshift(${exprs[1]})`;
    case "list.shift":
      return `${prefix}${exprs[0]}.shift()`;
    case "list.slice":
      return `${prefix}${exprs[0]}.slice(${exprs[1]}${args[2] ? `, ${exprs[2]}` : ""})`;
    case "list.splice": {
      const items = exprs.slice(3);
      return `${prefix}${exprs[0]}.splice(${exprs[1]}, ${exprs[2]}${
        items.length > 0 ? ", " + items.join(", ") : ""
      })`;
    }
    case "list.find":
      return `${prefix}(${exprs[0]}.find((item) => (${exprs[1]})(item)) ?? null)`;
    case "list.map":
      return `${prefix}${exprs[0]}.map((item) => (${exprs[1]})(item))`;
    case "list.filter":
      return `${prefix}${exprs[0]}.filter((item) => (${exprs[1]})(item))`;
    case "list.reduce":
      return `${prefix}${exprs[0]}.reduce((acc, item) => (${exprs[1]})(acc, item), ${exprs[2]})`;
    case "list.flatMap":
      return `${prefix}${exprs[0]}.flatMap((item) => (${exprs[1]})(item))`;
    case "list.concat":
      return `${prefix}[].concat(${exprs.join(", ")})`;
    case "list.includes":
      return `${prefix}${exprs[0]}.includes(${exprs[1]})`;
    case "list.reverse":
      return `${prefix}${exprs[0]}.reverse()`;
    case "list.sort":
      return `${prefix}${exprs[0]}.sort()`;

    // Object Opcodes
    case "obj.get":
      return `${prefix}((${exprs[0]})[${exprs[1]}] ?? ${args[2] ? exprs[2] : "null"})`;
    case "obj.set":
      return `${prefix}((${exprs[0]})[${exprs[1]}] = ${exprs[2]})`;
    case "obj.has":
      return `${prefix}(${exprs[1]} in ${exprs[0]})`;
    case "obj.del":
      return `${prefix}(delete ${exprs[0]}[${exprs[1]}])`;
    case "obj.keys":
      return `${prefix}Object.getOwnPropertyNames(${exprs[0]})`;
    case "obj.values":
      return `${prefix}Object.getOwnPropertyNames(${exprs[0]}).map(k => ${exprs[0]}[k])`;
    case "obj.entries":
      return `${prefix}Object.getOwnPropertyNames(${exprs[0]}).map(k => [k, ${exprs[0]}[k]])`;
    case "obj.merge":
      return `${prefix}Object.assign({}, ${exprs.join(", ")})`;
    case "obj.map":
      return `${prefix}Object.fromEntries(Object.entries(${exprs[0]}).map(([k, v]) => [k, (${exprs[1]})(v, k)]))`;
    case "obj.filter":
      return `${prefix}Object.fromEntries(Object.entries(${exprs[0]}).filter(([k, v]) => (${exprs[1]})(v, k)))`;
    case "obj.reduce":
      return `${prefix}Object.entries(${exprs[0]}).reduce((acc, [k, v]) => (${exprs[1]})(acc, v, k), ${exprs[2]})`;
    case "obj.flatMap":
      return `${prefix}Object.entries(${exprs[0]}).reduce((acc, [k, v]) => {
        const res = (${exprs[1]})(v, k);
        if (res && typeof res === 'object' && !Array.isArray(res)) Object.assign(acc, res);
        return acc;
      }, {})`;

    // JSON Opcodes
    case "json.stringify":
      return `${prefix}JSON.stringify(${exprs[0]})`;
    case "json.parse":
      // Need to handle try-catch for parse? The lib opcode wraps in try-catch returning null.
      // We can use an IIFE or ternary if we want to be safe, or just call JSON.parse directly if we trust input.
      // The lib implementation: try { return JSON.parse(str); } catch { return null; }
      return `${prefix}(() => { try { return JSON.parse(${exprs[0]}); } catch { return null; } })()`;
    case "typeof":
      return `${prefix}((val) => Array.isArray(val) ? "array" : val === null ? "null" : typeof val)(${exprs[0]})`;

    // String Opcodes
    case "str.len":
      return `${prefix}${exprs[0]}.length`;
    case "str.split":
      return `${prefix}${exprs[0]}.split(${exprs[1]})`;
    case "str.slice":
      return `${prefix}${exprs[0]}.slice(${exprs[1]}, ${args[2] ? exprs[2] : "undefined"})`;
    case "str.upper":
      return `${prefix}${exprs[0]}.toUpperCase()`;
    case "str.lower":
      return `${prefix}${exprs[0]}.toLowerCase()`;
    case "str.trim":
      return `${prefix}${exprs[0]}.trim()`;
    case "str.replace":
      return `${prefix}${exprs[0]}.replace(${exprs[1]}, ${args[2] ? exprs[2] : "undefined"})`;
    case "str.includes":
      return `${prefix}${exprs[0]}.includes(${exprs[1]})`;
    case "str.join":
      return `${prefix}${exprs[0]}.join(${exprs[1]})`;

    // Time Opcodes
    case "time.now":
      return `${prefix}new Date().toISOString()`;
    case "time.format":
      return `${prefix}new Date(${exprs[0]}).toISOString()`;
    case "time.parse":
      return `${prefix}new Date(${exprs[0]}).toISOString()`;
    case "time.from_timestamp":
      return `${prefix}new Date(${exprs[0]}).toISOString()`;
    case "time.to_timestamp":
      return `${prefix}new Date(${exprs[0]}).getTime()`;
    case "time.offset":
      const [amount, unit, base] = exprs;
      return `${prefix}(() => {
        const d = new Date(${base} !== undefined ? ${base} : new Date().toISOString());
        const amt = ${amount};
        switch (${unit}) {
          case "year": case "years": d.setFullYear(d.getFullYear() + amt); break;
          case "month": case "months": d.setMonth(d.getMonth() + amt); break;
          case "day": case "days": d.setDate(d.getDate() + amt); break;
          case "hour": case "hours": d.setHours(d.getHours() + amt); break;
          case "minute": case "minutes": d.setMinutes(d.getMinutes() + amt); break;
          case "second": case "seconds": d.setSeconds(d.getSeconds() + amt); break;
          default: throw new Error("time.offset: unknown unit " + ${unit});
        }
        return d.toISOString();
      })()`;
  }
  const def = OPS[op];
  if (!def) throw new ScriptError("Unknown opcode: " + op);
  return `__ops__[${JSON.stringify(op)}].handler(${
    def.metadata.lazy ? JSON.stringify(args) : `[${exprs.join(", ")}]`
  }, __ctx__)`;
}
