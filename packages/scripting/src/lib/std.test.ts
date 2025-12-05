import { expect } from "bun:test";
import { createLibraryTester } from "./test-utils";
import { createScriptContext, registerLibrary } from "../interpreter";
import { evaluate } from "../interpreter";
import * as StdLib from "./std";
import * as ListLib from "./list";
import * as BooleanLib from "./boolean";
import * as MathLib from "./math";

registerLibrary(StdLib);
registerLibrary(ListLib);
registerLibrary(MathLib);
registerLibrary(BooleanLib);

createLibraryTester(StdLib, "Standard Library", (test) => {
  const ctx = createScriptContext({ caller: { id: 1 }, this: { id: 2 }, args: [10, "a"] });

  // Values
  test("this", () => {
    expect(evaluate(StdLib.this(), ctx)).toEqual({ id: 2 });
  });

  test("caller", () => {
    expect(evaluate(StdLib.caller(), ctx)).toEqual({ id: 1 });
  });

  // Control Flow
  test("seq", () => {
    expect(evaluate(StdLib.seq(1, 2, 3), ctx)).toBe(3);
  });

  test("if", () => {
    expect(evaluate(StdLib.if(true, 1, 2), ctx)).toBe(1);
    expect(evaluate(StdLib.if(false, 1, 2), ctx)).toBe(2);
    expect(evaluate(StdLib.if(false, 1), ctx)).toBe(null);
  });

  test("while", () => {
    const localCtx = { ...ctx, locals: {} };
    evaluate(StdLib.let("i", 0), localCtx);
    evaluate(
      StdLib.while(
        BooleanLib.lt(StdLib.var("i"), 3),
        StdLib.set("i", MathLib.add(StdLib.var("i"), 1)),
      ),
      localCtx,
    );
    expect(evaluate(StdLib.var("i"), localCtx)).toBe(3);
  });

  test("for", () => {
    const localCtx = { ...ctx, locals: {} };
    evaluate(StdLib.let("sum", 0), localCtx);
    evaluate(
      StdLib.for(
        "x",
        ListLib.listNew(1, 2, 3),
        StdLib.set("sum", MathLib.add(StdLib.var("sum"), StdLib.var("x"))),
      ),
      localCtx,
    );
    expect(evaluate(StdLib.var("sum"), localCtx)).toBe(6);
  });

  test("break", () => {
    const localCtx = { ...ctx, locals: {} };
    evaluate(StdLib.let("i", 0), localCtx);
    evaluate(
      StdLib.while(
        BooleanLib.lt(StdLib.var("i"), 10),
        StdLib.seq(StdLib.set("i", MathLib.add(StdLib.var("i"), 1)), StdLib.break()),
      ),
      localCtx,
    );
    expect(evaluate(StdLib.var("i"), localCtx)).toBe(1);
  });

  test("return", () => {
    const localCtx = { ...ctx, locals: {} };
    expect(evaluate(StdLib.return("val"), localCtx) as any).toBe("val");
  });

  // Data Structures
  test("json.stringify", () => {
    expect(evaluate(StdLib.jsonStringify({ a: 1 }), ctx)).toBe('{"a":1}');
  });

  test("json.parse", () => {
    expect(evaluate(StdLib.jsonParse('{"a":1}'), ctx)).toEqual({
      a: 1,
    });
    expect(evaluate(StdLib.jsonParse("invalid"), ctx)).toBe(null);
  });

  // Variables
  test("let", () => {
    const localCtx = { ...ctx, locals: {} };
    expect(evaluate(StdLib.let("x", 10), localCtx)).toBe(10);
    expect(localCtx.vars?.["x"]).toBe(10);
  });

  test("var", () => {
    const localCtx = { ...ctx, locals: {}, vars: { x: 10 } };
    expect(evaluate(StdLib.var("x"), localCtx)).toBe(10);
    expect(evaluate(StdLib.var("y"), localCtx)).toBe(null);
  });

  test("set", () => {
    const localCtx = { ...ctx, locals: {}, vars: { x: 10 } };
    expect(evaluate(StdLib.set("x", 20), localCtx)).toBe(20);
    expect(localCtx.vars?.x).toBe(20);
  });

  // Arithmetic

  test("typeof", () => {
    expect(evaluate(StdLib.typeof(1), ctx)).toBe("number");
    expect(evaluate(StdLib.typeof("s"), ctx)).toBe("string");
    expect(evaluate(StdLib.typeof(true), ctx)).toBe("boolean");
    expect(evaluate(StdLib.typeof({}), ctx)).toBe("object");
    expect(evaluate(StdLib.typeof(ListLib.listNew()), ctx)).toBe("array");
    expect(evaluate(StdLib.typeof(null), ctx)).toBe("null");
  });

  // System
  test("log", () => {
    // Mock console.log? Or just ensure it runs without error
    evaluate(StdLib.log("hello"), ctx);
  });

  test("arg", () => {
    expect(evaluate(StdLib.arg(0), ctx)).toBe(10);
    expect(evaluate(StdLib.arg(1), ctx)).toBe("a");
    expect(evaluate(StdLib.arg(2), ctx)).toBe(null);
  });

  test("args", () => {
    expect(evaluate(StdLib.args(), ctx)).toEqual([10, "a"]);
  });

  test("warn", () => {
    evaluate(StdLib.warn("warning"), ctx);
    expect(ctx.warnings).toContain("warning");
  });

  test("throw", () => {
    expect(() => evaluate(StdLib.throw("error"), ctx)).toThrow("error");
  });

  test("try", () => {
    expect(evaluate(StdLib.try(StdLib.throw("oops"), "err", StdLib.var("err")), ctx)).toBe("oops");

    expect(evaluate(StdLib.try(123, "err", 456), ctx)).toBe(123);
  });

  test("lambda", () => {
    const l = evaluate(StdLib.lambda(["x"], StdLib.var("x")), ctx);
    expect(l.type).toBe("lambda");
  });

  test("apply", () => {
    const l = evaluate(StdLib.lambda(["x"], StdLib.var("x")), ctx);
    expect(evaluate(StdLib.apply(l, 123), ctx)).toBe(123);
  });

  test("send", () => {
    // We mocked send in ctx, just check it doesn't crash
    evaluate(StdLib.send("message", "hello"), ctx);
  });

  test("quote", () => {
    expect(evaluate(StdLib.quote([1, 2, 3]), ctx)).toEqual([1, 2, 3]);
    expect(evaluate(StdLib.quote("hello"), ctx)).toBe("hello");
  });
});
