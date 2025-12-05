import { OPS } from "./interpreter";
import { ScriptContext, ScriptError, ScriptValue } from "./types";

/**
 * Compiles a ViwoScript AST into a JavaScript function.
 *
 * @param script The script to compile.
 * @returns A function that takes a ScriptContext and returns a Promise resolving to the result.
 */
export function compile<T>(script: ScriptValue<T>): (ctx: ScriptContext) => T {
  // Collect ALL variables used in the script (free or bound)
  const allVars = collectAllVars(script);

  // Declaration: let x = ctx.vars['x'] ?? null;
  const decls =
    allVars.length > 0
      ? `let ${allVars
          .map((v) => `${toJSName(v)} = ctx.vars[${JSON.stringify(v)}] ?? null`)
          .join(", ")};`
      : "";

  const ctxState = { tempIdx: 0 };
  const { code, result } = compileStatements(script, ctxState);

  const body = `\
return function compiled(ctx) {
  ${decls}
  let result = null;
  try {
    ${code}
    result = ${result};
  } catch (e) {
    if (e instanceof ScriptError) throw e;
    throw new ScriptError(e.message || String(e));
  }
  return result;
}`;

  // Create the factory function
  const factory = new Function("OPS", "ScriptError", body);

  // Return the executable function, injecting dependencies
  return factory(OPS, ScriptError);
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
  "ScriptError",
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

// Collects variables declared in the IMMEDIATE scope (for let/seq/etc)
function collectVars(node: any): string[] {
  const vars = new Set<string>();

  function visit(node: any) {
    if (!Array.isArray(node) || node.length === 0) return;

    const [op, ...args] = node;

    if (op === "let") {
      if (typeof args[0] === "string") {
        vars.add(args[0]);
      }
      visit(args[1]); // Recurse into value
      return;
    }

    // Stop recursion at scope boundaries
    if (op === "seq" || op === "while" || op === "for" || op === "lambda") {
      return;
    }

    // Recurse into arguments for other nodes
    for (const arg of args) {
      visit(arg);
    }
  }

  visit(node);
  return Array.from(vars);
}

// Collects ALL variable names used anywhere in the script
function collectAllVars(node: any): string[] {
  const vars = new Set<string>();

  function visit(node: any) {
    if (!Array.isArray(node) || node.length === 0) return;

    const [op, ...args] = node;

    if (op === "let" || op === "var" || op === "set") {
      if (typeof args[0] === "string") {
        vars.add(args[0]);
      }
    } else if (op === "lambda") {
      // Params are variables too
      const params = args[0];
      if (Array.isArray(params)) {
        params.forEach((p: any) => {
          if (typeof p === "string") vars.add(p);
        });
      }
    }

    // Recurse into all arguments
    for (const arg of args) {
      visit(arg);
    }
  }

  visit(node);
  return Array.from(vars);
}

interface CtxState {
  tempIdx: number;
}

function genTemp(state: CtxState): string {
  return `_t${state.tempIdx++}`;
}

interface CompiledExpression {
  pre: string;
  expr: string;
}

function compileExpression(node: any, state: CtxState): CompiledExpression {
  if (node === null || node === undefined) {
    return { pre: "", expr: "null" };
  }

  if (typeof node === "number" || typeof node === "boolean") {
    return { pre: "", expr: String(node) };
  }

  if (typeof node === "string") {
    return { pre: "", expr: JSON.stringify(node) };
  }

  if (Array.isArray(node)) {
    if (node.length === 0) return { pre: "", expr: "[]" };

    const [op, ...args] = node;

    // Control flow constructs that need hoisting
    if (
      ["seq", "if", "while", "for", "let", "set", "try", "break", "return", "throw"].includes(op)
    ) {
      const temp = genTemp(state);
      const { code, result } = compileStatements(node, state);
      return { pre: `let ${temp} = null;\n${code}\n${temp} = ${result};`, expr: temp };
    }

    if (op === "var") {
      return { pre: "", expr: toJSName(args[0]) };
    }

    if (op === "lambda") {
      return compileLambda(args);
    }

    if (op === "list.new") {
      const compiledArgs = args.map((a) => compileExpression(a, state));
      const pre = compiledArgs.map((a) => a.pre).join("\n");
      const expr = `[${compiledArgs.map((a) => a.expr).join(", ")}]`;
      return { pre, expr };
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

function compileStatements(node: any, state: CtxState): { code: string; result: string } {
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
  const { pre, expr } = compileExpression(node, state);
  const temp = genTemp(state);
  return { code: `${pre}\nlet ${temp} = ${expr};`, result: temp };
}

function compileSeq(args: any[], state: CtxState): { code: string; result: string } {
  if (args.length === 0) return { code: "", result: "null" };

  const vars = new Set<string>();
  for (const arg of args) {
    const argVars = collectVars(arg);
    argVars.forEach((v) => vars.add(v));
  }

  const decls =
    vars.size > 0
      ? `let ${Array.from(vars)
          .map((v) => `${toJSName(v)} = null`)
          .join(", ")};`
      : "";

  let code = decls + "\n";
  let lastResult = "null";

  for (let i = 0; i < args.length; i++) {
    const { code: stepCode, result } = compileStatements(args[i], state);
    code += stepCode + "\n";
    lastResult = result;
  }

  return { code, result: lastResult };
}

function compileIf(args: any[], state: CtxState): { code: string; result: string } {
  const [cond, thenBranch, elseBranch] = args;
  const condExpr = compileExpression(cond, state);
  const thenCode = compileStatements(thenBranch, state);
  const elseCode = elseBranch ? compileStatements(elseBranch, state) : { code: "", result: "null" };

  const resultVar = genTemp(state);

  return {
    code: `\
${condExpr.pre}
let ${resultVar} = null;
if (${condExpr.expr}) {
  ${thenCode.code}
  ${resultVar} = ${thenCode.result};
} else {
  ${elseCode.code}
  ${resultVar} = ${elseCode.result};
}`,
    result: resultVar,
  };
}

function compileWhile(args: any[], state: CtxState): { code: string; result: string } {
  const [cond, body] = args;

  // Condition might have side effects, so we need to evaluate it inside the loop
  // But while(cond) expects an expression.
  // If cond is complex, we use while(true) { ... if(!cond) break; ... }

  const condExpr = compileExpression(cond, state);
  const isComplexCond = condExpr.pre.trim() !== "";

  const bodyVars = collectVars(body);
  const decls =
    bodyVars.length > 0 ? `let ${bodyVars.map((v) => `${toJSName(v)} = null`).join(", ")};` : "";

  const bodyCode = compileStatements(body, state);

  let loopCode = "";
  if (isComplexCond) {
    loopCode = `\
while (true) {
  ${condExpr.pre}
  if (!${condExpr.expr}) break;
  ${decls}
  ${bodyCode.code}
}`;
  } else {
    loopCode = `\
while (${condExpr.expr}) {
  ${decls}
  ${bodyCode.code}
}`;
  }

  return {
    code: loopCode,
    result: "null",
  };
}

function compileFor(args: any[], state: CtxState): { code: string; result: string } {
  const [varName, listExpr, body] = args;
  const listExprRes = compileExpression(listExpr, state);
  const loopVar = toJSName(varName);

  const bodyVars = collectVars(body);
  const bodyDecls = bodyVars
    .filter((v) => toJSName(v) !== loopVar)
    .map((v) => `${toJSName(v)} = null`);
  const declsStr = bodyDecls.length > 0 ? `let ${bodyDecls.join(", ")};` : "";

  const bodyCode = compileStatements(body, state);

  return {
    code: `\
${listExprRes.pre}
for (const ${loopVar} of ${listExprRes.expr}) {
  ${declsStr}
  ${bodyCode.code}
}
    `,
    result: "null",
  };
}

function compileLet(args: any[], state: CtxState): { code: string; result: string } {
  const [name, val] = args;
  const jsName = toJSName(name);
  const valExpr = compileExpression(val, state);
  return {
    code: `\
${valExpr.pre}${jsName} = ${valExpr.expr};`,
    result: jsName,
  };
}

function compileSet(args: any[], state: CtxState): { code: string; result: string } {
  const [name, val] = args;
  const jsName = toJSName(name);
  const valExpr = compileExpression(val, state);
  return {
    code: `\
${valExpr.pre}${jsName} = ${valExpr.expr};`,
    result: jsName,
  };
}

function compileBreak(_args: any[], _state: CtxState): { code: string; result: string } {
  return { code: "break;", result: "null" };
}

function compileReturn(args: any[], state: CtxState): { code: string; result: string } {
  const [val] = args;
  if (val) {
    const valExpr = compileExpression(val, state);
    return {
      code: `${valExpr.pre}return ${valExpr.expr};`,
      result: "null", // Unreachable
    };
  }
  return { code: "return null;", result: "null" };
}

function compileThrow(args: any[], state: CtxState): { code: string; result: string } {
  const [msg] = args;
  const msgExpr = compileExpression(msg, state);
  return {
    code: `${msgExpr.pre}throw new ScriptError(${msgExpr.expr});`,
    result: "null", // Unreachable
  };
}

function compileTry(args: any[], state: CtxState): { code: string; result: string } {
  const [tryBlock, errorVar, catchBlock] = args;
  const tryCode = compileStatements(tryBlock, state);
  const catchCode = compileStatements(catchBlock, state);

  const errDecl = errorVar ? `let ${toJSName(errorVar)} = e.message || String(e);` : "";
  const resultVar = genTemp(state);

  return {
    code: `\
let ${resultVar} = null;
try {
  ${tryCode.code}
  ${resultVar} = ${tryCode.result};
} catch (e) {
  ${errDecl}
  ${catchCode.code}
  ${resultVar} = ${catchCode.result};
}`,
    result: resultVar,
  };
}

function compileLambda(args: any[]): CompiledExpression {
  const [params, body] = args;
  const paramNames = (params as string[]).map(toJSName);

  const vars = collectVars(body);
  const bodyDecls = vars.filter((v) => !params.includes(v)).map((v) => `${toJSName(v)} = null`);
  const declsStr = bodyDecls.length > 0 ? `let ${bodyDecls.join(", ")};` : "";

  const lambdaState = { tempIdx: 0 }; // Fresh state for lambda
  const { code, result } = compileStatements(body, lambdaState);

  const expr = `({
    type: "lambda",
    args: ${JSON.stringify(params)},
    execute: (ctx) => {
      ${paramNames.map((p) => `let ${p} = ctx.vars[${JSON.stringify(p)}];`).join("\n")}
      ${declsStr}
      ${code}
      return ${result};
    }
  })`;

  return { pre: "", expr };
}

function compileObjNew(args: any[], state: CtxState): CompiledExpression {
  const props = [];
  let pre = "";
  for (const arg of args) {
    const keyExpr = compileExpression(arg[0], state);
    const valExpr = compileExpression(arg[1], state);
    pre += keyExpr.pre + "\n" + valExpr.pre + "\n";
    props.push(`[${keyExpr.expr}]: ${valExpr.expr}`);
  }
  return { pre, expr: `({ ${props.join(", ")} })` };
}

function compileChainedComparison(argExprs: string[], op: string): CompiledExpression {
  if (argExprs.length < 2) {
    return { pre: "", expr: "true" }; // Or error?
  }
  const parts: string[] = [];
  // TODO: This duplicates expression evaluation which is VERY dangerous.
  // We should evaluate each expression only once.
  for (let i = 0; i < argExprs.length - 1; i++) {
    parts.push(`(${argExprs[i]} ${op} ${argExprs[i + 1]})`);
  }
  return { pre: "", expr: `(${parts.join(" && ")})` };
}

function compileOpcodeCall(op: string, args: any[], state: CtxState): CompiledExpression {
  if (op === "quote") {
    return { pre: "", expr: JSON.stringify(args[0]) };
  }
  const compiledArgs = args.map((a) => compileExpression(a, state));
  const pre = compiledArgs.map((a) => a.pre).join("\n");
  const argExprs = compiledArgs.map((a) => a.expr);

  switch (op) {
    case "+":
      return { pre, expr: `(${argExprs.join(" + ")})` };
    case "-":
      return { pre, expr: `(${argExprs.join(" - ")})` };
    case "*":
      return { pre, expr: `(${argExprs.join(" * ")})` };
    case "/":
      return { pre, expr: `(${argExprs.join(" / ")})` };
    case "%":
      return { pre, expr: `(${argExprs.join(" % ")})` };
    case "^":
      return { pre, expr: `(${argExprs.join(" ** ")})` };
    case "==":
      return { pre, expr: `(${argExprs.join(" === ")})` };
    case "!=":
      return { pre, expr: `(${argExprs.join(" !== ")})` };
    case "<":
      return compileChainedComparison(argExprs, "<");
    case ">":
      return compileChainedComparison(argExprs, ">");
    case "<=":
      return compileChainedComparison(argExprs, "<=");
    case ">=":
      return compileChainedComparison(argExprs, ">=");
    case "and":
      return { pre, expr: `(${argExprs.join(" && ")})` };
    case "or":
      return { pre, expr: `(${argExprs.join(" || ")})` };
    case "not":
      return { pre, expr: `!${argExprs[0]}` };
    case "obj.get":
      return {
        pre,
        expr: `((${argExprs[0]})[${argExprs[1]}] ?? ${args[2] ? argExprs[2] : "null"})`,
      };
    case "obj.set":
      return { pre, expr: `((${argExprs[0]})[${argExprs[1]}] = ${argExprs[2]})` };
    case "obj.has":
      return { pre, expr: `(${argExprs[1]} in ${argExprs[0]})` };
    case "obj.del":
      return { pre, expr: `(delete ${argExprs[0]}[${argExprs[1]}])` };
    case "log":
      return { pre, expr: `console.log(${argExprs.join(", ")})` };
    case "str.concat":
      return { pre, expr: `("" + ${argExprs.join(" + ")})` };
    case "this":
      return { pre, expr: "ctx.this" };
    case "caller":
      return { pre, expr: "ctx.caller" };

    // List Opcodes
    case "list.len":
      return { pre, expr: `${argExprs[0]}.length` };
    case "list.empty":
      return { pre, expr: `(${argExprs[0]}.length === 0)` };
    case "list.get":
      return { pre, expr: `${argExprs[0]}[${argExprs[1]}]` };
    case "list.set":
      return {
        pre,
        expr: `(${argExprs[0]}[${argExprs[1]}] = ${argExprs[2]})`,
      };
    case "list.push":
      return { pre, expr: `${argExprs[0]}.push(${argExprs[1]})` };
    case "list.pop":
      return { pre, expr: `${argExprs[0]}.pop()` };
    case "list.unshift":
      return { pre, expr: `${argExprs[0]}.unshift(${argExprs[1]})` };
    case "list.shift":
      return { pre, expr: `${argExprs[0]}.shift()` };
    case "list.slice":
      return {
        pre,
        expr: `${argExprs[0]}.slice(${argExprs[1]}, ${args[2] ? argExprs[2] : "undefined"})`,
      };
    case "list.splice": {
      // remaining args are items // args[0] is list, args[1] is start, args[2] is deleteCount // list.splice(list, start, deleteCount, ...items)
      const items = argExprs.slice(3);
      return {
        pre,
        expr: `${argExprs[0]}.splice(${argExprs[1]}, ${argExprs[2]}${
          items.length > 0 ? ", " + items.join(", ") : ""
        })`,
      };
    }
    case "list.concat":
      return { pre, expr: `[].concat(${argExprs.join(", ")})` };
    case "list.includes":
      return { pre, expr: `${argExprs[0]}.includes(${argExprs[1]})` };
    case "list.reverse":
      return { pre, expr: `${argExprs[0]}.reverse()` };
    case "list.sort":
      return { pre, expr: `${argExprs[0]}.sort()` };
    case "list.join":
      return { pre, expr: `${argExprs[0]}.join(${argExprs[1]})` };

    // Object Opcodes
    case "obj.keys":
      return { pre, expr: `Object.getOwnPropertyNames(${argExprs[0]})` };
    case "obj.values":
      return {
        pre,
        expr: `Object.getOwnPropertyNames(${argExprs[0]}).map(k => ${argExprs[0]}[k])`,
      };
    case "obj.entries":
      return {
        pre,
        expr: `Object.getOwnPropertyNames(${argExprs[0]}).map(k => [k, ${argExprs[0]}[k]])`,
      };
    case "obj.merge":
      return { pre, expr: `Object.assign({}, ${argExprs.join(", ")})` };

    // String Opcodes
    case "str.len":
      return { pre, expr: `${argExprs[0]}.length` };
    case "str.split":
      return { pre, expr: `${argExprs[0]}.split(${argExprs[1]})` };
    case "str.slice":
      return {
        pre,
        expr: `${argExprs[0]}.slice(${argExprs[1]}, ${args[2] ? argExprs[2] : "undefined"})`,
      };
    case "str.upper":
      return { pre, expr: `${argExprs[0]}.toUpperCase()` };
    case "str.lower":
      return { pre, expr: `${argExprs[0]}.toLowerCase()` };
    case "str.trim":
      return { pre, expr: `${argExprs[0]}.trim()` };
    case "str.replace":
      return {
        pre,
        expr: `${argExprs[0]}.replace(${argExprs[1]}, ${args[2] ? argExprs[2] : "undefined"})`,
      };
    case "str.includes":
      return { pre, expr: `${argExprs[0]}.includes(${argExprs[1]})` };
    case "str.join": // Alias for list.join? No, str.join in string.ts takes list and separator.
      return { pre, expr: `${argExprs[0]}.join(${argExprs[1]})` };
  }

  const def = OPS[op];
  if (!def) throw new ScriptError("Unknown opcode: " + op);

  if (def.metadata.lazy) {
    return {
      pre,
      expr: `OPS[${JSON.stringify(op)}].handler(${JSON.stringify(args)}, ctx)`,
    };
  }

  return {
    pre,
    expr: `OPS[${JSON.stringify(op)}].handler([${argExprs.join(", ")}], ctx)`,
  };
}
