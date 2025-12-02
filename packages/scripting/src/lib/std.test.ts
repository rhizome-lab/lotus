import { expect, beforeEach, mock } from "bun:test";
import { createLibraryTester } from "./test-utils";
import {
  createScriptContext,
  registerLibrary,
  ScriptContext,
} from "../interpreter";
import { evaluate } from "../interpreter";
import * as Std from "./std";
import * as List from "./list";
import * as Boolean from "./boolean";
import * as Math from "./math";

// Mock repo functions
mock.module("../../repo", () => ({
  createEntity: () => 100,
  deleteEntity: () => {},
  getEntity: (id: number) => ({ id, props: {} }),
  getPrototypeId: () => null,
  getVerbs: (id: number) => {
    if (id === 101) {
      return [{ name: "get_dynamic", code: "resolved_value" }];
    }
    return [];
  },
  setPrototypeId: () => {},
  updateEntity: () => {},
  getVerb: (id: number, name: string) => {
    if (id === 101 && name === "get_dynamic") {
      return {
        id: 1,
        entity_id: 101,
        name: "get_dynamic",
        code: "resolved_value",
        permissions: {},
      };
    }
    return null;
  },
}));

// Mock scheduler
mock.module("../../scheduler", () => ({
  scheduler: {
    schedule: () => {},
  },
}));

createLibraryTester(Std, "Core Library", (test) => {
  registerLibrary(Std);
  registerLibrary(List);

  let ctx: ScriptContext;

  beforeEach(() => {
    ctx = createScriptContext({
      caller: { id: 1 } as any,
      this: { id: 2 } as any,
      args: [10, 20],
      send: () => {},
      warnings: [],
    });
  });

  // Values
  test("this", async () => {
    expect(await evaluate(Std["this"](), ctx)).toEqual({ id: 2 });
  });

  test("caller", async () => {
    expect(await evaluate(Std["caller"](), ctx)).toEqual({ id: 1 });
  });

  // Control Flow
  test("seq", async () => {
    expect(await evaluate(Std["seq"](1, 2, 3), ctx)).toBe(3);
  });

  test("if", async () => {
    expect(await evaluate(Std["if"](true, 1, 2), ctx)).toBe(1);
    expect(await evaluate(Std["if"](false, 1, 2), ctx)).toBe(2);
    expect(await evaluate(Std["if"](false, 1), ctx)).toBe(null);
  });

  test("while", async () => {
    const localCtx = { ...ctx, locals: {} };
    await evaluate(Std["let"]("i", 0), localCtx);
    await evaluate(
      Std["while"](
        Boolean["<"](Std["var"]("i"), 3),
        Std["set"]("i", Math["+"](Std["var"]("i"), 1)),
      ),
      localCtx,
    );
    expect(await evaluate(Std["var"]("i"), localCtx)).toBe(3);
  });

  test("for", async () => {
    const localCtx = { ...ctx, locals: {} };
    await evaluate(Std["let"]("sum", 0), localCtx);
    await evaluate(
      Std["for"](
        "x",
        List["list.new"](1, 2, 3),
        Std["set"]("sum", Math["+"](Std["var"]("sum"), Std["var"]("x"))),
      ),
      localCtx,
    );
    expect(await evaluate(Std["var"]("sum"), localCtx)).toBe(6);
  });

  // Data Structures
  test("json.stringify", async () => {
    expect(await evaluate(Std["json.stringify"]({ a: 1 }), ctx)).toBe(
      '{"a":1}',
    );
  });

  test("json.parse", async () => {
    expect(await evaluate(Std["json.parse"]('{"a":1}'), ctx)).toEqual({
      a: 1,
    });
    expect(await evaluate(Std["json.parse"]("invalid"), ctx)).toBe(null);
  });

  // Variables
  test("let", async () => {
    const localCtx = { ...ctx, locals: {} };
    expect(await evaluate(Std["let"]("x", 10), localCtx)).toBe(10);
    expect(localCtx.vars?.["x"]).toBe(10);
  });

  test("var", async () => {
    const localCtx = { ...ctx, locals: {}, vars: { x: 10 } };
    expect(await evaluate(Std["var"]("x"), localCtx)).toBe(10);
    expect(await evaluate(Std["var"]("y"), localCtx)).toBe(null);
  });

  test("set", async () => {
    const localCtx = { ...ctx, locals: {}, vars: { x: 10 } };
    expect(await evaluate(Std["set"]("x", 20), localCtx)).toBe(20);
    expect(localCtx.vars?.x).toBe(20);
  });

  // Arithmetic

  test("typeof", async () => {
    expect(await evaluate(Std["typeof"](1), ctx)).toBe("number");
    expect(await evaluate(Std["typeof"]("s"), ctx)).toBe("string");
    expect(await evaluate(Std["typeof"](true), ctx)).toBe("boolean");
    expect(await evaluate(Std["typeof"]({}), ctx)).toBe("object");
    expect(await evaluate(Std["typeof"](List["list.new"]()), ctx)).toBe(
      "array",
    );
    expect(await evaluate(Std["typeof"](null), ctx)).toBe("null");
  });

  // System
  test("log", async () => {
    // Mock console.log? Or just ensure it runs without error
    await evaluate(Std["log"]("hello"), ctx);
  });

  test("arg", async () => {
    expect(await evaluate(Std["arg"](0), ctx)).toBe(10);
    expect(await evaluate(Std["arg"](1), ctx)).toBe(20);
    expect(await evaluate(Std["arg"](2), ctx)).toBe(null);
  });

  test("args", async () => {
    expect(await evaluate(Std["args"](), ctx)).toEqual([10, 20]);
  });

  test("warn", async () => {
    await evaluate(Std["warn"]("warning"), ctx);
    expect(ctx.warnings).toContain("warning");
  });

  test("throw", async () => {
    expect(evaluate(Std["throw"]("error"), ctx)).rejects.toThrow("error");
  });

  test("try", async () => {
    expect(
      await evaluate(
        Std["try"](Std["throw"]("oops"), "err", Std["var"]("err")),
        ctx,
      ),
    ).toBe("oops");

    expect(await evaluate(Std["try"](123, "err", 456), ctx)).toBe(123);
  });

  test("lambda", async () => {
    const l = await evaluate(Std["lambda"](["x"], Std["var"]("x")), ctx);
    expect(l.type).toBe("lambda");
  });

  test("apply", async () => {
    const l = await evaluate(Std["lambda"](["x"], Std["var"]("x")), ctx);
    expect(await evaluate(Std["apply"](l, 123), ctx)).toBe(123);
  });

  test("send", async () => {
    // We mocked send in ctx, just check it doesn't crash
    await evaluate(Std["send"]("message", "hello"), ctx);
  });

  test("quote", async () => {
    expect(await evaluate(Std["quote"]([1, 2, 3]), ctx)).toEqual([1, 2, 3]);
    expect(await evaluate(Std["quote"]("hello"), ctx)).toBe("hello");
  });
});
