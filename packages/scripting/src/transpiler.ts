import * as ts from "typescript";
import * as Std from "./lib/std";
import * as MathLib from "./lib/math";
import * as List from "./lib/list";
import * as ObjectLib from "./lib/object";
import * as BooleanLib from "./lib/boolean";
import { RESERVED_TYPESCRIPT_KEYWORDS } from "./type_generator";

export function transpile(code: string): any {
  const sourceFile = ts.createSourceFile(
    "script.ts",
    code,
    ts.ScriptTarget.Latest,
    true,
  );

  const scope = new Set<string>();
  const statements: any[] = [];

  sourceFile.statements.forEach((stmt) => {
    const result = transpileNode(stmt, scope);
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

  return Std.seq(...statements);
}

function transpileNode(node: ts.Node, scope: Set<string>): any {
  // Ignore ambient declarations (declare var, declare function, etc.)
  if (
    ts.isVariableStatement(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isModuleDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node)
  ) {
    if (
      node.modifiers &&
      node.modifiers.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)
    ) {
      return undefined;
    }
  }

  if (ts.isExpressionStatement(node)) {
    return transpileNode(node.expression, scope);
  }

  if (ts.isParenthesizedExpression(node)) {
    return transpileNode(node.expression, scope);
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
    return Std.var(node.text);
  }

  if (ts.isVariableStatement(node)) {
    const declList = node.declarationList;
    if (declList.declarations[0]) {
      const decl = declList.declarations[0];
      if (ts.isVariableDeclaration(decl) && decl.initializer) {
        const name = decl.name.getText();
        scope.add(name);
        const value = transpileNode(decl.initializer, scope);
        return Std.let(name, value);
      }
    }
  }

  if (ts.isFunctionDeclaration(node)) {
    if (node.name && node.body) {
      const name = node.name.text;
      scope.add(name);
      const params = node.parameters.map((p) => p.name.getText());
      const fnScope = new Set(scope);
      params.forEach((p) => fnScope.add(p));
      const body = transpileNode(node.body, fnScope);
      return Std.let(name, Std.lambda(params, body));
    }
  }

  if (ts.isBinaryExpression(node)) {
    const left = transpileNode(node.left, scope);
    const right = transpileNode(node.right, scope);
    const op = node.operatorToken.kind;

    switch (op) {
      case ts.SyntaxKind.PlusToken:
        return MathLib["+"](left, right);
      case ts.SyntaxKind.MinusToken:
        return MathLib["-"](left, right);
      case ts.SyntaxKind.AsteriskToken:
        return MathLib["*"](left, right);
      case ts.SyntaxKind.SlashToken:
        return MathLib["/"](left, right);
      case ts.SyntaxKind.PercentToken:
        return MathLib["%"](left, right);
      case ts.SyntaxKind.EqualsEqualsEqualsToken:
      case ts.SyntaxKind.EqualsEqualsToken:
        return BooleanLib["=="](left, right);
      case ts.SyntaxKind.ExclamationEqualsEqualsToken:
      case ts.SyntaxKind.ExclamationEqualsToken:
        return BooleanLib["!="](left, right);
      case ts.SyntaxKind.LessThanToken:
        return BooleanLib["<"](left, right);
      case ts.SyntaxKind.GreaterThanToken:
        return BooleanLib[">"](left, right);
      case ts.SyntaxKind.LessThanEqualsToken:
        return BooleanLib["<="](left, right);
      case ts.SyntaxKind.GreaterThanEqualsToken:
        return BooleanLib[">="](left, right);
      case ts.SyntaxKind.AmpersandAmpersandToken:
        return BooleanLib.and(left, right);
      case ts.SyntaxKind.BarBarToken:
        return BooleanLib.or(left, right);
      case ts.SyntaxKind.InKeyword:
        return ObjectLib["obj.has"](right, left);
      case ts.SyntaxKind.AsteriskAsteriskToken:
        return MathLib["^"](left, right);
      case ts.SyntaxKind.EqualsToken:
        // Assignment
        if (Array.isArray(left) && left[0] === "var") {
          return Std.set(left[1], right);
        }
        // Handle object property assignment?
        if (Array.isArray(left) && left[0] === "obj.get") {
          return ObjectLib["obj.set"](left[1], left[2], right);
        }
        throw new Error("Invalid assignment target");
    }
  }

  if (ts.isPrefixUnaryExpression(node)) {
    if (node.operator === ts.SyntaxKind.ExclamationToken) {
      return BooleanLib.not(transpileNode(node.operand, scope));
    }
  }

  if (ts.isDeleteExpression(node)) {
    const expr = transpileNode(node.expression, scope);
    // expr should be ["obj.get", obj, key]
    if (Array.isArray(expr) && expr[0] === "obj.get") {
      return ObjectLib["obj.del"](expr[1], expr[2]);
    }
    // If it's just a property access that wasn't transpiled to obj.get yet?
    // transpileNode handles PropertyAccessExpression and ElementAccessExpression returning obj.get
    // So it should be fine.
    return null;
  }

  if (ts.isArrayLiteralExpression(node)) {
    const elements = node.elements.map((e) => transpileNode(e, scope));
    return List["list.new"](...elements);
  }

  if (ts.isObjectLiteralExpression(node)) {
    const props: any[] = [];
    node.properties.forEach((prop) => {
      if (ts.isPropertyAssignment(prop)) {
        const key = prop.name.getText();
        // Strip quotes if present
        const cleanKey =
          key.startsWith('"') || key.startsWith("'") ? key.slice(1, -1) : key;
        const val = transpileNode(prop.initializer, scope);
        props.push([cleanKey, val]);
      }
    });
    return ObjectLib["obj.new"](...props);
  }

  if (ts.isPropertyAccessExpression(node)) {
    const obj = transpileNode(node.expression, scope);
    const key = node.name.text;
    return ObjectLib["obj.get"](obj, key);
  }

  if (ts.isElementAccessExpression(node)) {
    const obj = transpileNode(node.expression, scope);
    const key = transpileNode(node.argumentExpression, scope);
    return ObjectLib["obj.get"](obj, key);
  }

  if (ts.isCallExpression(node)) {
    const expr = node.expression;
    const args = node.arguments.map((a) => transpileNode(a, scope));

    let opcodeName: string | null = null;

    if (ts.isIdentifier(expr)) {
      opcodeName = expr.text;
      // If it's a local variable, it's NOT an opcode call
      if (scope.has(opcodeName)) {
        opcodeName = null;
      }
    } else if (ts.isPropertyAccessExpression(expr)) {
      const lhs = expr.expression;
      const rhs = expr.name;
      if (ts.isIdentifier(lhs)) {
        opcodeName = `${lhs.text}.${rhs.text}`;
        // If lhs is local, then it's a method call on a local, not an opcode namespace
        if (scope.has(lhs.text)) {
          opcodeName = null;
        }
      }
    }

    if (opcodeName) {
      // Handle sanitization reversal (remove trailing underscore)
      if (opcodeName.endsWith("_")) {
        const potentialOpcode = opcodeName.slice(0, -1);
        if (RESERVED_TYPESCRIPT_KEYWORDS.has(potentialOpcode)) {
          opcodeName = potentialOpcode;
        }
      }

      // Heuristic: If it's not a local variable, assume it's an opcode.
      return [opcodeName, ...args];
    }

    return Std.apply(transpileNode(expr, scope), ...args);
  }

  if (ts.isArrowFunction(node)) {
    const params = node.parameters.map((p) => p.name.getText());
    const fnScope = new Set(scope);
    params.forEach((p) => fnScope.add(p));
    let body = transpileNode(node.body, fnScope);

    // If body is a block, it returns a "seq".
    // Lambda body in ViwoScript can be a seq.

    return Std.lambda(params, body);
  }

  if (ts.isBlock(node)) {
    const blockScope = new Set(scope);
    const stmts = node.statements.map((s) => transpileNode(s, blockScope));
    return Std.seq(...stmts);
  }

  if (ts.isIfStatement(node)) {
    const cond = transpileNode(node.expression, scope);
    const thenStmt = transpileNode(node.thenStatement, scope);
    const elseStmt = node.elseStatement
      ? transpileNode(node.elseStatement, scope)
      : null;

    if (elseStmt) {
      return Std.if(cond, thenStmt, elseStmt);
    }
    return Std.if(cond, thenStmt);
  }

  if (ts.isWhileStatement(node)) {
    const cond = transpileNode(node.expression, scope);
    const body = transpileNode(node.statement, scope);
    return Std.while(cond, body);
  }

  if (ts.isTryStatement(node)) {
    const tryBlock = transpileNode(node.tryBlock, scope);
    const catchClause = node.catchClause;
    if (catchClause) {
      const errVar = catchClause.variableDeclaration
        ? catchClause.variableDeclaration.name.getText()
        : "err";
      const catchScope = new Set(scope);
      catchScope.add(errVar);
      const catchBlock = transpileNode(catchClause.block, catchScope);
      return Std.try(tryBlock, errVar, catchBlock);
    }
    // ViwoScript try expects catch
    return Std.try(tryBlock, "err", Std.seq());
  }

  if (ts.isThrowStatement(node)) {
    return Std.throw(transpileNode(node.expression, scope));
  }

  if (ts.isForOfStatement(node)) {
    const initializer = node.initializer;
    let varName = "";
    const loopScope = new Set(scope);
    if (ts.isVariableDeclarationList(initializer)) {
      varName = initializer.declarations[0]!.name.getText();
      loopScope.add(varName);
    }
    const list = transpileNode(node.expression, scope);
    const body = transpileNode(node.statement, loopScope);

    return Std.for(varName, list, body);
  }

  if (ts.isReturnStatement(node)) {
    // ViwoScript doesn't have explicit return in sequences usually, it returns the last value.
    // But if we are inside a lambda, we might want to just evaluate the expression.
    // If we are in a block, `return x` might be tricky if it's not the last statement.
    // For now, let's just return the expression.
    if (node.expression) {
      return transpileNode(node.expression, scope);
    }
    return null;
  }

  console.warn(`Unsupported node kind: ${node.kind}`);
  return undefined;
}
