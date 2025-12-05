import { expect, test, describe } from "bun:test";
import {
  evaluate,
  createScriptContext,
  registerLibrary,
  StdLib,
  MathLib,
  BooleanLib,
  ListLib,
  ObjectLib,
  compile,
  ScriptContext,
} from "./index";

// Register libraries once
registerLibrary(StdLib);
registerLibrary(MathLib);
registerLibrary(BooleanLib);
registerLibrary(ListLib);
registerLibrary(ObjectLib);

function createTestContext(): ScriptContext {
  return createScriptContext({
    this: { id: 100 } as any,
    caller: { id: 200 } as any,
    args: [],
    gas: 10000,
  });
}

async function checkParity(name: string, ast: any, ctxOverride?: Partial<ScriptContext>) {
  test(name, async () => {
    const ctx1 = { ...createTestContext(), ...ctxOverride };
    const ctx2 = { ...createTestContext(), ...ctxOverride };

    let resInterp, errInterp;
    try {
      resInterp = await evaluate(ast, ctx1);
    } catch (e: any) {
      errInterp = e;
    }

    let resCompile, errCompile;
    try {
      const compiledFn = compile(ast);
      resCompile = await compiledFn(ctx2);
    } catch (e: any) {
      errCompile = e;
    }

    if (errInterp) {
      expect(errCompile).toBeDefined();
      // We might want to check error message parity too, but for now just existence
      // expect(errCompile.message).toBe(errInterp.message);
    } else {
      expect(errCompile).toBeUndefined();
      expect(resCompile).toEqual(resInterp);

      // Also check that they produced the same side effects on vars if any
      // Note: This requires the compiler to implement scoping correctly!
      expect(ctx2.vars).toEqual(ctx1.vars);
    }
  });
}

describe("Parity: Interpreter vs Compiler", () => {
  describe("Primitives", () => {
    checkParity("number", 123);
    checkParity("string", "hello");
    checkParity("boolean", true);
    checkParity("null", null);
    checkParity("array", [1, 2, 3]); // This is actually a list literal in AST if not quoted? No, [1,2,3] is a node with op 1? No, AST is JSON.
    // Wait, [1, 2, 3] in AST is (1 2 3) which is op=1 with args 2,3.
    // If we want a list literal we need quote or list.new.
    // But `evaluate` handles non-array as literal.
    // Arrays in AST are function calls.

    checkParity("quoted list", ["quote", [1, 2, 3]]);
  });

  describe("Arithmetic", () => {
    checkParity("add", ["+", 1, 2]);
    checkParity("sub", ["-", 10, 2]);
    checkParity("mul", ["*", 3, 4]);
    checkParity("div", ["/", 20, 5]);
    checkParity("mod", ["%", 10, 3]);
    checkParity("pow", ["^", 2, 3]);
    checkParity("nested math", ["+", ["*", 2, 3], ["-", 10, 4]]);
  });

  describe("Logic", () => {
    checkParity("eq true", ["==", 1, 1]);
    checkParity("eq false", ["==", 1, 2]);
    checkParity("neq", ["!=", 1, 2]);
    checkParity("lt", ["<", 1, 2]);
    checkParity("gt", [">", 2, 1]);
    checkParity("lte", ["<=", 1, 1]);
    checkParity("gte", [">=", 1, 1]);
    checkParity("and", ["and", true, false]);
    checkParity("or", ["or", false, true]);
    checkParity("not", ["not", true]);
  });

  describe("Control Flow", () => {
    checkParity("if true", ["if", true, 10, 20]);
    checkParity("if false", ["if", false, 10, 20]);
    checkParity("seq", ["seq", 1, 2, 3]);

    checkParity("while", [
      "seq",
      ["let", "i", 0],
      ["while", ["<", ["var", "i"], 3], ["set", "i", ["+", ["var", "i"], 1]]],
      ["var", "i"],
    ]);
  });

  describe("Variables", () => {
    checkParity("let/var", ["seq", ["let", "x", 42], ["var", "x"]]);

    checkParity("set", ["seq", ["let", "x", 1], ["set", "x", 2], ["var", "x"]]);
  });

  describe("Functions", () => {
    checkParity("lambda apply", ["apply", ["lambda", ["x"], ["*", ["var", "x"], 2]], 21]);

    checkParity("lambda closure", [
      "seq",
      ["let", "a", 10],
      ["apply", ["lambda", ["x"], ["+", ["var", "x"], ["var", "a"]]], 5],
    ]);
  });

  describe("Objects", () => {
    checkParity("obj.new", ["obj.new", ["a", 1], ["b", 2]]);
    checkParity("obj.get", ["obj.get", ["obj.new", ["a", 1]], "a"]);
  });
  describe("Chained Expressions", () => {
    checkParity("chained add", ["+", 1, 2, 3, 4]);
    checkParity("chained sub", ["-", 10, 1, 2, 3]);
    checkParity("chained mul", ["*", 1, 2, 3, 4]);
    checkParity("chained div", ["/", 24, 2, 3, 2]);
    checkParity("chained pow", ["^", 2, 3, 2]); // 2^3^2 = 64 (left associative)

    checkParity("chained and", ["and", true, true, true]);
    checkParity("chained and false", ["and", true, false, true]);
    checkParity("chained or", ["or", false, false, true]);
    checkParity("chained or false", ["or", false, false, false]);

    checkParity("chained lt", ["<", 1, 2, 3]);
    checkParity("chained gt", [">", 3, 2, 1]);
    checkParity("chained lte", ["<=", 1, 2, 2, 3]);
    checkParity("chained gte", [">=", 3, 2, 2, 1]);

    // Fail cases
    checkParity("chained lt fail", ["<", 1, 3, 2]);
  });
});
