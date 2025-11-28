import { describe, test, expect, beforeEach } from "bun:test";
import {
  evaluate,
  ScriptContext,
  registerLibrary,
  ScriptError,
} from "../interpreter";
import { CoreLibrary } from "./core";
import { ObjectLibrary } from "./object";
import { StringLibrary } from "./string"; // Needed for str.concat in flatMap test

describe("Object Library", () => {
  let ctx: ScriptContext;

  beforeEach(() => {
    registerLibrary(CoreLibrary);
    registerLibrary(ObjectLibrary);
    registerLibrary(StringLibrary); // Register string lib for dependencies
    ctx = {
      caller: { id: 1 } as any,
      this: { id: 2 } as any,
      args: [],
      gas: 1000,
      warnings: [],
    };
  });

  test("obj.keys", async () => {
    expect(await evaluate(["obj.keys", { a: 1, b: 2 }], ctx)).toEqual([
      "a",
      "b",
    ]);
    expect(await evaluate(["obj.keys", {}], ctx)).toEqual([]);
  });

  test("obj.values", async () => {
    expect(await evaluate(["obj.values", { a: 1, b: 2 }], ctx)).toEqual([1, 2]);
  });

  test("obj.entries", async () => {
    expect(await evaluate(["obj.entries", { a: 1 }], ctx)).toEqual([["a", 1]]);
  });

  test("obj.get", async () => {
    expect(await evaluate(["obj.get", { a: 1 }, "a"], ctx)).toBe(1);
    expect(
      await evaluate(["obj.get", { a: 1 }, "b"], ctx).catch((e) => e),
    ).toBeInstanceOf(ScriptError);
  });

  test("obj.set", async () => {
    const localCtx = { ...ctx, locals: {} };
    await evaluate(["let", "o", { a: 1 }], localCtx);
    await evaluate(["obj.set", ["var", "o"], "b", 2], localCtx);
    expect(await evaluate(["var", "o"], localCtx)).toEqual({ a: 1, b: 2 });
  });

  test("obj.has", async () => {
    expect(await evaluate(["obj.has", { a: 1 }, "a"], ctx)).toBe(true);
    expect(await evaluate(["obj.has", { a: 1 }, "b"], ctx)).toBe(false);
  });

  test("obj.del", async () => {
    const localCtx = { ...ctx, locals: {} };
    await evaluate(["let", "o", { a: 1, b: 2 }], localCtx);
    expect(await evaluate(["obj.del", ["var", "o"], "a"], localCtx)).toBe(true);
    expect(await evaluate(["var", "o"], localCtx)).toEqual({ b: 2 });
    expect(await evaluate(["obj.del", ["var", "o"], "c"], localCtx)).toBe(
      false,
    );
  });

  test("obj.merge", async () => {
    expect(
      await evaluate(["obj.merge", { a: 1 }, { b: 2, a: 3 }], ctx),
    ).toEqual({ a: 3, b: 2 });
  });

  // HOF tests
  test("obj.map", async () => {
    // (lambda (val key) (+ val 1))
    const inc = ["lambda", ["val", "key"], ["+", ["var", "val"], 1]];
    expect(await evaluate(["obj.map", { a: 1, b: 2 }, inc], ctx)).toEqual({
      a: 2,
      b: 3,
    });
  });

  test("obj.filter", async () => {
    // (lambda (val key) (> val 1))
    const gt1 = ["lambda", ["val", "key"], [">", ["var", "val"], 1]];
    expect(await evaluate(["obj.filter", { a: 1, b: 2 }, gt1], ctx)).toEqual({
      b: 2,
    });
  });

  test("obj.reduce", async () => {
    // (lambda (acc val key) (+ acc val))
    const sum = [
      "lambda",
      ["acc", "val", "key"],
      ["+", ["var", "acc"], ["var", "val"]],
    ];
    expect(await evaluate(["obj.reduce", { a: 1, b: 2 }, sum, 0], ctx)).toBe(3);
  });

  test("obj.flatMap", async () => {
    // (lambda (val key) { [key]: val, [key + "_dup"]: val })
    const expand = [
      "lambda",
      ["val", "key"],
      [
        "seq",
        ["let", "o", {}],
        ["obj.set", ["var", "o"], ["var", "key"], ["var", "val"]],
        [
          "obj.set",
          ["var", "o"],
          ["str.concat", ["var", "key"], "_dup"],
          ["var", "val"],
        ],
        ["var", "o"],
      ],
    ];

    expect(await evaluate(["obj.flatMap", { a: 1 }, expand], ctx)).toEqual({
      a: 1,
      a_dup: 1,
    });
  });
});
