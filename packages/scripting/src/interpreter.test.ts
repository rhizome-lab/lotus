import { describe, test, expect } from "bun:test";
import { evaluate, registerLibrary, ScriptError, createScriptContext } from "./interpreter";
import * as StdLib from "./lib/std";
import * as ObjectLib from "./lib/object";
import * as ListLib from "./lib/list";
import * as StringLib from "./lib/string";
import * as MathLib from "./lib/math";
import * as BooleanLib from "./lib/boolean";
import { Entity } from "@viwo/shared/jsonrpc";

registerLibrary(StdLib);
registerLibrary(ObjectLib);
registerLibrary(ListLib);
registerLibrary(StringLib);
registerLibrary(MathLib);
registerLibrary(BooleanLib);

describe("Interpreter", () => {
  const caller: Entity = { id: 1 };
  const target: Entity = { id: 2 };
  target["owner"] = 1;

  const ctx = createScriptContext({ caller, this: target });

  test("literals", () => {
    expect(evaluate(1, ctx)).toBe(1);
    expect(evaluate("hello", ctx)).toBe("hello");
    expect(evaluate(true, ctx)).toBe(true);
  });

  test("math", () => {
    expect(evaluate(MathLib.add(1, 2), ctx)).toBe(3);
    expect(evaluate(MathLib.sub(5, 3), ctx)).toBe(2);
    expect(evaluate(MathLib.mul(2, 3), ctx)).toBe(6);
    expect(evaluate(MathLib.div(6, 2), ctx)).toBe(3);
  });

  test("math extended", () => {
    expect(evaluate(MathLib.mod(10, 3), ctx)).toBe(1);
    expect(evaluate(MathLib.pow(2, 3), ctx)).toBe(8);
  });

  test("logic", () => {
    expect(evaluate(BooleanLib.and(true, true), ctx)).toBe(true);
    expect(evaluate(BooleanLib.or(true, false), ctx)).toBe(true);
    expect(evaluate(BooleanLib.not(true), ctx)).toBe(false);
    expect(evaluate(BooleanLib.eq(1, 1), ctx)).toBe(true);
    expect(evaluate(BooleanLib.gt(2, 1), ctx)).toBe(true);
  });

  test("variables", () => {
    const localCtx = { ...ctx, vars: {} };
    evaluate(StdLib.let("x", 10), localCtx);
    expect(evaluate(StdLib.var("x"), localCtx)).toBe(10);
  });

  test("control flow", () => {
    expect(evaluate(StdLib.if(true, 1, 2), ctx)).toBe(1);
    expect(evaluate(StdLib.if(false, 1, 2), ctx)).toBe(2);

    expect(evaluate(StdLib.seq(1, 2, 3), ctx)).toBe(3);
  });

  test("gas limit", () => {
    const lowGasCtx = { ...ctx, gas: 2 };
    // seq (1) + let (1) + let (1) = 3 ops -> should fail
    const script = StdLib.seq(StdLib.let("a", 1), StdLib.let("b", 2));

    // We expect it to throw
    let error;
    try {
      evaluate(script, lowGasCtx);
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect((error as Error).message).toContain("Script ran out of gas!");
  });

  test("loops", () => {
    // sum = 0; for x in [1, 2, 3]: sum += x
    const script = StdLib.seq(
      StdLib.let("sum", 0),
      StdLib.for(
        "x",
        ListLib.listNew(1, 2, 3),
        StdLib.set("sum", MathLib.add(StdLib.var("sum"), StdLib.var("x"))),
      ),
      StdLib.var("sum"),
    );
    expect(evaluate(script, ctx)).toBe(6);
  });

  test("break in while loop", () => {
    // i = 0; while (true) { i++; if (i > 3) break; } return i;
    const script = StdLib.seq(
      StdLib.let("i", 0),
      StdLib.while(
        true,
        StdLib.seq(
          StdLib.set("i", MathLib.add(StdLib.var("i"), 1)),
          StdLib.if(BooleanLib.gt(StdLib.var("i"), 3), StdLib.break()),
        ),
      ),
      StdLib.var("i"),
    );
    expect(evaluate(script, ctx)).toBe(4);
  });

  test("break in for loop", () => {
    // sum = 0; for x in [1, 2, 3, 4, 5] { if (x > 3) break; sum += x; } return sum;
    const script = StdLib.seq(
      StdLib.let("sum", 0),
      StdLib.for(
        "x",
        ListLib.listNew(1, 2, 3, 4, 5),
        StdLib.seq(
          StdLib.if(BooleanLib.gt(StdLib.var("x"), 3), StdLib.break()),
          StdLib.set("sum", MathLib.add(StdLib.var("sum"), StdLib.var("x"))),
        ),
      ),
      StdLib.var("sum"),
    );
    expect(evaluate(script, ctx)).toBe(6); // 1 + 2 + 3
  });

  test("nested loops break", () => {
    // sum = 0;
    // for i in [1, 2, 3] {
    //   for j in [1, 2, 3] {
    //     if (j > 1) break;
    //     sum += i * j;
    //   }
    // }
    // return sum;
    // i=1, j=1 -> sum += 1
    // i=1, j=2 -> break
    // i=2, j=1 -> sum += 2
    // i=2, j=2 -> break
    // i=3, j=1 -> sum += 3
    // i=3, j=2 -> break
    // Total sum = 6
    const script = StdLib.seq(
      StdLib.let("sum", 0),
      StdLib.for(
        "i",
        ListLib.listNew(1, 2, 3),
        StdLib.for(
          "j",
          ListLib.listNew(1, 2, 3),
          StdLib.seq(
            StdLib.if(BooleanLib.gt(StdLib.var("j"), 1), StdLib.break()),
            StdLib.set(
              "sum",
              MathLib.add(StdLib.var("sum"), MathLib.mul(StdLib.var("i"), StdLib.var("j"))),
            ),
          ),
        ),
      ),
      StdLib.var("sum"),
    );
    expect(evaluate(script, ctx)).toBe(6);
  });

  test("errors", () => {
    // Unknown opcode
    try {
      // @ts-expect-error
      evaluate(["unknown_op"], ctx);
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain("Unknown opcode: unknown_op");
    }
  });

  test("comparisons", () => {
    expect(evaluate(BooleanLib.neq(1, 2), ctx)).toBe(true);
    expect(evaluate(BooleanLib.lt(1, 2), ctx)).toBe(true);
    expect(evaluate(BooleanLib.gte(2, 2), ctx)).toBe(true);
    expect(evaluate(BooleanLib.lte(2, 2), ctx)).toBe(true);
  });

  test("if else", () => {
    expect(evaluate(StdLib.if(false, "then", "else"), ctx)).toBe("else");
    expect(evaluate(StdLib.if(false, "then"), ctx)).toBe(null); // No else branch
  });

  test("var retrieval", () => {
    const localCtx = { ...ctx, vars: { x: 10 } };
    expect(evaluate(StdLib.var("x"), localCtx)).toBe(10);
    expect(evaluate(StdLib.var("missing"), localCtx)).toBe(null); // Variable not found
  });
});

describe("Interpreter Errors and Warnings", () => {
  const ctx = createScriptContext({ caller: { id: 1 }, this: { id: 2 } });

  test("throw", () => {
    try {
      evaluate(StdLib.throw("Something went wrong"), ctx);
      expect(true).toBe(false); // Should not reach here
    } catch (e: any) {
      expect(e.message).toBe("Something went wrong");
    }
  });

  test("try/catch", () => {
    // try { throw "error" } catch { return "caught" }
    const script = StdLib.try(
      StdLib.throw("oops"),
      "this should be unused", // No error var
      "caught",
    );
    expect(evaluate(script, ctx)).toBe("caught");
  });

  test("try/catch with error variable", () => {
    // try { throw "error" } catch(e) { return e }
    const localCtx = { ...ctx, vars: {} };
    const script = StdLib.try(StdLib.throw("oops"), "err", StdLib.var("err"));
    expect(evaluate(script, localCtx)).toBe("oops");
  });

  test("try/catch no error", () => {
    // try { return "ok" } catch { return "bad" }
    const script = StdLib.try("ok", "this should be unused", "bad");
    expect(evaluate(script, ctx)).toBe("ok");
  });

  test("warn", () => {
    const warnings: string[] = [];
    const localCtx = { ...ctx, warnings };
    evaluate(StdLib.warn("Be careful"), localCtx);
    expect(localCtx.warnings).toContain("Be careful");
  });

  test("nested try/catch", () => {
    const script = StdLib.try(
      StdLib.try(
        StdLib.throw("inner"),
        "this should be unused", // No error var
        StdLib.throw("outer"),
      ),
      "e",
      StdLib.var("e"),
    );
    expect(evaluate(script, { ...ctx, vars: {} })).toBe("outer");
  });
});

describe("Interpreter Libraries", () => {
  const ctx = createScriptContext({ caller: { id: 1 }, this: { id: 2 } });

  describe("Lambda & HOF", () => {
    test("lambda & apply", () => {
      // (lambda (x) (+ x 1))
      const inc = StdLib.lambda(["x"], MathLib.add(StdLib.var("x"), 1));
      expect(evaluate(StdLib.apply(inc, 1), ctx)).toBe(2);
    });

    test("closure capture", () => {
      // (let x 10); (let addX (lambda (y) (+ x y))); (apply addX 5) -> 15
      expect(
        evaluate(
          StdLib.seq(
            StdLib.let("x", 10),
            StdLib.let("addX", StdLib.lambda(["y"], MathLib.add(StdLib.var("x"), StdLib.var("y")))),
            StdLib.apply(StdLib.var("addX"), 5),
          ),
          ctx,
        ),
      ).toBe(15);
    });
  });
});

describe("Interpreter Stack Traces", () => {
  const ctx = createScriptContext({ caller: { id: 1 }, this: { id: 2 } });

  test("stack trace in lambda", () => {
    // (let fail (lambda () (throw "boom")))
    // (apply fail)
    const script = StdLib.seq(
      StdLib.let("fail", StdLib.lambda([], StdLib.throw("boom"))),
      StdLib.apply(StdLib.var("fail")),
    );

    try {
      evaluate(script, ctx);
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e).toBeInstanceOf(ScriptError);
      expect(e.message).toBe("boom");
      expect(e.stackTrace).toHaveLength(1);
      expect(e.stackTrace[0].name).toBe("<lambda>");
    }
  });

  test("nested stack trace", () => {
    // (let inner (lambda () (throw "boom")))
    // (let outer (lambda () (apply inner)))
    // (apply outer)
    const script = StdLib.seq(
      StdLib.let("inner", StdLib.lambda([], StdLib.throw("boom"))),
      StdLib.let("outer", StdLib.lambda([], StdLib.apply(StdLib.var("inner")))),
      StdLib.apply(StdLib.var("outer")),
    );

    try {
      evaluate(script, ctx);
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e).toBeInstanceOf(ScriptError);
      expect(e.message).toBe("boom");
      expect(e.stackTrace).toHaveLength(2);
      expect(e.stackTrace[0].name).toBe("<lambda>"); // outer
      expect(e.stackTrace[1].name).toBe("<lambda>"); // inner
    }
  });

  test("opcode error context", () => {
    // (+ 1 "string") -> should fail
    const script = MathLib.add(1, "string" as any);

    try {
      evaluate(script, ctx);
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e).toBeInstanceOf(ScriptError);
      // The error comes from the opcode itself, but since it's a primitive call
      // without call/apply, it might not have a stack frame unless we wrapped it.
      // In my implementation, I only push stack frames in call/apply.
      // However, evaluate() catches errors and appends the current stack.
      // Since the stack is empty, it should be empty.
      expect(e.stackTrace).toHaveLength(0);
      expect(e.context).toBeDefined();
      expect(e.context.op).toBe("+");
      expect(e.context.args).toEqual([1, "string"]);
    }
  });
});
