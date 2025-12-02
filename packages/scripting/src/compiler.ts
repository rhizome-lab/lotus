import { ScriptValue } from "./def";
import { ScriptContext, OPS, ScriptError } from "./interpreter";

/**
 * Compiles a ViwoScript AST into a JavaScript function.
 *
 * @param script The script to compile.
 * @returns A function that takes a ScriptContext and returns a Promise resolving to the result.
 */
export function compile(
  script: ScriptValue<any>,
): (ctx: ScriptContext) => Promise<any> {
  const code = compileNode(script);
  // We wrap the code in an async function that takes 'ctx' and 'OPS' as arguments.
  // We also need 'ScriptError' available for throwing.
  const body = `
    return async function(ctx) {
      try {
        ${code.startsWith("return") ? code : "return " + code};
      } catch (e) {
        if (e instanceof ScriptError) throw e;
        throw new ScriptError(e.message || String(e));
      }
    }
  `;

  // Create the factory function
  const factory = new Function("OPS", "ScriptError", body);

  // Return the executable function, injecting dependencies
  return factory(OPS, ScriptError);
}

function compileNode(node: any): string {
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

    // Handle special forms (control flow, variables, etc.)
    switch (op) {
      case "seq":
        return compileSeq(args);
      case "if":
        return compileIf(args);
      case "while":
        return compileWhile(args);
      case "for":
        return compileFor(args);
      case "let":
        return compileLet(args);
      case "var":
        return compileVar(args);
      case "set":
        return compileSet(args);
      case "lambda":
        return compileLambda(args);
      case "apply":
        return compileApply(args);
      case "try":
        return compileTry(args);
      case "throw":
        return compileThrow(args);
      case "list.new":
        return `[${args.map(compileNode).join(", ")}]`;
      case "obj.new":
        return compileObjNew(args);
    }

    // Handle standard opcode calls
    if (typeof op === "string" && OPS[op]) {
      return compileOpcodeCall(op, args);
    }

    throw new Error(`Unknown opcode: ${op}`);
  }

  throw new Error(`Unknown node type: ${typeof node}`);
}

function compileSeq(args: any[]): string {
  if (args.length === 0) return "null";
  // We need to execute statements in order and return the last one.
  // Since we are generating an expression or a return statement, we might need an IIFE
  // if this is nested. But for the top level, we can just use statements.
  // However, compileNode is expected to return an *expression* that evaluates to the result,
  // OR we need to change the architecture to return statements.

  // Let's use IIFE for sequences to ensure they are expressions.
  // (async () => { s1; s2; return s3; })()

  const statements = args.map(compileNode);
  const last = statements.pop();

  return `(async () => {
    ${statements.map((s) => "await " + s + ";").join("\n")}
    return await ${last};
  })()`;
}

function compileIf(args: any[]): string {
  const [cond, thenBranch, elseBranch] = args;
  return `(await ${compileNode(cond)} ? await ${compileNode(thenBranch)} : ${
    elseBranch ? "await " + compileNode(elseBranch) : "null"
  })`;
}

function compileWhile(args: any[]): string {
  const [cond, body] = args;
  return `(async () => {
    let result = null;
    while (await ${compileNode(cond)}) {
      result = await ${compileNode(body)};
    }
    return result;
  })()`;
}

function compileFor(args: any[]): string {
  const [varName, listExpr, body] = args;
  return `(async () => {
    const list = await ${compileNode(listExpr)};
    let result = null;
    if (Array.isArray(list)) {
      for (const item of list) {
        ctx.vars = ctx.vars || {};
        ctx.vars[${JSON.stringify(varName)}] = item;
        result = await ${compileNode(body)};
      }
    }
    return result;
  })()`;
}

function compileLet(args: any[]): string {
  const [name, val] = args;
  return `(async () => {
    const val = await ${compileNode(val)};
    ctx.vars = ctx.vars || {};
    ctx.vars[${JSON.stringify(name)}] = val;
    return val;
  })()`;
}

function compileVar(args: any[]): string {
  const [name] = args;
  return `(ctx.vars?.[${JSON.stringify(name)}] ?? null)`;
}

function compileSet(args: any[]): string {
  const [name, val] = args;
  return `(async () => {
    const val = await ${compileNode(val)};
    if (ctx.vars && ${JSON.stringify(name)} in ctx.vars) {
      ctx.vars[${JSON.stringify(name)}] = val;
    }
    return val;
  })()`;
}

function compileLambda(args: any[]): string {
  const [params, body] = args;
  // We return a lambda object structure compatible with the interpreter,
  // BUT we add an 'execute' method which is the compiled body.
  // The 'execute' method needs to handle closure.

  // When 'apply' is called, it will check for 'execute'.
  // If present, it calls 'execute(args, ctx)'.
  // 'ctx' passed to execute should have the new variables bound.

  // We need to compile the body *now*.
  // The compiled body expects 'ctx' to contain the variables.

  // We need to capture the current closure at creation time.

  return `({
    type: "lambda",
    args: ${JSON.stringify(params)},
    closure: { ...ctx.vars },
    execute: ${compile(body).toString()}
  })`;
}

function compileApply(args: any[]): string {
  const [funcExpr, ...argExprs] = args;
  return `(async () => {
    const func = await ${compileNode(funcExpr)};
    if (!func || func.type !== "lambda") throw new ScriptError("apply: func must be a lambda");
    
    const args = await Promise.all([${argExprs.map(compileNode).join(", ")}]);
    
    const newVars = { ...func.closure };
    for (let i = 0; i < func.args.length; i++) {
      newVars[func.args[i]] = args[i];
    }
    
    const newCtx = { ...ctx, vars: newVars, stack: [...ctx.stack, { name: "<lambda>", args }] };
    
    if (func.execute) {
      return func.execute(newCtx);
    } else {
      // Fallback to interpreter if lambda was not compiled (e.g. created by interpreter)
      // We need to import evaluate? Or we can just throw for now as we want to move to compiler.
      // Or better, we can assume OPS.apply will handle it if we delegate?
      // But we are compiling 'apply' inline here.
      // Let's use OPS.apply handler if we can, but OPS.apply expects raw args, not evaluated.
      
      // Actually, if we want to support mixed mode, we should probably just call OPS.apply.handler?
      // But OPS.apply.handler expects unevaluated args and calls evaluate().
      // That won't work because we are in compiled land.
      
      // So we must support interpreting the body if 'execute' is missing.
      // This requires 'evaluate' to be available.
      // For now, let's assume all lambdas are compiled or we throw.
      throw new ScriptError("apply: lambda has no compiled code");
    }
  })()`;
}

function compileTry(args: any[]): string {
  const [tryBlock, errorVar, catchBlock] = args;
  return `(async () => {
    try {
      return await ${compileNode(tryBlock)};
    } catch (e) {
      if (${JSON.stringify(errorVar)}) {
        ctx.vars = ctx.vars || {};
        ctx.vars[${JSON.stringify(errorVar)}] = e.message || String(e);
      }
      return await ${compileNode(catchBlock)};
    }
  })()`;
}

function compileThrow(args: any[]): string {
  const [msg] = args;
  return `(async () => { throw new ScriptError(await ${compileNode(
    msg,
  )}); })()`;
}

function compileObjNew(args: any[]): string {
  const props = [];
  for (const arg of args) {
    props.push(`[${compileNode(arg[0])}]: await ${compileNode(arg[1])}`);
  }
  return `({ ${props.join(", ")} })`;
}

function compileOpcodeCall(op: string, args: any[]): string {
  // Optimization for common opcodes
  switch (op) {
    case "+":
      return `(await ${compileNode(args[0])} + await ${compileNode(args[1])})`;
    case "-":
      return `(await ${compileNode(args[0])} - await ${compileNode(args[1])})`;
    case "*":
      return `(await ${compileNode(args[0])} * await ${compileNode(args[1])})`;
    case "/":
      return `(await ${compileNode(args[0])} / await ${compileNode(args[1])})`;
    case "%":
      return `(await ${compileNode(args[0])} % await ${compileNode(args[1])})`;
    case "^":
      return `Math.pow(await ${compileNode(args[0])}, await ${compileNode(
        args[1],
      )})`;
    case "==":
      return `(await ${compileNode(args[0])} === await ${compileNode(
        args[1],
      )})`;
    case "!=":
      return `(await ${compileNode(args[0])} !== await ${compileNode(
        args[1],
      )})`;
    case "<":
      return `(await ${compileNode(args[0])} < await ${compileNode(args[1])})`;
    case ">":
      return `(await ${compileNode(args[0])} > await ${compileNode(args[1])})`;
    case "<=":
      return `(await ${compileNode(args[0])} <= await ${compileNode(args[1])})`;
    case ">=":
      return `(await ${compileNode(args[0])} >= await ${compileNode(args[1])})`;
    case "and":
      return `(await ${compileNode(args[0])} && await ${compileNode(args[1])})`;
    case "or":
      return `(await ${compileNode(args[0])} || await ${compileNode(args[1])})`;
    case "not":
      return `(!await ${compileNode(args[0])})`;

    // Object
    case "obj.get":
      return `(await ${compileNode(args[0])})[await ${compileNode(
        args[1],
      )}] ?? ${args[2] ? "await " + compileNode(args[2]) : "null"}`;
    case "obj.set":
      return `((await ${compileNode(args[0])})[await ${compileNode(
        args[1],
      )}] = await ${compileNode(args[2])})`;
    case "obj.has":
      return `(await ${compileNode(args[1])} in await ${compileNode(args[0])})`;
    case "obj.del":
      return `(delete (await ${compileNode(args[0])})[await ${compileNode(
        args[1],
      )}])`;

    // List
    // list.new is handled above

    // Std
    case "log":
      return `console.log(${args
        .map((a) => "await " + compileNode(a))
        .join(", ")})`;
  }

  // Generic fallback for other opcodes (including dynamically added ones)
  // We evaluate arguments, wrap arrays in "quote", and call the handler.
  return `(async () => {
    const args = await Promise.all([${args.map(compileNode).join(", ")}]);
    const wrappedArgs = args.map(a => Array.isArray(a) ? ["quote", a] : a);
    if (!OPS[${JSON.stringify(
      op,
    )}]) throw new ScriptError("Unknown opcode: " + ${JSON.stringify(op)});
    return await OPS[${JSON.stringify(op)}].handler(wrappedArgs, ctx);
  })()`;
}
