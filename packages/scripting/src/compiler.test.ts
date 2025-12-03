import { describe, test, expect, beforeAll } from "bun:test";
import { ScriptContext, registerLibrary } from "./interpreter";
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

  const ctx = {
    caller,
    this: target,
    args: [],
    gas: 1000,
    warnings: [],
    vars: {},
    stack: [],
  } satisfies ScriptContext;

  function run(script: any, context: ScriptContext = ctx) {
    return compile(script)(context);
  }

  test("literals", () => {
    expect(run(1)).toBe(1);
    expect(run("hello")).toBe("hello");
    expect(run(true)).toBe(true);
  });

  test("math", () => {
    expect(run(MathLib["+"](1, 2))).toBe(3);
    expect(run(MathLib["-"](5, 3))).toBe(2);
    expect(run(MathLib["*"](2, 3))).toBe(6);
    expect(run(MathLib["/"](6, 2))).toBe(3);
  });

  test("math extended", () => {
    expect(run(MathLib["%"](10, 3))).toBe(1);
    expect(run(MathLib["^"](2, 3))).toBe(8);
  });

  test("logic", () => {
    expect(run(BooleanLib["and"](true, true))).toBe(true);
    expect(run(BooleanLib["or"](true, false))).toBe(true);
    expect(run(BooleanLib["not"](true))).toBe(false);
    expect(run(BooleanLib["=="](1, 1))).toBe(true);
    expect(run(BooleanLib[">"](2, 1))).toBe(true);
  });

  test("variables", () => {
    const localCtx = { ...ctx, vars: {} };
    run(Std["let"]("x", 10), localCtx);
    expect(run(Std["var"]("x"), localCtx)).toBe(10);
  });

  test("control flow", () => {
    expect(run(Std["if"](true, 1, 2))).toBe(1);
    expect(run(Std["if"](false, 1, 2))).toBe(2);

    expect(run(Std["seq"](1, 2, 3))).toBe(3);
  });

  test("loops", () => {
    // sum = 0; for x in [1, 2, 3]: sum += x
    const script = Std["seq"](
      Std["let"]("sum", 0),
      Std["for"](
        "x",
        List["list.new"](1, 2, 3),
        Std["let"]("sum", MathLib["+"](Std["var"]("sum"), Std["var"]("x"))),
      ),
      Std["var"]("sum"),
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
    expect(run(BooleanLib["!="](1, 2))).toBe(true);
    expect(run(BooleanLib["<"](1, 2))).toBe(true);
    expect(run(BooleanLib[">="](2, 2))).toBe(true);
    expect(run(BooleanLib["<="](2, 2))).toBe(true);
  });

  test("if else", () => {
    expect(run(Std["if"](false, "then", "else"))).toBe("else");
    expect(run(Std["if"](false, "then"))).toBe(null); // No else branch
  });

  test("var retrieval", () => {
    const localCtx = { ...ctx, vars: { x: 10 } };
    expect(run(Std["var"]("x"), localCtx)).toBe(10);
    expect(run(Std["var"]("missing"), localCtx)).toBe(null); // Variable not found
  });

  test("lambda & apply", () => {
    // (lambda (x) (+ x 1))
    const inc = Std["lambda"](["x"], MathLib["+"](Std["var"]("x"), 1));
    expect(run(Std["apply"](inc, 1))).toBe(2);
  });

  test("closure capture", () => {
    // (let x 10); (let addX (lambda (y) (+ x y))); (apply addX 5) -> 15
    expect(
      run(
        Std["seq"](
          Std["let"]("x", 10),
          Std["let"]("addX", Std["lambda"](["y"], MathLib["+"](Std["var"]("x"), Std["var"]("y")))),
          Std["apply"](Std["var"]("addX"), 5),
        ),
      ),
    ).toBe(15);
  });

  test("try/catch", () => {
    // try { throw "error" } catch { return "caught" }
    const script = Std["try"](
      Std["throw"]("oops"),
      "this should be unused", // No error var
      "caught",
    );
    expect(run(script)).toBe("caught");
  });

  test("try/catch with error variable", () => {
    // try { throw "error" } catch(e) { return e }
    const localCtx = { ...ctx, vars: {} };
    const script = Std["try"](Std["throw"]("oops"), "err", Std["var"]("err"));
    expect(run(script, localCtx)).toBe("oops");
  });

  test("object operations", () => {
    const script = Std["seq"](
      Std["let"]("o", ObjectLib["obj.new"](["a", 1], ["b", 2])),
      ObjectLib["obj.set"](Std["var"]("o"), "c", 3),
      Std["let"]("res", ObjectLib["obj.get"](Std["var"]("o"), "c")),
      Std["let"]("hasB", ObjectLib["obj.has"](Std["var"]("o"), "b")),
      ObjectLib["obj.del"](Std["var"]("o"), "b"),
      Std["let"]("hasBAfter", ObjectLib["obj.has"](Std["var"]("o"), "b")),
      List["list.new"](Std["var"]("res"), Std["var"]("hasB"), Std["var"]("hasBAfter")),
    );

    const res = run(script);
    expect(res[0]).toBe(3);
    expect(res[1]).toBe(true);
    expect(res[2]).toBe(false);
  });
});
