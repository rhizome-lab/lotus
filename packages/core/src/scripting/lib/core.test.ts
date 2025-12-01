import { expect, beforeEach, mock } from "bun:test";
import {
  evaluate,
  ScriptContext,
  registerLibrary,
  createScriptContext,
} from "../interpreter";
import * as Core from "./core";
import * as List from "./list";
import { createLibraryTester } from "./test-utils";

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
  getVerb: () => null,
}));

// Mock scheduler
mock.module("../../scheduler", () => ({
  scheduler: {
    schedule: () => {},
  },
}));

createLibraryTester(Core, "Core Library", (test) => {
  registerLibrary(Core);
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
    expect(await evaluate(Core["this"](), ctx)).toEqual({ id: 2 });
  });

  test("caller", async () => {
    expect(await evaluate(Core["caller"](), ctx)).toEqual({ id: 1 });
  });

  // Control Flow
  test("seq", async () => {
    expect(await evaluate(Core["seq"](1, 2, 3), ctx)).toBe(3);
  });

  test("if", async () => {
    expect(await evaluate(Core["if"](true, 1, 2), ctx)).toBe(1);
    expect(await evaluate(Core["if"](false, 1, 2), ctx)).toBe(2);
    expect(await evaluate(Core["if"](false, 1), ctx)).toBe(null);
  });

  test("while", async () => {
    const localCtx = { ...ctx, locals: {} };
    await evaluate(Core["let"]("i", 0), localCtx);
    await evaluate(
      Core["while"](
        Core["<"](Core["var"]("i"), 3),
        Core["set"]("i", Core["+"](Core["var"]("i"), 1)),
      ),
      localCtx,
    );
    expect(await evaluate(Core["var"]("i"), localCtx)).toBe(3);
  });

  test("for", async () => {
    const localCtx = { ...ctx, locals: {} };
    await evaluate(Core["let"]("sum", 0), localCtx);
    await evaluate(
      Core["for"](
        "x",
        List["list.new"](1, 2, 3),
        Core["set"]("sum", Core["+"](Core["var"]("sum"), Core["var"]("x"))),
      ),
      localCtx,
    );
    expect(await evaluate(Core["var"]("sum"), localCtx)).toBe(6);
  });

  // Data Structures
  test("json.stringify", async () => {
    expect(await evaluate(Core["json.stringify"]({ a: 1 }), ctx)).toBe(
      '{"a":1}',
    );
  });

  test("json.parse", async () => {
    expect(await evaluate(Core["json.parse"]('{"a":1}'), ctx)).toEqual({
      a: 1,
    });
    expect(await evaluate(Core["json.parse"]("invalid"), ctx)).toBe(null);
  });

  // Variables
  test("let", async () => {
    const localCtx = { ...ctx, locals: {} };
    expect(await evaluate(Core["let"]("x", 10), localCtx)).toBe(10);
    expect(localCtx.vars?.["x"]).toBe(10);
  });

  test("var", async () => {
    const localCtx = { ...ctx, locals: {}, vars: { x: 10 } };
    expect(await evaluate(Core["var"]("x"), localCtx)).toBe(10);
    expect(await evaluate(Core["var"]("y"), localCtx)).toBe(null);
  });

  test("set", async () => {
    const localCtx = { ...ctx, locals: {}, vars: { x: 10 } };
    expect(await evaluate(Core["set"]("x", 20), localCtx)).toBe(20);
    expect(localCtx.vars?.x).toBe(20);
  });

  // Comparison
  test("==", async () => {
    expect(await evaluate(Core["=="](1, 1), ctx)).toBe(true);
    expect(await evaluate(Core["=="](1, 2), ctx)).toBe(false);
    expect(await evaluate(Core["=="](1, 1, 1), ctx)).toBe(true);
  });

  test("!=", async () => {
    expect(await evaluate(Core["!="](1, 2), ctx)).toBe(true);
    expect(await evaluate(Core["!="](1, 1), ctx)).toBe(false);
  });

  test("<", async () => {
    expect(await evaluate(Core["<"](1, 2), ctx)).toBe(true);
    expect(await evaluate(Core["<"](2, 1), ctx)).toBe(false);
    expect(await evaluate(Core["<"](1, 2, 3), ctx)).toBe(true);
  });

  test(">", async () => {
    expect(await evaluate(Core[">"](2, 1), ctx)).toBe(true);
    expect(await evaluate(Core[">"](1, 2), ctx)).toBe(false);
  });

  test("<=", async () => {
    expect(await evaluate(Core["<="](1, 1), ctx)).toBe(true);
    expect(await evaluate(Core["<="](1, 2), ctx)).toBe(true);
    expect(await evaluate(Core["<="](2, 1), ctx)).toBe(false);
  });

  test(">=", async () => {
    expect(await evaluate(Core[">="](1, 1), ctx)).toBe(true);
    expect(await evaluate(Core[">="](2, 1), ctx)).toBe(true);
    expect(await evaluate(Core[">="](1, 2), ctx)).toBe(false);
  });

  // Arithmetic
  test("+", async () => {
    expect(await evaluate(Core["+"](1, 2), ctx)).toBe(3);
    expect(await evaluate(Core["+"](1, 2, 3), ctx)).toBe(6);
  });

  test("typeof", async () => {
    expect(await evaluate(Core["typeof"](1), ctx)).toBe("number");
    expect(await evaluate(Core["typeof"]("s"), ctx)).toBe("string");
    expect(await evaluate(Core["typeof"](true), ctx)).toBe("boolean");
    expect(await evaluate(Core["typeof"]({}), ctx)).toBe("object");
    expect(await evaluate(Core["typeof"](List["list.new"]()), ctx)).toBe(
      "array",
    );
    expect(await evaluate(Core["typeof"](null), ctx)).toBe("null");
  });

  test("-", async () => {
    expect(await evaluate(Core["-"](3, 1), ctx)).toBe(2);
    expect(await evaluate(Core["-"](10, 2, 3), ctx)).toBe(5);
  });

  test("*", async () => {
    expect(await evaluate(Core["*"](2, 3), ctx)).toBe(6);
    expect(await evaluate(Core["*"](2, 3, 4), ctx)).toBe(24);
  });

  test("/", async () => {
    expect(await evaluate(Core["/"](6, 2), ctx)).toBe(3);
    expect(await evaluate(Core["/"](12, 2, 3), ctx)).toBe(2);
  });

  test("%", async () => {
    expect(await evaluate(Core["%"](5, 2), ctx)).toBe(1);
  });

  test("^", async () => {
    expect(await evaluate(Core["^"](2, 3), ctx)).toBe(8);
    expect(await evaluate(Core["^"](2, 3, 2), ctx)).toBe(512); // 2^(3^2) = 2^9 = 512
  });

  // Logic
  test("and", async () => {
    expect(await evaluate(Core["and"](true, true), ctx)).toBe(true);
    expect(await evaluate(Core["and"](true, false), ctx)).toBe(false);
  });

  test("or", async () => {
    expect(await evaluate(Core["or"](false, true), ctx)).toBe(true);
    expect(await evaluate(Core["or"](false, false), ctx)).toBe(false);
  });

  test("not", async () => {
    expect(await evaluate(Core["not"](true), ctx)).toBe(false);
    expect(await evaluate(Core["not"](false), ctx)).toBe(true);
  });

  // System
  test("log", async () => {
    // Mock console.log? Or just ensure it runs without error
    await evaluate(Core["log"]("hello"), ctx);
  });

  test("arg", async () => {
    expect(await evaluate(Core["arg"](0), ctx)).toBe(10);
    expect(await evaluate(Core["arg"](1), ctx)).toBe(20);
    expect(await evaluate(Core["arg"](2), ctx)).toBe(null);
  });

  test("args", async () => {
    expect(await evaluate(Core["args"](), ctx)).toEqual([10, 20]);
  });

  test("random", async () => {
    const r1 = await evaluate(Core["random"](), ctx);
    expect(r1).toBeGreaterThanOrEqual(0);
    expect(r1).toBeLessThan(1);

    const r2 = await evaluate(Core["random"](10), ctx);
    expect(r2).toBeGreaterThanOrEqual(0);
    expect(r2).toBeLessThanOrEqual(10);

    const r3 = await evaluate(Core["random"](5, 10), ctx);
    expect(r3).toBeGreaterThanOrEqual(5);
    expect(r3).toBeLessThanOrEqual(10);
  });

  test("warn", async () => {
    await evaluate(Core["warn"]("warning"), ctx);
    expect(ctx.warnings).toContain("warning");
  });

  test("throw", async () => {
    expect(evaluate(Core["throw"]("error"), ctx)).rejects.toThrow("error");
  });

  test("try", async () => {
    expect(
      await evaluate(
        Core["try"](Core["throw"]("oops"), "err", Core["var"]("err")),
        ctx,
      ),
    ).toBe("oops");

    expect(await evaluate(Core["try"](123, "err", 456), ctx)).toBe(123);
  });

  // Entity Interaction
  test("create", async () => {
    expect(await evaluate(Core["create"]({}), ctx)).toBe(100);
  });

  test("destroy", async () => {
    await evaluate(Core["destroy"]({ id: 1 }), ctx);
  });

  test("lambda", async () => {
    const l = await evaluate(Core["lambda"](["x"], Core["var"]("x")), ctx);
    expect(l.type).toBe("lambda");
  });

  test("apply", async () => {
    const l = await evaluate(Core["lambda"](["x"], Core["var"]("x")), ctx);
    expect(await evaluate(Core["apply"](l, 123), ctx)).toBe(123);
  });

  test("call", async () => {
    // Mock getVerb to return something executable
    // This is hard to test with simple mocks, might need more setup
    // For now we test failure case or mock getVerb properly
    expect(evaluate(Core["call"]({ id: 1 }, "missing"), ctx)).rejects.toThrow();
  });

  test("schedule", async () => {
    await evaluate(Core["schedule"]("verb", List["list.new"](), 100), ctx);
  });

  test("send", async () => {
    // We mocked send in ctx, just check it doesn't crash
    await evaluate(Core["send"]("msg"), ctx);
  });

  // Entity Introspection
  test("verbs", async () => {
    expect(await evaluate(Core["verbs"]({ id: 1 }), ctx)).toEqual([]);
  });

  test("entity", async () => {
    expect(await evaluate(Core["entity"](1), ctx)).toEqual({
      id: 1,
      props: {},
    });
  });

  test("set_entity", async () => {
    await evaluate(Core["set_entity"]({ id: 1 }), ctx);
  });

  test("get_prototype", async () => {
    expect(await evaluate(Core["get_prototype"]({ id: 1 }), ctx)).toBe(null);
  });

  test("set_prototype", async () => {
    await evaluate(Core["set_prototype"]({ id: 1 }, 2), ctx);
  });

  test("resolve_props", async () => {
    expect(await evaluate(Core["resolve_props"]({ id: 101 }), ctx)).toEqual({
      id: 101,
      dynamic: "resolved_value",
    });
  });
});
