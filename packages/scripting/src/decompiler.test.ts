import { describe, test, expect } from "bun:test";
import { decompile } from "./decompiler";
import * as Std from "./lib/std";
import * as MathLib from "./lib/math";
import * as List from "./lib/list";
import * as ObjectLib from "./lib/object";
import * as BooleanLib from "./lib/boolean";

describe("Decompiler", () => {
  test("literals", () => {
    expect(decompile(1)).toBe("1");
    expect(decompile("hello")).toBe('"hello"');
    expect(decompile(true)).toBe("true");
    expect(decompile(null)).toBe("null");
  });

  test("simple sequence (statement)", () => {
    const script = Std.seq(Std.let("x", 1), Std.var("x"));

    const expected = "let x = 1;\nx;";
    expect(decompile(script, 0, true)).toBe(expected);
  });

  test("nested sequence", () => {
    const script = Std.seq(Std.if(true, Std.seq(Std.let("y", 2)), null));

    const expected = `if (true) {
  let y = 2;
}`;
    expect(decompile(script, 0, true)).toBe(expected);
  });

  test("infix operators", () => {
    expect(decompile(MathLib["+"](1, 2))).toBe("(1 + 2)");
    expect(decompile(MathLib["*"](3, 4))).toBe("(3 * 4)");
    expect(decompile(BooleanLib["=="](1, 1))).toBe("(1 === 1)");
  });

  test("nested infix operators", () => {
    // (1 + (2 * 3))
    const script = MathLib["+"](1, MathLib["*"](2, 3));
    expect(decompile(script)).toBe("(1 + (2 * 3))");
  });

  test("lambda", () => {
    const script = Std.lambda(["x"], MathLib["+"](Std.var("x"), 1));
    expect(decompile(script)).toBe("(x) => (x + 1)");
  });

  test("lambda with block", () => {
    const script = Std.lambda(
      ["x"],
      Std.seq(Std.let("y", 1), MathLib["+"](Std.var("x"), Std.var("y"))),
    );
    const expected = `(x) => {
  let y = 1;
  return (x + y);
}`;
    expect(decompile(script)).toBe(expected);
  });

  test("function call", () => {
    const script = Std.apply(Std.var("f"), 1, 2);
    expect(decompile(script)).toBe("f(1, 2)");
  });

  test("loops", () => {
    // while (true) { log("loop") }
    const whileScript = Std.while(true, Std.log("loop"));
    const expectedWhile = `while (true) {
  console.log("loop");
}`;
    expect(decompile(whileScript, 0, true)).toBe(expectedWhile);

    // for (x of list) { log(x) }
    const forScript = Std.for("x", List["list.new"](1, 2), Std.log(Std.var("x")));
    const expectedFor = `for (const x of [1, 2]) {
  console.log(x);
}`;
    expect(decompile(forScript, 0, true)).toBe(expectedFor);
  });

  test("data structures", () => {
    const list = List["list.new"](1, 2, 3);
    expect(decompile(list)).toBe("[1, 2, 3]");

    const obj = ObjectLib["obj.new"](["a", 1], ["b", 2]);
    expect(decompile(obj)).toBe('{ "a": 1, "b": 2 }');

    // obj.get
    expect(decompile(ObjectLib["obj.get"](Std.var("o"), "k"))).toBe("o.k");
    expect(decompile(ObjectLib["obj.get"](Std.var("o"), "invalid-key"))).toBe('o["invalid-key"]');
    expect(decompile(ObjectLib["obj.get"](Std.var("o"), "k", "default"))).toBe(
      '(o.k ?? "default")',
    );

    // obj.set
    expect(decompile(ObjectLib["obj.set"](Std.var("o"), "k", 3))).toBe("o.k = 3");

    // obj.has
    expect(decompile(ObjectLib["obj.has"](Std.var("o"), "k"))).toBe('"k" in o');

    // obj.del
    expect(decompile(ObjectLib["obj.del"](Std.var("o"), "k"))).toBe("delete o.k");
  });
});
