export function decompile(
  script: any,
  indentLevel: number = 0,
  isStatement: boolean = false,
): string {
  const indent = "  ".repeat(indentLevel);

  if (script === null || script === undefined) {
    return "null";
  }

  if (typeof script === "string") {
    return JSON.stringify(script);
  }

  if (typeof script === "number" || typeof script === "boolean") {
    return String(script);
  }

  if (Array.isArray(script)) {
    if (script.length === 0) {
      return "[]";
    }

    const opcode = script[0];
    const args = script.slice(1);

    // --- Control Flow ---

    if (opcode === "seq") {
      // seq is always a block statement if isStatement is true
      // If isStatement is false, it's an IIFE or block expression?
      // For simplicity, let's assume seq is mostly used as a block.

      const statements = args.map((stmt) => {
        // The last statement in a sequence might need to be a return if it's an expression context?
        // But ViwoScript returns the last value.
        // In TS, a block doesn't return.
        // If we are in an expression context (e.g. lambda body), we might wrap in IIFE or just use { ... } if it's a lambda body.

        // For now, let's just decompile as statements.
        return decompile(stmt, indentLevel + (isStatement ? 0 : 1), true);
      });

      if (isStatement) {
        // Top level or inside another block
        return statements
          .map((s) => (s.endsWith("}") || s.endsWith(";") ? s : s + ";"))
          .join("\n" + indent);
      } else {
        // Expression context (e.g. lambda body, or argument)
        // If it's a lambda body, we can return a block `{ ... }`
        // But we don't know if we are in a lambda body here.
        // Let's assume expression context means we need an expression.
        // (() => { ... })()
        return `(() => {\n${statements
          .map((s) => indent + "  " + (s.endsWith("}") ? s : s + ";"))
          .join("\n")}\n${indent}})()`;
      }
    }

    if (opcode === "if") {
      const [cond, thenBranch, elseBranch] = args;
      if (isStatement) {
        const thenCode = decompile(thenBranch, indentLevel + 1, true);
        let out = `if (${decompile(
          cond,
          indentLevel,
          false,
        )}) {\n${indent}  ${thenCode}${
          thenCode.endsWith("}") || thenCode.endsWith(";") ? "" : ";"
        }\n${indent}}`;
        if (elseBranch) {
          const elseCode = decompile(elseBranch, indentLevel + 1, true);
          out += ` else {\n${indent}  ${elseCode}${
            elseCode.endsWith("}") || elseCode.endsWith(";") ? "" : ";"
          }\n${indent}}`;
        }
        return out;
      } else {
        // Ternary
        return `${decompile(cond, indentLevel, false)} ? ${decompile(
          thenBranch,
          indentLevel,
          false,
        )} : ${decompile(elseBranch || null, indentLevel, false)}`;
      }
    }

    if (opcode === "while") {
      const [cond, body] = args;
      // While is a statement. If used as expression, it returns null (or last result).
      // TS while doesn't return.
      // If expression, wrap in IIFE?
      if (isStatement) {
        const bodyCode = decompile(body, indentLevel + 1, true);
        return `while (${decompile(
          cond,
          indentLevel,
          false,
        )}) {\n${indent}  ${bodyCode}${
          bodyCode.endsWith("}") || bodyCode.endsWith(";") ? "" : ";"
        }\n${indent}}`;
      } else {
        return `(() => { while (${decompile(
          cond,
          indentLevel + 1,
          false,
        )}) { ${decompile(body, indentLevel + 1, true)}; } })()`;
      }
    }

    if (opcode === "for") {
      const [varName, list, body] = args;
      if (isStatement) {
        const bodyCode = decompile(body, indentLevel + 1, true);
        return `for (const ${varName} of ${decompile(
          list,
          indentLevel,
          false,
        )}) {\n${indent}  ${bodyCode}${
          bodyCode.endsWith("}") || bodyCode.endsWith(";") ? "" : ";"
        }\n${indent}}`;
      } else {
        return `(() => { for (const ${varName} of ${decompile(
          list,
          indentLevel + 1,
          false,
        )}) { ${decompile(body, indentLevel + 1, true)}; } })()`;
      }
    }

    // --- Variables ---

    if (opcode === "let") {
      const [name, val] = args;
      // let returns the value.
      if (isStatement) {
        return `let ${name} = ${decompile(val, indentLevel, false)}`;
      } else {
        // (let x = ...) is not valid.
        // But maybe we can just output the assignment if it was already declared?
        // No, let declares.
        // We can't declare in expression.
        // Fallback to function call or just assume it's valid in our "TS-like" script?
        // User wants "valid TS".
        // So we must use IIFE if it's an expression.
        return `(() => { let ${name} = ${decompile(
          val,
          indentLevel + 1,
          false,
        )}; return ${name}; })()`;
      }
    }

    if (opcode === "set") {
      const [name, val] = args;
      // Assignment is an expression in JS.
      return `${name} = ${decompile(val, indentLevel, false)}`;
    }

    if (opcode === "var") {
      const [name] = args;
      return String(name);
    }

    // --- Functions ---

    if (opcode === "lambda") {
      const [params, body] = args;
      // Lambda is an expression.
      // (args) => { ... }
      // If body is a seq, it will be decompiled as a block (if we pass isStatement=true? No, lambda body is a block).

      // Check if body is a sequence
      const bodyIsSeq = Array.isArray(body) && body[0] === "seq";

      if (bodyIsSeq) {
        // Decompile seq contents as statements
        const statements = body
          .slice(1)
          .map((stmt: any) => decompile(stmt, indentLevel + 1, true));
        // Add return to the last statement if it's not a control flow that returns?
        // In ViwoScript, last value is returned.
        // In TS, we need explicit return.
        if (statements.length > 0) {
          const lastIdx = statements.length - 1;
          const last = statements[lastIdx]!;
          if (
            !last.startsWith("return ") &&
            !last.startsWith("if") &&
            !last.startsWith("while") &&
            !last.startsWith("for")
          ) {
            statements[lastIdx] = "return " + last;
          }
        }

        return `(${params.join(", ")}) => {\n${statements
          .map(
            (s: string) =>
              indent +
              "  " +
              (s.endsWith("}") || s.endsWith(";") ? s : s + ";"),
          )
          .join("\n")}\n${indent}}`;
      } else {
        // Single expression body
        return `(${params.join(", ")}) => ${decompile(
          body,
          indentLevel,
          false,
        )}`;
      }
    }

    if (opcode === "apply") {
      const [func, ...funcArgs] = args;
      return `${decompile(func, indentLevel, false)}(${funcArgs
        .map((a: any) => decompile(a, indentLevel, false))
        .join(", ")})`;
    }

    // --- Data Structures ---

    if (opcode === "list.new") {
      const items = args.map((arg) => decompile(arg, indentLevel, false));
      return `[${items.join(", ")}]`;
    }

    if (opcode === "obj.new") {
      const props = [];
      for (let i = 0; i < args.length; i += 2) {
        const key = decompile(args[i], indentLevel, false);
        const val = decompile(args[i + 1], indentLevel, false);
        // If key is a string literal, strip quotes if it's a valid identifier?
        // For simplicity, let's keep quotes or just use the string.
        props.push(`${key}: ${val}`);
      }
      return `{ ${props.join(", ")} }`;
    }

    if (opcode === "obj.get") {
      const [obj, key, def] = args;
      const objCode = decompile(obj, indentLevel, false);
      const keyCode = decompile(key, indentLevel, false);

      let access = `${objCode}[${keyCode}]`;
      // Optimization: use dot notation if key is a valid identifier string literal
      if (keyCode.startsWith('"') && keyCode.endsWith('"')) {
        const inner = keyCode.slice(1, -1);
        if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(inner)) {
          access = `${objCode}.${inner}`;
        }
      }

      if (def !== undefined) {
        return `(${access} ?? ${decompile(def, indentLevel, false)})`;
      }
      return access;
    }

    if (opcode === "obj.set") {
      const [obj, key, val] = args;
      const objCode = decompile(obj, indentLevel, false);
      const keyCode = decompile(key, indentLevel, false);
      const valCode = decompile(val, indentLevel, false);

      let access = `${objCode}[${keyCode}]`;
      if (keyCode.startsWith('"') && keyCode.endsWith('"')) {
        const inner = keyCode.slice(1, -1);
        if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(inner)) {
          access = `${objCode}.${inner}`;
        }
      }

      return `${access} = ${valCode}`;
    }

    if (opcode === "obj.has") {
      const [obj, key] = args;
      return `${decompile(key, indentLevel, false)} in ${decompile(
        obj,
        indentLevel,
        false,
      )}`;
    }

    if (opcode === "obj.del") {
      const [obj, key] = args;
      const objCode = decompile(obj, indentLevel, false);
      const keyCode = decompile(key, indentLevel, false);

      let access = `${objCode}[${keyCode}]`;
      if (keyCode.startsWith('"') && keyCode.endsWith('"')) {
        const inner = keyCode.slice(1, -1);
        if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(inner)) {
          access = `${objCode}.${inner}`;
        }
      }
      return `delete ${access}`;
    }

    // --- Infix Operators ---
    const infixOps: Record<string, string> = {
      "+": "+",
      "-": "-",
      "*": "*",
      "/": "/",
      "%": "%",
      "==": "===",
      "!=": "!==",
      "<": "<",
      ">": ">",
      "<=": "<=",
      ">=": ">=",
      and: "&&",
      or: "||",
    };

    if (infixOps[opcode]) {
      const op = infixOps[opcode];
      return `(${decompile(args[0], indentLevel, false)} ${op} ${decompile(
        args[1],
        indentLevel,
        false,
      )})`;
    }

    if (opcode === "^") {
      return `Math.pow(${decompile(args[0], indentLevel, false)}, ${decompile(
        args[1],
        indentLevel,
        false,
      )})`;
    }

    if (opcode === "not") {
      return `!${decompile(args[0], indentLevel, false)}`;
    }

    // --- Standard Library ---

    if (opcode === "log") {
      return `console.log(${args
        .map((a: any) => decompile(a, indentLevel, false))
        .join(", ")})`;
    }

    if (opcode === "throw") {
      return `throw ${decompile(args[0], indentLevel, false)}`;
    }

    if (opcode === "try") {
      const [tryBlock, errVar, catchBlock] = args;
      return `try {\n${indent}  ${decompile(
        tryBlock,
        indentLevel + 1,
        true,
      )};\n${indent}} catch (${errVar}) {\n${indent}  ${decompile(
        catchBlock,
        indentLevel + 1,
        true,
      )};\n${indent}}`;
    }

    // Generic function call
    return `${opcode}(${args
      .map((arg: any) => decompile(arg, indentLevel, false))
      .join(", ")})`;
  }

  return JSON.stringify(script);
}
