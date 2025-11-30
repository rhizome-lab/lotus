import { describe, test, expect, beforeEach } from "bun:test";
import {
  evaluate,
  ScriptContext,
  registerLibrary,
  createScriptContext,
} from "../interpreter";
import * as Core from "./core";
import * as List from "./list";

describe("List Library", () => {
  registerLibrary(Core);
  registerLibrary(List);

  let ctx: ScriptContext;

  beforeEach(() => {
    ctx = createScriptContext({
      caller: { id: 1 } as any,
      this: { id: 2 } as any,
    });
  });

  test("list.len", async () => {
    expect(
      await evaluate(List["list.len"](List["list.new"](1, 2, 3)), ctx),
    ).toBe(3);
    expect(await evaluate(List["list.len"](List["list.new"]()), ctx)).toBe(0);
  });

  test("list.get", async () => {
    expect(
      await evaluate(List["list.get"](List["list.new"](10, 20), 1), ctx),
    ).toBe(20);
    expect(
      await evaluate(List["list.get"](List["list.new"](10, 20), 5), ctx),
    ).toBe(undefined);
  });

  test("list.set", async () => {
    const localCtx = { ...ctx, locals: {} };
    await evaluate(Core["let"]("l", List["list.new"](1, 2, 3)), localCtx);
    await evaluate(List["list.set"](Core["var"]("l"), 1, 99), localCtx);
    expect(await evaluate(Core["var"]("l"), localCtx)).toEqual([1, 99, 3]);
  });

  test("list.push/pop", async () => {
    const localCtx = { ...ctx, locals: {} };
    await evaluate(Core["let"]("l", List["list.new"](1, 2)), localCtx);

    expect(
      await evaluate(List["list.push"](Core["var"]("l"), 3), localCtx),
    ).toBe(3); // Returns new length
    expect(await evaluate(Core["var"]("l"), localCtx)).toEqual([1, 2, 3]);

    expect(await evaluate(List["list.pop"](Core["var"]("l")), localCtx)).toBe(
      3,
    ); // Returns popped value
    expect(await evaluate(Core["var"]("l"), localCtx)).toEqual([1, 2]);
  });

  test("list.unshift/shift", async () => {
    const localCtx = { ...ctx, locals: {} };
    await evaluate(Core["let"]("l", List["list.new"](2, 3)), localCtx);

    expect(
      await evaluate(List["list.unshift"](Core["var"]("l"), 1), localCtx),
    ).toBe(3);
    expect(await evaluate(Core["var"]("l"), localCtx)).toEqual([1, 2, 3]);

    expect(await evaluate(List["list.shift"](Core["var"]("l")), localCtx)).toBe(
      1,
    );
    expect(await evaluate(Core["var"]("l"), localCtx)).toEqual([2, 3]);
  });

  test("list.slice", async () => {
    const list = [1, 2, 3, 4, 5];
    // list.slice returns a new list
    expect(
      await evaluate(List["list.slice"](List["list.new"](...list), 1, 3), ctx),
    ).toEqual([2, 3]);
  });

  test("list.splice", async () => {
    const localCtx = { ...ctx, locals: {} };
    await evaluate(Core["let"]("l", List["list.new"](1, 2, 3, 4)), localCtx);

    // Remove 2 elements starting at index 1, insert 99
    const removed = await evaluate(
      List["list.splice"](Core["var"]("l"), 1, 2, 99),
      localCtx,
    );
    expect(removed).toEqual([2, 3]);
    expect(await evaluate(Core["var"]("l"), localCtx)).toEqual([1, 99, 4]);
  });

  test("list.concat", async () => {
    expect(
      await evaluate(
        List["list.concat"](List["list.new"](1), List["list.new"](2)),
        ctx,
      ),
    ).toEqual([1, 2]);
  });

  test("list.includes", async () => {
    expect(
      await evaluate(List["list.includes"](List["list.new"](1, 2), 2), ctx),
    ).toBe(true);
    expect(
      await evaluate(List["list.includes"](List["list.new"](1, 2), 3), ctx),
    ).toBe(false);
  });

  test("list.reverse", async () => {
    const localCtx = { ...ctx, locals: {} };
    await evaluate(Core["let"]("l", List["list.new"](1, 2, 3)), localCtx);
    await evaluate(List["list.reverse"](Core["var"]("l")), localCtx);
    expect(await evaluate(Core["var"]("l"), localCtx)).toEqual([3, 2, 1]);
  });

  test("list.sort", async () => {
    const localCtx = { ...ctx, locals: {} };
    await evaluate(Core["let"]("l", List["list.new"]("b", "a", "c")), localCtx);
    await evaluate(List["list.sort"](Core["var"]("l")), localCtx);
    expect(await evaluate(Core["var"]("l"), localCtx)).toEqual(["a", "b", "c"]);
  });

  // HOF tests
  test("list.map", async () => {
    const inc = Core["lambda"](["x"], Core["+"](Core["var"]("x"), 1));
    expect(
      await evaluate(List["list.map"](List["list.new"](1, 2, 3), inc), ctx),
    ).toEqual([2, 3, 4]);
  });

  test("list.filter", async () => {
    // (lambda (x) (> x 1))
    const gt1 = Core["lambda"](["x"], Core[">"](Core["var"]("x"), 1));
    expect(
      await evaluate(List["list.filter"](List["list.new"](1, 2, 3), gt1), ctx),
    ).toEqual([2, 3]);
  });

  test("list.reduce", async () => {
    // (lambda (acc x) (+ acc x))
    const sum = Core["lambda"](
      ["acc", "x"],
      Core["+"](Core["var"]("acc"), Core["var"]("x")),
    );
    expect(
      await evaluate(
        List["list.reduce"](List["list.new"](1, 2, 3), sum, 0),
        ctx,
      ),
    ).toBe(6);
  });

  test("list.flatMap", async () => {
    // (lambda (x) (list x (+ x 1)))
    const dup = Core["lambda"](
      ["x"],
      List["list.new"](Core["var"]("x"), Core["+"](Core["var"]("x"), 1)),
    );
    expect(
      await evaluate(List["list.flatMap"](List["list.new"](1, 3), dup), ctx),
    ).toEqual([1, 2, 3, 4]);
  });
});
