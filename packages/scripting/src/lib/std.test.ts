import { expect, beforeEach, mock } from "bun:test";
import { createLibraryTester } from "./test-utils";
import { createScriptContext, registerLibrary, ScriptContext } from "../interpreter";
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

createLibraryTester(Std, "Standard Library", (test) => {
  registerLibrary(Std);
  registerLibrary(List);
  registerLibrary(Math);
  registerLibrary(Boolean);

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
  test("this", () => {
    expect(evaluate(Std.this(), ctx)).toEqual({ id: 2 });
  });

  test("caller", () => {
    expect(evaluate(Std.caller(), ctx)).toEqual({ id: 1 });
  });

  // Control Flow
  test("seq", () => {
    expect(evaluate(Std.seq(1, 2, 3), ctx)).toBe(3);
  });

  test("if", () => {
    expect(evaluate(Std.if(true, 1, 2), ctx)).toBe(1);
    expect(evaluate(Std.if(false, 1, 2), ctx)).toBe(2);
    expect(evaluate(Std.if(false, 1), ctx)).toBe(null);
  });

  test("while", () => {
    const localCtx = { ...ctx, locals: {} };
    evaluate(Std.let("i", 0), localCtx);
    evaluate(
      Std.while(Boolean.lt(Std.var("i"), 3), Std.set("i", Math.add(Std.var("i"), 1))),
      localCtx,
    );
    expect(evaluate(Std.var("i"), localCtx)).toBe(3);
  });

  test("for", () => {
    const localCtx = { ...ctx, locals: {} };
    evaluate(Std.let("sum", 0), localCtx);
    evaluate(
      Std.for("x", List.listNew(1, 2, 3), Std.set("sum", Math.add(Std.var("sum"), Std.var("x")))),
      localCtx,
    );
    expect(evaluate(Std.var("sum"), localCtx)).toBe(6);
  });

  // Data Structures
  test("json.stringify", () => {
    expect(evaluate(Std.jsonStringify({ a: 1 }), ctx)).toBe('{"a":1}');
  });

  test("json.parse", () => {
    expect(evaluate(Std.jsonParse('{"a":1}'), ctx)).toEqual({
      a: 1,
    });
    expect(evaluate(Std.jsonParse("invalid"), ctx)).toBe(null);
  });

  // Variables
  test("let", () => {
    const localCtx = { ...ctx, locals: {} };
    expect(evaluate(Std.let("x", 10), localCtx)).toBe(10);
    expect(localCtx.vars?.["x"]).toBe(10);
  });

  test("var", () => {
    const localCtx = { ...ctx, locals: {}, vars: { x: 10 } };
    expect(evaluate(Std.var("x"), localCtx)).toBe(10);
    expect(evaluate(Std.var("y"), localCtx)).toBe(null);
  });

  test("set", () => {
    const localCtx = { ...ctx, locals: {}, vars: { x: 10 } };
    expect(evaluate(Std.set("x", 20), localCtx)).toBe(20);
    expect(localCtx.vars?.x).toBe(20);
  });

  // Arithmetic

  test("typeof", () => {
    expect(evaluate(Std.typeof(1), ctx)).toBe("number");
    expect(evaluate(Std.typeof("s"), ctx)).toBe("string");
    expect(evaluate(Std.typeof(true), ctx)).toBe("boolean");
    expect(evaluate(Std.typeof({}), ctx)).toBe("object");
    expect(evaluate(Std.typeof(List.listNew()), ctx)).toBe("array");
    expect(evaluate(Std.typeof(null), ctx)).toBe("null");
  });

  // System
  test("log", () => {
    // Mock console.log? Or just ensure it runs without error
    evaluate(Std.log("hello"), ctx);
  });

  test("arg", () => {
    expect(evaluate(Std.arg(0), ctx)).toBe(10);
    expect(evaluate(Std.arg(1), ctx)).toBe(20);
    expect(evaluate(Std.arg(2), ctx)).toBe(null);
  });

  test("args", () => {
    expect(evaluate(Std.args(), ctx)).toEqual([10, 20]);
  });

  test("warn", () => {
    evaluate(Std.warn("warning"), ctx);
    expect(ctx.warnings).toContain("warning");
  });

  test("throw", () => {
    expect(() => evaluate(Std.throw("error"), ctx)).toThrow("error");
  });

  test("try", () => {
    expect(evaluate(Std.try(Std.throw("oops"), "err", Std.var("err")), ctx)).toBe("oops");

    expect(evaluate(Std.try(123, "err", 456), ctx)).toBe(123);
  });

  test("lambda", () => {
    const l = evaluate(Std.lambda(["x"], Std.var("x")), ctx);
    expect(l.type).toBe("lambda");
  });

  test("apply", () => {
    const l = evaluate(Std.lambda(["x"], Std.var("x")), ctx);
    expect(evaluate(Std.apply(l, 123), ctx)).toBe(123);
  });

  test("send", () => {
    // We mocked send in ctx, just check it doesn't crash
    evaluate(Std.send("message", "hello"), ctx);
  });

  test("quote", () => {
    expect(evaluate(Std.quote([1, 2, 3]), ctx)).toEqual([1, 2, 3]);
    expect(evaluate(Std.quote("hello"), ctx)).toBe("hello");
  });
});
