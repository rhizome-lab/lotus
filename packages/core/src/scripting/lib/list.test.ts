import { describe, test, expect, beforeEach } from "bun:test";
import { evaluate, ScriptContext, registerLibrary } from "../interpreter";
import { CoreLibrary } from "./core";
import { ListLibrary } from "./list";

describe("List Library", () => {
  let ctx: ScriptContext;

  beforeEach(() => {
    registerLibrary(CoreLibrary);
    registerLibrary(ListLibrary);
    ctx = {
      caller: { id: 1 } as any,
      this: { id: 2 } as any,
      args: [],
      gas: 1000,
      warnings: [],
    };
  });

  test("list.len", async () => {
    expect(await evaluate(["list.len", ["list", 1, 2, 3]], ctx)).toBe(3);
    expect(await evaluate(["list.len", ["list"]], ctx)).toBe(0);
  });

  test("list.get", async () => {
    expect(await evaluate(["list.get", ["list", 10, 20], 1], ctx)).toBe(20);
    expect(await evaluate(["list.get", ["list", 10, 20], 5], ctx)).toBe(
      undefined,
    );
  });

  test("list.set", async () => {
    const localCtx = { ...ctx, locals: {} };
    await evaluate(["let", "l", ["list", 1, 2, 3]], localCtx);
    await evaluate(["list.set", ["var", "l"], 1, 99], localCtx);
    expect(await evaluate(["var", "l"], localCtx)).toEqual([1, 99, 3]);
  });

  test("list.push/pop", async () => {
    const localCtx = { ...ctx, locals: {} };
    await evaluate(["let", "l", ["list", 1, 2]], localCtx);

    expect(await evaluate(["list.push", ["var", "l"], 3], localCtx)).toBe(3); // Returns new length
    expect(await evaluate(["var", "l"], localCtx)).toEqual([1, 2, 3]);

    expect(await evaluate(["list.pop", ["var", "l"]], localCtx)).toBe(3); // Returns popped value
    expect(await evaluate(["var", "l"], localCtx)).toEqual([1, 2]);
  });

  test("list.unshift/shift", async () => {
    const localCtx = { ...ctx, locals: {} };
    await evaluate(["let", "l", ["list", 2, 3]], localCtx);

    expect(await evaluate(["list.unshift", ["var", "l"], 1], localCtx)).toBe(3);
    expect(await evaluate(["var", "l"], localCtx)).toEqual([1, 2, 3]);

    expect(await evaluate(["list.shift", ["var", "l"]], localCtx)).toBe(1);
    expect(await evaluate(["var", "l"], localCtx)).toEqual([2, 3]);
  });

  test("list.slice", async () => {
    const list = [1, 2, 3, 4, 5];
    // list.slice returns a new list
    expect(
      await evaluate(["list.slice", ["list", ...list], 1, 3], ctx),
    ).toEqual([2, 3]);
  });

  test("list.splice", async () => {
    const localCtx = { ...ctx, locals: {} };
    await evaluate(["let", "l", ["list", 1, 2, 3, 4]], localCtx);

    // Remove 2 elements starting at index 1, insert 99
    const removed = await evaluate(
      ["list.splice", ["var", "l"], 1, 2, 99],
      localCtx,
    );
    expect(removed).toEqual([2, 3]);
    expect(await evaluate(["var", "l"], localCtx)).toEqual([1, 99, 4]);
  });

  test("list.concat", async () => {
    expect(
      await evaluate(["list.concat", ["list", 1], ["list", 2]], ctx),
    ).toEqual([1, 2]);
  });

  test("list.includes", async () => {
    expect(await evaluate(["list.includes", ["list", 1, 2], 2], ctx)).toBe(
      true,
    );
    expect(await evaluate(["list.includes", ["list", 1, 2], 3], ctx)).toBe(
      false,
    );
  });

  test("list.reverse", async () => {
    const localCtx = { ...ctx, locals: {} };
    await evaluate(["let", "l", ["list", 1, 2, 3]], localCtx);
    await evaluate(["list.reverse", ["var", "l"]], localCtx);
    expect(await evaluate(["var", "l"], localCtx)).toEqual([3, 2, 1]);
  });

  test("list.sort", async () => {
    const localCtx = { ...ctx, locals: {} };
    await evaluate(["let", "l", ["list", "b", "a", "c"]], localCtx);
    await evaluate(["list.sort", ["var", "l"]], localCtx);
    expect(await evaluate(["var", "l"], localCtx)).toEqual(["a", "b", "c"]);
  });

  // HOF tests
  test("list.map", async () => {
    const inc = ["lambda", ["x"], ["+", ["var", "x"], 1]];
    expect(await evaluate(["list.map", ["list", 1, 2, 3], inc], ctx)).toEqual([
      2, 3, 4,
    ]);
  });

  test("list.filter", async () => {
    // (lambda (x) (> x 1))
    const gt1 = ["lambda", ["x"], [">", ["var", "x"], 1]];
    expect(
      await evaluate(["list.filter", ["list", 1, 2, 3], gt1], ctx),
    ).toEqual([2, 3]);
  });

  test("list.reduce", async () => {
    // (lambda (acc x) (+ acc x))
    const sum = ["lambda", ["acc", "x"], ["+", ["var", "acc"], ["var", "x"]]];
    expect(
      await evaluate(["list.reduce", ["list", 1, 2, 3], sum, 0], ctx),
    ).toBe(6);
  });

  test("list.flatMap", async () => {
    // (lambda (x) (list x (+ x 1)))
    const dup = [
      "lambda",
      ["x"],
      ["list", ["var", "x"], ["+", ["var", "x"], 1]],
    ];
    expect(await evaluate(["list.flatMap", ["list", 1, 3], dup], ctx)).toEqual([
      1, 2, 3, 4,
    ]);
  });
});
