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

  async function run(script: any, context: ScriptContext = ctx) {
    const fn = compile(script);
    return await fn(context);
  }

  test("literals", async () => {
    expect(await run(1)).toBe(1);
    expect(await run("hello")).toBe("hello");
    expect(await run(true)).toBe(true);
  });

  test("math", async () => {
    expect(await run(MathLib["+"](1, 2))).toBe(3);
    expect(await run(MathLib["-"](5, 3))).toBe(2);
    expect(await run(MathLib["*"](2, 3))).toBe(6);
    expect(await run(MathLib["/"](6, 2))).toBe(3);
  });

  test("math extended", async () => {
    expect(await run(MathLib["%"](10, 3))).toBe(1);
    expect(await run(MathLib["^"](2, 3))).toBe(8);
  });

  test("logic", async () => {
    expect(await run(BooleanLib["and"](true, true))).toBe(true);
    expect(await run(BooleanLib["or"](true, false))).toBe(true);
    expect(await run(BooleanLib["not"](true))).toBe(false);
    expect(await run(BooleanLib["=="](1, 1))).toBe(true);
    expect(await run(BooleanLib[">"](2, 1))).toBe(true);
  });

  test("variables", async () => {
    const localCtx = { ...ctx, vars: {} };
    await run(Std["let"]("x", 10), localCtx);
    expect(await run(Std["var"]("x"), localCtx)).toBe(10);
  });

  test("control flow", async () => {
    expect(await run(Std["if"](true, 1, 2))).toBe(1);
    expect(await run(Std["if"](false, 1, 2))).toBe(2);

    expect(await run(Std["seq"](1, 2, 3))).toBe(3);
  });

  test("loops", async () => {
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
    expect(await run(script)).toBe(6);
  });

  test("errors", async () => {
    // Unknown opcode
    try {
      await run(["unknown_op"]);
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain("Unknown opcode: unknown_op");
    }
  });

  test("comparisons", async () => {
    expect(await run(BooleanLib["!="](1, 2))).toBe(true);
    expect(await run(BooleanLib["<"](1, 2))).toBe(true);
    expect(await run(BooleanLib[">="](2, 2))).toBe(true);
    expect(await run(BooleanLib["<="](2, 2))).toBe(true);
  });

  test("if else", async () => {
    expect(await run(Std["if"](false, "then", "else"))).toBe("else");
    expect(await run(Std["if"](false, "then"))).toBe(null); // No else branch
  });

  test("var retrieval", async () => {
    const localCtx = { ...ctx, vars: { x: 10 } };
    expect(await run(Std["var"]("x"), localCtx)).toBe(10);
    expect(await run(Std["var"]("missing"), localCtx)).toBe(null); // Variable not found
  });

  test("lambda & apply", async () => {
    // (lambda (x) (+ x 1))
    const inc = Std["lambda"](["x"], MathLib["+"](Std["var"]("x"), 1));
    expect(await run(Std["apply"](inc, 1))).toBe(2);
  });

  test("closure capture", async () => {
    // (let x 10); (let addX (lambda (y) (+ x y))); (apply addX 5) -> 15
    expect(
      await run(
        Std["seq"](
          Std["let"]("x", 10),
          Std["let"](
            "addX",
            Std["lambda"](
              ["y"],
              MathLib["+"](Std["var"]("x"), Std["var"]("y")),
            ),
          ),
          Std["apply"](Std["var"]("addX"), 5),
        ),
      ),
    ).toBe(15);
  });

  test("try/catch", async () => {
    // try { throw "error" } catch { return "caught" }
    const script = Std["try"](
      Std["throw"]("oops"),
      "this should be unused", // No error var
      "caught",
    );
    expect(await run(script)).toBe("caught");
  });

  test("try/catch with error variable", async () => {
    // try { throw "error" } catch(e) { return e }
    const localCtx = { ...ctx, vars: {} };
    const script = Std["try"](Std["throw"]("oops"), "err", Std["var"]("err"));
    expect(await run(script, localCtx)).toBe("oops");
  });

  test("object operations", async () => {
    const script = Std["seq"](
      Std["let"]("o", ObjectLib["obj.new"](["a", 1], ["b", 2])),
      ObjectLib["obj.set"](Std["var"]("o"), "c", 3),
      Std["let"]("res", ObjectLib["obj.get"](Std["var"]("o"), "c")),
      Std["let"]("hasB", ObjectLib["obj.has"](Std["var"]("o"), "b")),
      ObjectLib["obj.del"](Std["var"]("o"), "b"),
      Std["let"]("hasBAfter", ObjectLib["obj.has"](Std["var"]("o"), "b")),
      List["list.new"](
        Std["var"]("res"),
        Std["var"]("hasB"),
        Std["var"]("hasBAfter"),
      ),
    );

    const res = await run(script);
    expect(res[0]).toBe(3);
    expect(res[1]).toBe(true);
    expect(res[2]).toBe(false);
  });
});
