import { expect, beforeEach } from "bun:test";
import { evaluate, ScriptContext, registerLibrary, createScriptContext } from "../interpreter";
import * as BooleanOps from "./boolean";
import { createLibraryTester } from "./test-utils";

createLibraryTester(BooleanOps, "Boolean Library", (test) => {
  registerLibrary(BooleanOps);

  let ctx: ScriptContext;

  beforeEach(() => {
    ctx = createScriptContext({
      caller: { id: 1 } as any,
      this: { id: 2 } as any,
      args: [],
      send: () => {},
      warnings: [],
    });
  });

  // Comparison
  test("==", () => {
    expect(evaluate(BooleanOps["=="](1, 1), ctx)).toBe(true);
    expect(evaluate(BooleanOps["=="](1, 2), ctx)).toBe(false);
    expect(evaluate(BooleanOps["=="](1, 1, 1), ctx)).toBe(true);
  });

  test("!=", () => {
    expect(evaluate(BooleanOps["!="](1, 2), ctx)).toBe(true);
    expect(evaluate(BooleanOps["!="](1, 1), ctx)).toBe(false);
  });

  test("<", () => {
    expect(evaluate(BooleanOps["<"](1, 2), ctx)).toBe(true);
    expect(evaluate(BooleanOps["<"](2, 1), ctx)).toBe(false);
    expect(evaluate(BooleanOps["<"](1, 2, 3), ctx)).toBe(true);
  });

  test(">", () => {
    expect(evaluate(BooleanOps[">"](2, 1), ctx)).toBe(true);
    expect(evaluate(BooleanOps[">"](1, 2), ctx)).toBe(false);
  });

  test("<=", () => {
    expect(evaluate(BooleanOps["<="](1, 1), ctx)).toBe(true);
    expect(evaluate(BooleanOps["<="](1, 2), ctx)).toBe(true);
    expect(evaluate(BooleanOps["<="](2, 1), ctx)).toBe(false);
  });

  test(">=", () => {
    expect(evaluate(BooleanOps[">="](1, 1), ctx)).toBe(true);
    expect(evaluate(BooleanOps[">="](2, 1), ctx)).toBe(true);
    expect(evaluate(BooleanOps[">="](1, 2), ctx)).toBe(false);
  });

  // Logic
  test("and", () => {
    expect(evaluate(BooleanOps["and"](true, true), ctx)).toBe(true);
    expect(evaluate(BooleanOps["and"](true, false), ctx)).toBe(false);
  });

  test("or", () => {
    expect(evaluate(BooleanOps["or"](false, true), ctx)).toBe(true);
    expect(evaluate(BooleanOps["or"](false, false), ctx)).toBe(false);
  });

  test("not", () => {
    expect(evaluate(BooleanOps["not"](true), ctx)).toBe(false);
    expect(evaluate(BooleanOps["not"](false), ctx)).toBe(true);
  });
});
