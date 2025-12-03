import { expect, beforeEach } from "bun:test";
import { evaluate, ScriptContext, registerLibrary, createScriptContext } from "../interpreter";
import * as MathOps from "./math";
import { createLibraryTester } from "./test-utils";

createLibraryTester(MathOps, "Math Library", (test) => {
  registerLibrary(MathOps);

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

  // Arithmetic
  test("+", () => {
    expect(evaluate(MathOps["+"](1, 2), ctx)).toBe(3);
    expect(evaluate(MathOps["+"](1, 2, 3), ctx)).toBe(6);
  });

  test("-", () => {
    expect(evaluate(MathOps["-"](3, 1), ctx)).toBe(2);
    expect(evaluate(MathOps["-"](10, 2, 3), ctx)).toBe(5);
  });

  test("*", () => {
    expect(evaluate(MathOps["*"](2, 3), ctx)).toBe(6);
    expect(evaluate(MathOps["*"](2, 3, 4), ctx)).toBe(24);
  });

  test("/", () => {
    expect(evaluate(MathOps["/"](6, 2), ctx)).toBe(3);
    expect(evaluate(MathOps["/"](12, 2, 3), ctx)).toBe(2);
  });

  test("%", () => {
    expect(evaluate(MathOps["%"](5, 2), ctx)).toBe(1);
  });

  test("^", () => {
    expect(evaluate(MathOps["^"](2, 3), ctx)).toBe(8);
    expect(evaluate(MathOps["^"](2, 3, 2), ctx)).toBe(512); // 2^(3^2) = 2^9 = 512
  });

  test("random", () => {
    const r1 = evaluate(MathOps["random"](), ctx);
    expect(r1).toBeGreaterThanOrEqual(0);
    expect(r1).toBeLessThan(1);

    const r2 = evaluate(MathOps["random"](10), ctx);
    expect(r2).toBeGreaterThanOrEqual(0);
    expect(r2).toBeLessThanOrEqual(10);

    const r3 = evaluate(MathOps["random"](5, 10), ctx);
    expect(r3).toBeGreaterThanOrEqual(5);
    expect(r3).toBeLessThanOrEqual(10);
  });
});
