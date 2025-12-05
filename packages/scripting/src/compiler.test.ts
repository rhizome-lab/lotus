import { describe, test, expect, beforeAll } from "bun:test";
import { ScriptContext, createScriptContext, registerLibrary } from "./interpreter";
import { compile } from "./compiler";
import * as Std from "./lib/std";
import * as ObjectLib from "./lib/object";
import * as List from "./lib/list";
import * as StringLib from "./lib/string";
import * as MathLib from "./lib/math";
import * as BooleanLib from "./lib/boolean";
import { Entity } from "@viwo/shared/jsonrpc";

describe("Compiler", () => {
  beforeAll(() => {
    registerLibrary(Std);
    registerLibrary(ObjectLib);
    registerLibrary(List);
    registerLibrary(StringLib);
    registerLibrary(MathLib);
    registerLibrary(BooleanLib);
  });

  const caller: Entity = { id: 1 };
  const target: Entity = { id: 2 };
  target["owner"] = 1;

  const ctx = createScriptContext({ caller, this: target });

  function run(script: any, context: ScriptContext = ctx) {
    return compile(script)(context);
  }

  test("literals", () => {
    expect(run(1)).toBe(1);
    expect(run("hello")).toBe("hello");
    expect(run(true)).toBe(true);
  });

  test("math", () => {
    expect(run(MathLib.add(1, 2))).toBe(3);
    expect(run(MathLib.sub(5, 3))).toBe(2);
    expect(run(MathLib.mul(2, 3))).toBe(6);
    expect(run(MathLib.div(6, 2))).toBe(3);
  });

  test("math extended", () => {
    expect(run(MathLib.mod(10, 3))).toBe(1);
    expect(run(MathLib.pow(2, 3))).toBe(8);
  });

  test("logic", () => {
    expect(run(BooleanLib.and(true, true))).toBe(true);
    expect(run(BooleanLib.or(true, false))).toBe(true);
    expect(run(BooleanLib.not(true))).toBe(false);
    expect(run(BooleanLib.eq(1, 1))).toBe(true);
    expect(run(BooleanLib.gt(2, 1))).toBe(true);
  });

  test("control flow", () => {
    expect(run(Std.if(true, 1, 2))).toBe(1);
    expect(run(Std.if(false, 1, 2))).toBe(2);

    expect(run(Std.seq(1, 2, 3))).toBe(3);
  });

  test("loops", () => {
    // sum = 0; for x in [1, 2, 3]: sum += x
    const script = Std.seq(
      Std.let("sum", 0),
      Std.for(
        "x",
        List.listNew(1, 2, 3),
        Std.set("sum", MathLib.add(Std.var("sum"), Std.var("x"))),
      ),
      Std.var("sum"),
    );
    expect(run(script)).toBe(6);
  });

  test("errors", () => {
    // Unknown opcode
    try {
      run(["unknown_op"]);
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain("Unknown opcode: unknown_op");
    }
  });

  test("comparisons", () => {
    expect(run(BooleanLib.neq(1, 2))).toBe(true);
    expect(run(BooleanLib.lt(1, 2))).toBe(true);
    expect(run(BooleanLib.gte(2, 2))).toBe(true);
    expect(run(BooleanLib.lte(2, 2))).toBe(true);
  });

  test("if else", () => {
    expect(run(Std.if(false, "then", "else"))).toBe("else");
    expect(run(Std.if(false, "then"))).toBe(null); // No else branch
  });

  test("var retrieval", () => {
    const localCtx = { ...ctx, vars: { x: 10 } };
    expect(run(Std.var("x"), localCtx)).toBe(10);
    expect(run(Std.var("missing"), localCtx)).toBe(null); // Variable not found
  });

  test("lambda & apply", () => {
    // (lambda (x) (+ x 1))
    const inc = Std.lambda(["x"], MathLib.add(Std.var("x"), 1));
    expect(run(Std.apply(inc, 1))).toBe(2);
  });

  test("closure capture", () => {
    // (let x 10); (let addX (lambda (y) (+ x y))); (apply addX 5) -> 15
    expect(
      run(
        Std.seq(
          Std.let("x", 10),
          Std.let("addX", Std.lambda(["y"], MathLib.add(Std.var("x"), Std.var("y")))),
          Std.apply(Std.var("addX"), 5),
        ),
      ),
    ).toBe(15);
  });

  test("closure reference capture", () => {
    // (let x 1); (let f (lambda [] x)); (set x 2); (apply f) -> 2
    expect(
      run(
        Std.seq(
          Std.let("x", 1),
          Std.let("f", Std.lambda([], Std.var("x"))),
          Std.set("x", 2),
          Std.apply(Std.var("f")),
        ),
      ),
    ).toBe(2);
  });

  test("try/catch", () => {
    // try { throw "error" } catch { return "caught" }
    const script = Std.try(
      Std.throw("oops"),
      "this should be unused", // No error var
      "caught",
    );
    expect(run(script)).toBe("caught");
  });

  test("try/catch with error variable", () => {
    // try { throw "error" } catch(e) { return e }
    const localCtx = { ...ctx, vars: {} };
    const script = Std.try(Std.throw("oops"), "err", Std.var("err"));
    expect(run(script, localCtx)).toBe("oops");
  });

  test("object operations", () => {
    const script = Std.seq(
      Std.let("o", ObjectLib.objNew(["a", 1], ["b", 2])),
      ObjectLib.objSet(Std.var("o"), "c", 3),
      Std.let("res", ObjectLib.objGet(Std.var("o"), "c")),
      Std.let("hasB", ObjectLib.objHas(Std.var("o"), "b")),
      ObjectLib.objDel(Std.var("o"), "b"),
      Std.let("hasBAfter", ObjectLib.objHas(Std.var("o"), "b")),
      List.listNew(Std.var("res"), Std.var("hasB"), Std.var("hasBAfter")),
    );

    const res = run(script);
    expect(res[0]).toBe(3);
    expect(res[1]).toBe(true);
    expect(res[2]).toBe(false);
  });

  test("break in loop", () => {
    // sum = 0; for x in [1, 2, 3, 4, 5]: if (x > 3) break; sum += x
    const script = Std.seq(
      Std.let("sum", 0),
      Std.for(
        "x",
        List.listNew(1, 2, 3, 4, 5),
        Std.seq(
          Std.if(BooleanLib.gt(Std.var("x"), 3), Std.break()),
          Std.set("sum", MathLib.add(Std.var("sum"), Std.var("x"))),
        ),
      ),
      Std.var("sum"),
    );
    expect(run(script)).toBe(6);
  });

  test("return from lambda", () => {
    // (let f (lambda [] (return "early") "late")) (apply f) -> "early"
    const script = Std.seq(
      Std.let("f", Std.lambda([], Std.seq(Std.return("early"), "late"))),
      Std.apply(Std.var("f")),
    );
    expect(run(script)).toBe("early");
  });

  test("nested loops break", () => {
    // outer loop breaks inner loop? No, break only breaks innermost loop.
    // We don't have labeled break yet.
    // for i in [1, 2]: for j in [1, 2]: if j==2 break; sum += j
    // i=1: j=1 (sum+=1), j=2 (break)
    // i=2: j=1 (sum+=1), j=2 (break)
    // sum = 2
    const script = Std.seq(
      Std.let("sum", 0),
      Std.for(
        "i",
        List.listNew(1, 2),
        Std.for(
          "j",
          List.listNew(1, 2),
          Std.seq(
            Std.if(BooleanLib.eq(Std.var("j"), 2), Std.break()),
            Std.set("sum", MathLib.add(Std.var("sum"), Std.var("j"))),
          ),
        ),
      ),
      Std.var("sum"),
    );
    expect(run(script)).toBe(2);
  });
});
