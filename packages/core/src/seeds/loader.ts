import { readFileSync } from "node:fs";
import { transpile } from "@viwo/scripting";
import ts from "typescript";

interface EntityDefinition {
  props: Record<string, any>;
  verbs: Map<string, any>; // S-expressions
}

export function loadEntityDefinition(
  filePath: string,
  className: string,
  replacements: Record<string, string> = {},
): EntityDefinition {
  const content = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

  const classDecl = sourceFile.statements.find(
    (stmt) => ts.isClassDeclaration(stmt) && stmt.name?.text === className,
  ) as ts.ClassDeclaration;

  if (!classDecl) {
    throw new Error(`Class ${className} not found in ${filePath}`);
  }

  const props: Record<string, any> = {};
  const verbs = new Map<string, any>();

  classDecl.members.forEach((member) => {
    if (ts.isPropertyDeclaration(member)) {
      if (member.name && ts.isIdentifier(member.name) && member.initializer) {
        const propName = member.name.text;
        // Simple extraction of literal values
        // We might want to use the transpiler to evaluate dynamic expressions if needed,
        // but for now let's support basic literals.
        const val = extractLiteral(member.initializer);
        if (val !== undefined) {
          props[propName] = val;
        }
      }
    } else if (ts.isMethodDeclaration(member)) {
      if (member.name && ts.isIdentifier(member.name) && member.body) {
        const verbName = member.name.text;
        // Reconstruct as function to use our transpiler logic
        // "export function verbName(args) { body }"

        // Extract parameters text
        const params = member.parameters.map((parameter) => parameter.getText()).join(", ");

        // Extract body text including braces
        let bodyText = member.body.getText();

        // Apply replacements
        for (const [key, val] of Object.entries(replacements)) {
          bodyText = bodyText.replaceAll(key, val);
        }

        const funcCode = `export function ${verbName}(${params}) ${bodyText}`;
        const compiled = transpile(funcCode);
        verbs.set(verbName, compiled);
      }
    }
  });

  return { props, verbs };
}

function extractLiteral(node: ts.Node): any {
  if (ts.isStringLiteral(node)) {
    return node.text;
  }
  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
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
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map(extractLiteral).filter((value) => value !== undefined);
  }
  return undefined;
}
