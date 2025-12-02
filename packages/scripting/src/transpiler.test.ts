import { describe, expect, test } from "bun:test";
import { transpile } from "./transpiler";
import { decompile } from "./decompiler";

describe("transpiler", () => {
  test("literals", () => {
    expect(transpile("1")).toBe(1);
    expect(transpile("'hello'")).toBe("hello");
    expect(transpile("true")).toBe(true);
    expect(transpile("false")).toBe(false);
    expect(transpile("null")).toBe(null);
  });

  test("variables", () => {
    expect(transpile("x")).toEqual(["var", "x"]);
    expect(transpile("let x = 1")).toEqual(["let", "x", 1]);
    expect(transpile("x = 2")).toEqual(["set", "x", 2]);
  });

  test("binary ops", () => {
    expect(transpile("1 + 2")).toEqual(["+", 1, 2]);
    expect(transpile("1 - 2")).toEqual(["-", 1, 2]);
    expect(transpile("1 * 2")).toEqual(["*", 1, 2]);
    expect(transpile("1 / 2")).toEqual(["/", 1, 2]);
    expect(transpile("1 % 2")).toEqual(["%", 1, 2]);
    expect(transpile("1 == 2")).toEqual(["==", 1, 2]);
    expect(transpile("1 != 2")).toEqual(["!=", 1, 2]);
    expect(transpile("1 < 2")).toEqual(["<", 1, 2]);
    expect(transpile("1 > 2")).toEqual([">", 1, 2]);
    expect(transpile("1 <= 2")).toEqual(["<=", 1, 2]);
    expect(transpile("1 >= 2")).toEqual([">=", 1, 2]);
    expect(transpile("true && false")).toEqual(["and", true, false]);
    expect(transpile("true || false")).toEqual(["or", true, false]);
    expect(transpile("'a' in obj")).toEqual(["obj.has", ["var", "obj"], "a"]);
    expect(transpile("2 ** 3")).toEqual(["^", 2, 3]);
  });

  test("unary ops", () => {
    expect(transpile("!true")).toEqual(["not", true]);
  });

  test("arrays", () => {
    expect(transpile("[1, 2]")).toEqual(["list.new", 1, 2]);
  });

  test("objects", () => {
    expect(transpile("{ a: 1, b: 2 }")).toEqual(["obj.new", "a", 1, "b", 2]);
    expect(transpile("{ 'a': 1 }")).toEqual(["obj.new", "a", 1]);
    expect(transpile("delete obj.x")).toEqual(["obj.del", ["var", "obj"], "x"]);
    expect(transpile("delete obj['x']")).toEqual([
      "obj.del",
      ["var", "obj"],
      "x",
    ]);
  });

  test("property access", () => {
    expect(transpile("obj.x")).toEqual(["obj.get", ["var", "obj"], "x"]);
    expect(transpile("obj['x']")).toEqual(["obj.get", ["var", "obj"], "x"]);
  });

  test("property assignment", () => {
    expect(transpile("obj.x = 1")).toEqual(["obj.set", ["var", "obj"], "x", 1]);
  });

  test("function calls", () => {
    expect(transpile("f(x)")).toEqual(["apply", ["var", "f"], ["var", "x"]]);
    expect(transpile("log('msg')")).toEqual(["log", "msg"]);
    expect(transpile("throw('err')")).toEqual(["throw", "err"]);
  });

  test("lambdas", () => {
    expect(transpile("(x) => x + 1")).toEqual([
      "lambda",
      ["x"],
      ["+", ["var", "x"], 1],
    ]);
    expect(transpile("(x) => { return x + 1; }")).toEqual([
      "lambda",
      ["x"],
      ["seq", ["+", ["var", "x"], 1]],
    ]);
  });

  test("control flow", () => {
    expect(transpile("if (true) 1 else 2")).toEqual(["if", true, 1, 2]);
    expect(transpile("if (true) { 1; }")).toEqual(["if", true, ["seq", 1]]);
    expect(transpile("while (true) { 1; }")).toEqual([
      "while",
      true,
      ["seq", 1],
    ]);
    expect(transpile("for (const x of list) { x; }")).toEqual([
      "for",
      "x",
      ["var", "list"],
      ["seq", ["var", "x"]],
    ]);
    expect(transpile("try { 1; } catch (e) { 2; }")).toEqual([
      "try",
      ["seq", 1],
      "e",
      ["seq", 2],
    ]);
  });

  test("sequence", () => {
    expect(transpile("1; 2;")).toEqual(["seq", 1, 2]);
  });

  test("round trip", () => {
    const script = ["seq", ["let", "x", 1], ["var", "x"]];
    const code = decompile(script);
    // decompile produces:
    // let x = 1;
    // x;
    const transpiled = transpile(code);
    expect(transpiled).toEqual(script);
  });
});
