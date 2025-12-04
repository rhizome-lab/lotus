import { expect, test } from "bun:test";
import { createScriptContext, evaluate, registerLibrary } from "../interpreter";
import { defineOpcode } from "../def";
import * as Std from "./std";
import * as Boolean from "./boolean";
import * as Math from "./math";

const asyncOp = defineOpcode<[], Promise<number>>("asyncOp", {
  metadata: {
    label: "Async Op",
    category: "test",
    description: "Returns a promise",
    slots: [],
    parameters: [],
    returnType: "number",
  },
  handler: async () => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    return 1;
  },
});

const AsyncLib = {
  asyncOp,
};

test("async while loop", async () => {
  registerLibrary(Std);
  registerLibrary(Boolean);
  registerLibrary(Math);
  registerLibrary(AsyncLib);

  const ctx = createScriptContext({
    caller: null!,
    this: null!,
    args: [],
  });

  // let i = 0;
  // while (i < 5) {
  //    await asyncOp();
  //    i = i + 1;
  // }
  // i

  const script = Std.seq(
    Std.let("i", 0),
    Std.while(
      Boolean.lt(Std.var("i"), 5),
      Std.seq(AsyncLib.asyncOp(), Std.set("i", Math.add(Std.var("i"), 1))),
    ),
    Std.var("i"),
  );

  const result = await evaluate(script, ctx);
  expect(result).toBe(5);
});

test("async for loop", async () => {
  registerLibrary(Std);
  registerLibrary(Boolean);
  registerLibrary(Math);
  registerLibrary(AsyncLib);
  // We need List lib for listNew, but it's not imported.
  // Let's just use a literal array if possible?
  // Std.for takes a block that evaluates to an array.
  // Std.quote([1, 2, 3]) returns the array.

  const ctx = createScriptContext({
    caller: null!,
    this: null!,
    args: [],
  });

  const script = Std.seq(
    Std.let("sum", 0),
    Std.for(
      "x",
      Std.quote([1, 2, 3]),
      Std.seq(AsyncLib.asyncOp(), Std.set("sum", Math.add(Std.var("sum"), Std.var("x")))),
    ),
    Std.var("sum"),
  );

  const result = await evaluate(script, ctx);
  expect(result).toBe(6);
});
