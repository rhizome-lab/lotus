import { OPS } from "./interpreter";
import { ScriptContext, ScriptError, ScriptValue } from "./types";

/**
 * Compiles a ViwoScript AST into a JavaScript function.
 *
 * @param script The script to compile.
 * @returns A function that takes a ScriptContext and returns a Promise resolving to the result.
 */
export function compile<T>(script: ScriptValue<T>): (ctx: ScriptContext) => T {
  const ctxState = { tempIdx: 0 };
  const code = compileStatements(script, ctxState);
  const body = `\
return function compiled(ctx) {
${code}}`;
  return new Function("OPS", "ScriptError", body)(OPS, ScriptError);
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
  "ctx",
  "OPS",
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

interface CtxState {
  tempIdx: number;
}

function genTemp(state: CtxState): string {
  return `_t${state.tempIdx++}`;
}

function compileExpression(node: any, state: CtxState): string {
  if (node === null || node === undefined) {
    return "null";
  }

  if (typeof node === "number" || typeof node === "boolean") {
    return String(node);
  }

  if (typeof node === "string") {
    return JSON.stringify(node);
  }

  if (Array.isArray(node)) {
    if (node.length === 0) return "[]";

    const [op, ...args] = node;

    // Control flow constructs that need hoisting
    if (
      ["seq", "if", "while", "for", "let", "set", "try", "break", "return", "throw"].includes(op)
    ) {
      return compileStatements(node, state);
    }

    if (op === "var") {
      return toJSName(args[0]);
    }

    if (op === "lambda") {
      return compileLambda(args);
    }

    if (op === "list.new") {
      const compiledArgs = args.map((a) => compileExpression(a, state));
      return `[${compiledArgs.join(", ")}]`;
    }

    if (op === "obj.new") {
      return compileObjNew(args, state);
    }

    if (typeof op === "string" && OPS[op]) {
      return compileOpcodeCall(op, args, state);
    }

    throw new Error(`Unknown opcode: ${op}`);
  }

  throw new Error(`Unknown node type: ${typeof node}`);
}

function compileStatements(node: any, state: CtxState): string {
  if (Array.isArray(node)) {
    const [op, ...args] = node;
    switch (op) {
      case "seq":
        return compileSeq(args, state);
      case "if":
        return compileIf(args, state);
      case "while":
        return compileWhile(args, state);
      case "for":
        return compileFor(args, state);
      case "let":
        return compileLet(args, state);
      case "set":
        return compileSet(args, state);
      case "break":
        return compileBreak(args, state);
      case "return":
        return compileReturn(args, state);
      case "throw":
        return compileThrow(args, state);
      case "try":
        return compileTry(args, state);
    }
  }

  // Default: compile as expression
  return `return ${compileExpression(node, state)}`;
}

function compileSeq(args: any[], state: CtxState): string {
  if (args.length === 0) return "null";
  let code = "";
  for (let i = 0; i < args.length; i++) {
    const result = compileStatements(args[i], state);
    code += result + "\n";
  }
  return code;
}

function compileIf(args: any[], state: CtxState): string {
  const [cond, thenBranch, elseBranch] = args;
  const condExpr = compileExpression(cond, state);
  const thenCode = compileStatements(thenBranch, state);
  const elseCode = elseBranch ? compileStatements(elseBranch, state) : "";

  const resultVar = genTemp(state);

  return `\
let ${resultVar} = null;
if (${condExpr}) {
${resultVar} = ${thenCode};} else {
${resultVar} = ${elseCode};}`;
}

function compileWhile(args: any[], state: CtxState): string {
  return `\
while (${compileExpression(args[0], state)}) {
${compileStatements(args[1], state)}}`;
}

function compileFor(args: any[], state: CtxState): string {
  const [varName, listExpr, body] = args;
  const listExprRes = compileExpression(listExpr, state);
  const loopVar = toJSName(varName);
  const bodyCode = compileStatements(body, state);
  return `\
for (const ${loopVar} of ${listExprRes}) {
${bodyCode}}`;
}

function compileLet(args: any[], state: CtxState): string {
  const [name, val] = args;
  const jsName = toJSName(name);
  const valExpr = compileExpression(val, state);
  return `let ${jsName} = ${valExpr};`;
}

function compileSet(args: any[], state: CtxState): string {
  const [name, val] = args;
  const jsName = toJSName(name);
  const valExpr = compileExpression(val, state);
  return `${jsName} = ${valExpr};`;
}

function compileBreak(_args: any[], _state: CtxState): string {
  return "break;";
}

function compileReturn(args: any[], state: CtxState): string {
  const [val] = args;
  if (val) {
    const valExpr = compileExpression(val, state);
    return `return ${valExpr};`;
  }
  return "return null;";
}

function compileThrow(args: any[], state: CtxState): string {
  const [msg] = args;
  const msgExpr = compileExpression(msg, state);
  return `throw new ScriptError(${msgExpr});`;
}

function compileTry(args: any[], state: CtxState): string {
  const [tryBlock, errorVar, catchBlock] = args;
  const tryCode = compileStatements(tryBlock, state);
  const catchCode = compileStatements(catchBlock, state);
  const errDecl = errorVar ? `let ${toJSName(errorVar)} = e.message || String(e);` : "";
  const resultVar = genTemp(state);
  return `\
let ${resultVar} = null;
try {
  ${resultVar} = ${tryCode}
} catch (e) {
  ${resultVar} = ${errDecl}
  ${catchCode}
}`;
}

function compileLambda(args: any[]): string {
  const [params, body] = args;
  const paramNames = (params as string[]).map(toJSName);
  const lambdaState = { tempIdx: 0 }; // Fresh state for lambda
  const code = compileStatements(body, lambdaState);

  // TODO: How to fix this
  return `({
    type: "lambda",
    args: ${JSON.stringify(params)},
    execute: (ctx) => {
      ${paramNames.map((p) => `let ${p} = ctx.vars[${JSON.stringify(p)}];`).join("\n")}
      ${code}
    }
  })`;
}

function compileObjNew(args: any[], state: CtxState): string {
  const props = [];
  for (const arg of args) {
    const keyExpr = compileExpression(arg[0], state);
    const valExpr = compileExpression(arg[1], state);
    props.push(`[${keyExpr}]: ${valExpr}`);
  }
  return `({ ${props.join(", ")} })`;
}

function compileChainedComparison(argExprs: string[], op: string): string {
  if (argExprs.length < 2) {
    return "true"; // Or error?
  }
  const parts: string[] = [];
  // TODO: This duplicates expression evaluation which is VERY dangerous.
  // We should evaluate each expression only once.
  for (let i = 0; i < argExprs.length - 1; i++) {
    parts.push(`(${argExprs[i]} ${op} ${argExprs[i + 1]})`);
  }
  return `(${parts.join(" && ")})`;
}

function compileOpcodeCall(op: string, args: any[], state: CtxState): string {
  if (op === "quote") {
    return JSON.stringify(args[0]);
  }
  const argExprs = args.map((a) => compileExpression(a, state));

  switch (op) {
    case "+":
      return `(${argExprs.join(" + ")})`;
    case "-":
      return `(${argExprs.join(" - ")})`;
    case "*":
      return `(${argExprs.join(" * ")})`;
    case "/":
      return `(${argExprs.join(" / ")})`;
    case "%":
      return `(${argExprs.join(" % ")})`;
    case "^":
      return `(${argExprs.join(" ** ")})`;
    case "==":
      return `(${argExprs.join(" === ")})`;
    case "!=":
      return `(${argExprs.join(" !== ")})`;
    case "<":
      return compileChainedComparison(argExprs, "<");
    case ">":
      return compileChainedComparison(argExprs, ">");
    case "<=":
      return compileChainedComparison(argExprs, "<=");
    case ">=":
      return compileChainedComparison(argExprs, ">=");
    case "and":
      return `(${argExprs.join(" && ")})`;
    case "or":
      return `(${argExprs.join(" || ")})`;
    case "not":
      return `!${argExprs[0]}`;
    case "obj.get":
      return `((${argExprs[0]})[${argExprs[1]}] ?? ${args[2] ? argExprs[2] : "null"})`;
    case "obj.set":
      return `((${argExprs[0]})[${argExprs[1]}] = ${argExprs[2]})`;
    case "obj.has":
      return `(${argExprs[1]} in ${argExprs[0]})`;
    case "obj.del":
      return `(delete ${argExprs[0]}[${argExprs[1]}])`;
    case "log":
      return `console.log(${argExprs.join(", ")})`;
    case "str.concat":
      return `("" + ${argExprs.join(" + ")}`;
    case "this":
      return "ctx.this";
    case "caller":
      return "ctx.caller";

    // List Opcodes
    case "list.len":
      return `${argExprs[0]}.length`;
    case "list.empty":
      return `(${argExprs[0]}.length === 0)`;
    case "list.get":
      return `${argExprs[0]}[${argExprs[1]}]`;
    case "list.set":
      return `(${argExprs[0]}[${argExprs[1]}] = ${argExprs[2]})`;
    case "list.push":
      return `${argExprs[0]}.push(${argExprs[1]})`;
    case "list.pop":
      return `${argExprs[0]}.pop()`;
    case "list.unshift":
      return `${argExprs[0]}.unshift(${argExprs[1]})`;
    case "list.shift":
      return `${argExprs[0]}.shift()`;
    case "list.slice":
      return `${argExprs[0]}.slice(${argExprs[1]}${args[2] ? `, ${argExprs[2]}` : ""})`;
    case "list.splice": {
      // remaining args are items // args[0] is list, args[1] is start, args[2] is deleteCount // list.splice(list, start, deleteCount, ...items)
      const items = argExprs.slice(3);
      return `${argExprs[0]}.splice(${argExprs[1]}, ${argExprs[2]}${
        items.length > 0 ? ", " + items.join(", ") : ""
      })`;
    }
    case "list.concat":
      return `[].concat(${argExprs.join(", ")})`;
    case "list.includes":
      return `${argExprs[0]}.includes(${argExprs[1]})`;
    case "list.reverse":
      return `${argExprs[0]}.reverse()`;
    case "list.sort":
      return `${argExprs[0]}.sort()`;
    case "list.join":
      return `${argExprs[0]}.join(${argExprs[1]})`;

    // Object Opcodes
    case "obj.keys":
      return `Object.getOwnPropertyNames(${argExprs[0]})`;
    case "obj.values":
      return `Object.getOwnPropertyNames(${argExprs[0]}).map(k => ${argExprs[0]}[k])`;
    case "obj.entries":
      return `Object.getOwnPropertyNames(${argExprs[0]}).map(k => [k, ${argExprs[0]}[k]])`;
    case "obj.merge":
      return `Object.assign({}, ${argExprs.join(", ")})`;

    // String Opcodes
    case "str.len":
      return `${argExprs[0]}.length`;
    case "str.split":
      return `${argExprs[0]}.split(${argExprs[1]})`;
    case "str.slice":
      return `${argExprs[0]}.slice(${argExprs[1]}, ${args[2] ? argExprs[2] : "undefined"})`;
    case "str.upper":
      return `${argExprs[0]}.toUpperCase()`;
    case "str.lower":
      return `${argExprs[0]}.toLowerCase()`;
    case "str.trim":
      return `${argExprs[0]}.trim()`;
    case "str.replace":
      return `${argExprs[0]}.replace(${argExprs[1]}, ${args[2] ? argExprs[2] : "undefined"})`;
    case "str.includes":
      return `${argExprs[0]}.includes(${argExprs[1]})`;
    case "str.join":
      return `${argExprs[0]}.join(${argExprs[1]})`;
  }

  const def = OPS[op];
  if (!def) throw new ScriptError("Unknown opcode: " + op);

  if (def.metadata.lazy) {
    return `OPS[${JSON.stringify(op)}].handler(${JSON.stringify(args)}, ctx)`;
  }

  return `OPS[${JSON.stringify(op)}].handler([${argExprs.join(", ")}], ctx)`;
}
