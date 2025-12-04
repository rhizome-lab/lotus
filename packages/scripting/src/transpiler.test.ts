import { describe, expect, test } from "bun:test";
import { transpile } from "./transpiler";
import { decompile } from "./decompiler";
import * as Std from "./lib/std";
import * as MathLib from "./lib/math";
import * as List from "./lib/list";
import * as ObjectLib from "./lib/object";
import * as BooleanLib from "./lib/boolean";

describe("transpiler", () => {
  test("literals", () => {
    expect(transpile("1")).toBe(1);
    expect(transpile("'hello'")).toBe("hello");
    expect(transpile("true")).toBe(true);
    expect(transpile("false")).toBe(false);
    expect(transpile("null")).toBe(null);
  });

  test("variables", () => {
    expect(transpile("x")).toEqual(Std.var("x"));
    expect(transpile("let x = 1")).toEqual(Std.let("x", 1));
    expect(transpile("x = 2")).toEqual(Std.set("x", 2));
  });

  test("binary ops", () => {
    expect(transpile("1 + 2")).toEqual(MathLib.add(1, 2));
    expect(transpile("1 - 2")).toEqual(MathLib.sub(1, 2));
    expect(transpile("1 * 2")).toEqual(MathLib.mul(1, 2));
    expect(transpile("1 / 2")).toEqual(MathLib.div(1, 2));
    expect(transpile("1 % 2")).toEqual(MathLib.mod(1, 2));
    expect(transpile("1 == 2")).toEqual(BooleanLib.eq(1, 2));
    expect(transpile("1 != 2")).toEqual(BooleanLib.neq(1, 2));
    expect(transpile("1 < 2")).toEqual(BooleanLib.lt(1, 2));
    expect(transpile("1 > 2")).toEqual(BooleanLib.gt(1, 2));
    expect(transpile("1 <= 2")).toEqual(BooleanLib.lte(1, 2));
    expect(transpile("1 >= 2")).toEqual(BooleanLib.gte(1, 2));
    expect(transpile("true && false")).toEqual(BooleanLib.and(true, false));
    expect(transpile("true || false")).toEqual(BooleanLib.or(true, false));
    expect(transpile("'a' in obj")).toEqual(ObjectLib.objHas(Std.var("obj"), "a"));
    expect(transpile("2 ** 3")).toEqual(MathLib.pow(2, 3));
  });

  test("nested binary ops", () => {
    expect(transpile("1 + 2 * 3")).toEqual(MathLib.add(1, MathLib.mul(2, 3)));
    expect(transpile("(1 + 2) * 3")).toEqual(MathLib.mul(MathLib.add(1, 2), 3));
    expect(transpile("1 * 2 + 3")).toEqual(MathLib.add(MathLib.mul(1, 2), 3));
    expect(transpile("1 + 2 + 3")).toEqual(MathLib.add(MathLib.add(1, 2), 3));
  });

  test("unary ops", () => {
    expect(transpile("!true")).toEqual(BooleanLib.not(true));
  });

  test("arrays", () => {
    expect(transpile("[1, 2]")).toEqual(List.listNew(1, 2));
  });

  test("objects", () => {
    expect(transpile("({ a: 1, b: 2 })")).toEqual(ObjectLib.objNew(["a", 1], ["b", 2]));
    expect(transpile("({ 'a': 1 })")).toEqual(ObjectLib.objNew(["a", 1]));
    expect(transpile("delete obj.x")).toEqual(ObjectLib.objDel(Std.var("obj"), "x"));
    expect(transpile("delete obj['x']")).toEqual(ObjectLib.objDel(Std.var("obj"), "x"));
  });

  test("property access", () => {
    expect(transpile("obj.x")).toEqual(ObjectLib.objGet(Std.var("obj"), "x"));
    expect(transpile("obj['x']")).toEqual(ObjectLib.objGet(Std.var("obj"), "x"));
  });

  test("property assignment", () => {
    expect(transpile("obj.x = 1")).toEqual(ObjectLib.objSet(Std.var("obj"), "x", 1));
  });

  test("function calls", () => {
    expect(transpile("f(x)")).toEqual(["f", Std.var("x")]);
    expect(transpile("log('msg')")).toEqual(Std.log("msg"));
    expect(transpile("throw('err')")).toEqual(Std.throw("err"));
    expect(transpile("obj.get(o, 'k')")).toEqual(ObjectLib.objGet(Std.var("o"), "k"));
    expect(transpile("list.push(l, 1)")).toEqual(List.listPush(Std.var("l"), 1));
    // Sanitization test (mocking if_ usage if possible, or just checking logic)
    // Since we can't easily import type_generator output here, we assume user writes if_
    // But 'if' is a keyword, so we can't write `if(...)` as a call in TS source unless it's valid TS.
    // `if_` is valid TS identifier.
    // We need to ensure OPS has 'if'. It does.
    // expect(transpile("if_(c, t, e)")).toEqual(Std.if(Std.var("c"), Std.var("t"), Std.var("e")));
    // Actually Std.if returns ["if", ...].
  });

  test("shadowing opcodes", () => {
    const code = `
      let log = (msg) => { return msg; };
      log("hello");
    `;
    const expected = Std.seq(
      Std.let("log", Std.lambda(["msg"], Std.seq(Std.var("msg")))),
      Std.apply(Std.var("log"), "hello"),
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("declare statements", () => {
    const code = `
      declare var log;
      log("hello");
    `;
    // Should be treated as opcode call because log is not in scope (declare ignored)
    expect(transpile(code)).toEqual(Std.log("hello"));
  });

  test("declare namespace", () => {
    const code = `
      declare namespace MyLib {
        function foo(x);
      }
      MyLib.foo(1);
    `;
    // Should be treated as opcode call ["MyLib.foo", 1]
    expect(transpile(code)).toEqual(["MyLib.foo", 1]);
  });

  test("function declarations", () => {
    const code = `
      function inc(x) { return x + 1; }
      inc(1);
    `;
    const expected = Std.seq(
      Std.let("inc", Std.lambda(["x"], Std.seq(MathLib.add(Std.var("x"), 1)))),
      Std.apply(Std.var("inc"), 1),
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("lambdas", () => {
    expect(transpile("(x) => x + 1")).toEqual(Std.lambda(["x"], MathLib.add(Std.var("x"), 1)));
    expect(transpile("(x) => { return x + 1; }")).toEqual(
      Std.lambda(["x"], Std.seq(MathLib.add(Std.var("x"), 1))),
    );
  });

  test("control flow", () => {
    expect(transpile("if (true) 1 else 2")).toEqual(Std.if(true, 1, 2));
    expect(transpile("if (true) { 1; }")).toEqual(Std.if(true, Std.seq(1)));
    expect(transpile("while (true) { 1; }")).toEqual(Std.while(true, Std.seq(1)));
    expect(transpile("for (const x of list) { x; }")).toEqual(
      Std.for("x", Std.var("list"), Std.seq(Std.var("x"))),
    );
    expect(transpile("for (let i = 0; i < 10; i++) { i; }")).toEqual(
      Std.seq(
        Std.let("i", 0),
        Std.while(
          BooleanLib.lt(Std.var("i"), 10),
          Std.seq(Std.seq(Std.var("i")), Std.set("i", MathLib.add(Std.var("i"), 1))),
        ),
      ),
    );
    expect(transpile("for (let i = 10; i > 0; i--) { i; }")).toEqual(
      Std.seq(
        Std.let("i", 10),
        Std.while(
          BooleanLib.gt(Std.var("i"), 0),
          Std.seq(Std.seq(Std.var("i")), Std.set("i", MathLib.sub(Std.var("i"), 1))),
        ),
      ),
    );
    expect(transpile("try { 1; } catch (e) { 2; }")).toEqual(Std.try(Std.seq(1), "e", Std.seq(2)));
    expect(transpile("while (true) { break; }")).toEqual(Std.while(true, Std.seq(Std.break())));
    expect(transpile("for (const x of list) { if (x) break; }")).toEqual(
      Std.for("x", Std.var("list"), Std.seq(Std.if(Std.var("x"), Std.break()))),
    );
  });

  test("sequence", () => {
    expect(transpile("1; 2;")).toEqual(Std.seq(1, 2));
  });

  test("round trip", () => {
    const script = Std.seq(Std.let("x", 1), Std.var("x"));
    const code = decompile(script, 0, true);
    const transpiled = transpile(code);
    expect(transpiled).toEqual(script);
  });
  test("compound assignment", () => {
    expect(transpile("x += 1")).toEqual(Std.set("x", MathLib.add(Std.var("x"), 1)));
    expect(transpile("x -= 1")).toEqual(Std.set("x", MathLib.sub(Std.var("x"), 1)));
    expect(transpile("x *= 2")).toEqual(Std.set("x", MathLib.mul(Std.var("x"), 2)));
    expect(transpile("x /= 2")).toEqual(Std.set("x", MathLib.div(Std.var("x"), 2)));
    expect(transpile("x %= 2")).toEqual(Std.set("x", MathLib.mod(Std.var("x"), 2)));
    expect(transpile("x **= 2")).toEqual(Std.set("x", MathLib.pow(Std.var("x"), 2)));

    expect(transpile("x &&= y")).toEqual(
      Std.if(Std.var("x"), Std.set("x", Std.var("y")), Std.var("x")),
    );
    expect(transpile("x ||= y")).toEqual(
      Std.if(Std.var("x"), Std.var("x"), Std.set("x", Std.var("y"))),
    );
    expect(transpile("x ??= y")).toEqual(
      Std.if(BooleanLib.neq(Std.var("x"), null), Std.var("x"), Std.set("x", Std.var("y"))),
    );
  });

  test("compound assignment objects", () => {
    expect(transpile("o.p += 1")).toEqual(
      ObjectLib.objSet(Std.var("o"), "p", MathLib.add(ObjectLib.objGet(Std.var("o"), "p"), 1)),
    );
  });
});
