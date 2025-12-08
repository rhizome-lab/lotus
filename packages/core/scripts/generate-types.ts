// oxlint-disable
// Use in-memory DB
process.env.NODE_ENV = "test";
import {
  MathLib,
  BooleanLib,
  ListLib,
  ObjectLib,
  StringLib,
  TimeLib,
  StdLib,
  generateTypeDefinitions,
  RandomLib,
  type ClassMetadata,
  type MethodMetadata,
  type PropertyMetadata,
} from "@viwo/scripting";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import * as CoreLib from "../src/runtime/lib/core";
import * as KernelLib from "../src/runtime/lib/kernel";
import { Project, SyntaxKind, type ClassDeclaration, Scope } from "ts-morph";

const libraries = [
  CoreLib,
  KernelLib,
  MathLib,
  BooleanLib,
  ListLib,
  ObjectLib,
  StringLib,
  TimeLib,
  StdLib,
  RandomLib,
];
const opcodes = libraries.flatMap((lib) => Object.values(lib).map((value) => value.metadata));

// Introspect Classes using ts-morph
const project = new Project();
project.addSourceFilesAtPaths([
  join(import.meta.dir, "../src/runtime/wrappers.ts"),
  join(import.meta.dir, "../src/runtime/capabilities.ts"),
]);

function extractMetadata(cls: ClassDeclaration, nameOverride?: string): ClassMetadata {
  const methods: MethodMetadata[] = cls
    .getMethods()
    .filter((m) => m.getScope() === Scope.Public && !m.isStatic())
    .map((m) => ({
      name: m.getName(),
      description: m.getJsDocs()[0]?.getDescription().trim(),
      parameters: m
        .getParameters()
        .filter((p) => {
          const typeText = p.getType().getText(p);
          const name = p.getName();
          return !typeText.includes("ScriptContext") && name !== "ctx" && name !== "_ctx";
        })
        .map((p) => ({
          name: p.getName(),
          type: p.getType().getText(p), // Use type text
          optional: p.isOptional(),
        })),
      returnType: m.getReturnType().getText(m),
    }));

  const properties: PropertyMetadata[] = cls
    .getProperties()
    .filter((p) => !p.isStatic() && (p.getScope() === Scope.Public || p.getScope() === undefined)) // default is public
    .map((p) => ({
      name: p.getName(),
      type: p.getType().getText(p),
      description: p.getJsDocs()[0]?.getDescription().trim(),
    }));

  // Handle index signature if present
  let indexSignature: string | undefined;
  const indexSig = cls.getMembers().find((m) => m.getKind() === SyntaxKind.IndexSignature);
  if (indexSig) {
    indexSignature = indexSig.getText();
  }

  // Handle implements
  const implementsClauses = cls.getImplements().map((i) => i.getExpression().getText());

  return {
    name: nameOverride ?? cls.getName()!,
    description: cls.getJsDocs()[0]?.getDescription().trim(),
    methods,
    properties,
    indexSignature,
    implements: implementsClauses.length ? implementsClauses : undefined,
  };
}

const classes: ClassMetadata[] = [];

// WrappedEntity -> Entity
const wrappersFile = project.getSourceFileOrThrow("wrappers.ts");
const wrappedEntity = wrappersFile.getClassOrThrow("WrappedEntity");
classes.push(extractMetadata(wrappedEntity, "Entity"));

// EntityControl
const capabilitiesFile = project.getSourceFileOrThrow("capabilities.ts");
const entityControl = capabilitiesFile.getClassOrThrow("EntityControl");
classes.push(extractMetadata(entityControl));

const definitions = generateTypeDefinitions(opcodes, classes);
const outputPath = join(import.meta.dir, "../src/generated_types.ts");

writeFileSync(outputPath, definitions);
console.log(`Generated type definitions at ${outputPath}`);
