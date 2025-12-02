import * as ts from "typescript";

export function transpile(code: string): any {
  const sourceFile = ts.createSourceFile(
    "script.ts",
    code,
    ts.ScriptTarget.Latest,
    true,
  );

  const statements: any[] = [];

  sourceFile.statements.forEach((stmt) => {
    const result = transpileNode(stmt);
    if (result !== undefined) {
      statements.push(result);
    }
  });

  // If there's only one statement and it's an expression, return it directly?
  // Or should we always return a sequence if there are multiple statements?
  // ViwoScript usually expects a single expression or a sequence.
  if (statements.length === 1) {
    return statements[0];
  }

  return ["seq", ...statements];
}

function transpileNode(node: ts.Node): any {
  if (ts.isExpressionStatement(node)) {
    return transpileNode(node.expression);
  }

  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }

  if (ts.isStringLiteral(node)) {
    return node.text;
  }

  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }

  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }

  if (node.kind === ts.SyntaxKind.NullKeyword) {
    return null;
  }

  if (ts.isIdentifier(node)) {
    // Variable reference
    return ["var", node.text];
  }

  if (ts.isVariableStatement(node)) {
    const declList = node.declarationList;
    if (declList.declarations[0]) {
      const decl = declList.declarations[0];
      if (ts.isVariableDeclaration(decl) && decl.initializer) {
        const name = decl.name.getText();
        const value = transpileNode(decl.initializer);
        return ["let", name, value];
      }
    }
  }

  if (ts.isBinaryExpression(node)) {
    const left = transpileNode(node.left);
    const right = transpileNode(node.right);
    const op = node.operatorToken.kind;

    switch (op) {
      case ts.SyntaxKind.PlusToken:
        return ["+", left, right];
      case ts.SyntaxKind.MinusToken:
        return ["-", left, right];
      case ts.SyntaxKind.AsteriskToken:
        return ["*", left, right];
      case ts.SyntaxKind.SlashToken:
        return ["/", left, right];
      case ts.SyntaxKind.PercentToken:
        return ["%", left, right];
      case ts.SyntaxKind.EqualsEqualsEqualsToken:
      case ts.SyntaxKind.EqualsEqualsToken:
        return ["==", left, right];
      case ts.SyntaxKind.ExclamationEqualsEqualsToken:
      case ts.SyntaxKind.ExclamationEqualsToken:
        return ["!=", left, right];
      case ts.SyntaxKind.LessThanToken:
        return ["<", left, right];
      case ts.SyntaxKind.GreaterThanToken:
        return [">", left, right];
      case ts.SyntaxKind.LessThanEqualsToken:
        return ["<=", left, right];
      case ts.SyntaxKind.GreaterThanEqualsToken:
        return [">=", left, right];
      case ts.SyntaxKind.AmpersandAmpersandToken:
        return ["and", left, right];
      case ts.SyntaxKind.BarBarToken:
        return ["or", left, right];
      case ts.SyntaxKind.InKeyword:
        return ["obj.has", right, left];
      case ts.SyntaxKind.AsteriskAsteriskToken:
        return ["^", left, right];
      case ts.SyntaxKind.EqualsToken:
        // Assignment
        if (Array.isArray(left) && left[0] === "var") {
          return ["set", left[1], right];
        }
        // Handle object property assignment?
        if (Array.isArray(left) && left[0] === "obj.get") {
          return ["obj.set", left[1], left[2], right];
        }
        throw new Error("Invalid assignment target");
    }
  }

  if (ts.isPrefixUnaryExpression(node)) {
    if (node.operator === ts.SyntaxKind.ExclamationToken) {
      return ["not", transpileNode(node.operand)];
    }
  }

  if (ts.isDeleteExpression(node)) {
    const expr = transpileNode(node.expression);
    // expr should be ["obj.get", obj, key]
    if (Array.isArray(expr) && expr[0] === "obj.get") {
      return ["obj.del", expr[1], expr[2]];
    }
    // If it's just a property access that wasn't transpiled to obj.get yet?
    // transpileNode handles PropertyAccessExpression and ElementAccessExpression returning obj.get
    // So it should be fine.
    return null;
  }

  if (ts.isArrayLiteralExpression(node)) {
    const elements = node.elements.map(transpileNode);
    return ["list.new", ...elements];
  }

  if (ts.isObjectLiteralExpression(node)) {
    const props: any[] = [];
    node.properties.forEach((prop) => {
      if (ts.isPropertyAssignment(prop)) {
        const key = prop.name.getText();
        // Strip quotes if present
        const cleanKey =
          key.startsWith('"') || key.startsWith("'") ? key.slice(1, -1) : key;
        const val = transpileNode(prop.initializer);
        props.push(cleanKey, val);
      }
    });
    return ["obj.new", ...props];
  }

  if (ts.isPropertyAccessExpression(node)) {
    const obj = transpileNode(node.expression);
    const key = node.name.text;
    return ["obj.get", obj, key];
  }

  if (ts.isElementAccessExpression(node)) {
    const obj = transpileNode(node.expression);
    const key = transpileNode(node.argumentExpression);
    return ["obj.get", obj, key];
  }

  if (ts.isCallExpression(node)) {
    const expr = node.expression;
    const args = node.arguments.map(transpileNode);

    // Check if it's a known global function or just a variable call
    // If expr is an identifier, we can check if it's a special opcode or just a var
    // But for now, let's treat everything as "apply" unless we want to support direct opcodes like "log"

    if (ts.isIdentifier(expr)) {
      const name = expr.text;
      // Optimisation: if it's a known opcode, use it directly?
      // But ViwoScript uses ["apply", func, args...] for user functions
      // and ["log", msg] for builtins.
      // Let's assume standard library calls are direct opcodes if they match?
      // Or maybe we should just output ["apply", ["var", name], args] and let the runtime handle it?
      // Wait, `log` is an opcode. `["log", "msg"]`.
      // If I write `log("msg")` in TS, I want `["log", "msg"]`.
      // If I write `myFunc("msg")`, I want `["apply", ["var", "myFunc"], "msg"]`.

      // List of known opcodes that look like functions
      const knownOpcodes = new Set(["log", "throw"]);
      if (knownOpcodes.has(name)) {
        return [name, ...args];
      }
      return ["apply", ["var", name], ...args];
    }

    return ["apply", transpileNode(expr), ...args];
  }

  if (ts.isArrowFunction(node)) {
    const params = node.parameters.map((p) => p.name.getText());
    let body = transpileNode(node.body);

    // If body is a block, it returns a "seq".
    // Lambda body in ViwoScript can be a seq.

    return ["lambda", params, body];
  }

  if (ts.isBlock(node)) {
    const stmts = node.statements.map(transpileNode);
    return ["seq", ...stmts];
  }

  if (ts.isIfStatement(node)) {
    const cond = transpileNode(node.expression);
    const thenStmt = transpileNode(node.thenStatement);
    const elseStmt = node.elseStatement
      ? transpileNode(node.elseStatement)
      : null;

    if (elseStmt) {
      return ["if", cond, thenStmt, elseStmt];
    }
    return ["if", cond, thenStmt];
  }

  if (ts.isWhileStatement(node)) {
    const cond = transpileNode(node.expression);
    const body = transpileNode(node.statement);
    return ["while", cond, body];
  }

  if (ts.isTryStatement(node)) {
    const tryBlock = transpileNode(node.tryBlock);
    const catchClause = node.catchClause;
    if (catchClause) {
      const errVar = catchClause.variableDeclaration
        ? catchClause.variableDeclaration.name.getText()
        : "err";
      const catchBlock = transpileNode(catchClause.block);
      return ["try", tryBlock, errVar, catchBlock];
    }
    // ViwoScript try expects catch
    return ["try", tryBlock, "err", ["seq"]];
  }

  if (ts.isForOfStatement(node)) {
    const initializer = node.initializer;
    let varName = "";
    if (ts.isVariableDeclarationList(initializer)) {
      varName = initializer.declarations[0]!.name.getText();
    }
    const list = transpileNode(node.expression);
    const body = transpileNode(node.statement);

    return ["for", varName, list, body];
  }

  if (ts.isReturnStatement(node)) {
    // ViwoScript doesn't have explicit return in sequences usually, it returns the last value.
    // But if we are inside a lambda, we might want to just evaluate the expression.
    // If we are in a block, `return x` might be tricky if it's not the last statement.
    // For now, let's just return the expression.
    if (node.expression) {
      return transpileNode(node.expression);
    }
    return null;
  }

  console.warn(`Unsupported node kind: ${node.kind}`);
  return null;
}
