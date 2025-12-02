import { describe, test, expect } from "bun:test";
import { decompile } from "./decompiler";

describe("Decompiler", () => {
  test("literals", () => {
    expect(decompile(1)).toBe("1");
    expect(decompile("hello")).toBe('"hello"');
    expect(decompile(true)).toBe("true");
    expect(decompile(null)).toBe("null");
  });

  test("simple sequence (statement)", () => {
    const script = ["seq", ["let", "x", 1], ["var", "x"]];
    // When decompiled as a statement (default for top-level seq if we pass isStatement=true, but default is false)
    // Wait, default isStatement=false.
    // But usually we want to decompile the whole script as a block?
    // The editor will likely call it with isStatement=true for the root.

    const expected = "let x = 1;\nx;";
    expect(decompile(script, 0, true)).toBe(expected);
  });

  test("nested sequence", () => {
    const script = ["seq", ["if", true, ["seq", ["let", "y", 2]], null]];

    const expected = `if (true) {
  let y = 2;
}`;
    expect(decompile(script, 0, true)).toBe(expected);
  });

  test("infix operators", () => {
    expect(decompile(["+", 1, 2])).toBe("(1 + 2)");
    expect(decompile(["*", 3, 4])).toBe("(3 * 4)");
    expect(decompile(["==", 1, 1])).toBe("(1 === 1)");
  });

  test("lambda", () => {
    const script = ["lambda", ["x"], ["+", ["var", "x"], 1]];
    expect(decompile(script)).toBe("(x) => (x + 1)");
  });

  test("lambda with block", () => {
    const script = [
      "lambda",
      ["x"],
      ["seq", ["let", "y", 1], ["+", ["var", "x"], ["var", "y"]]],
    ];
    const expected = `(x) => {
  let y = 1;
  return (x + y);
}`;
    expect(decompile(script)).toBe(expected);
  });

  test("function call", () => {
    const script = ["apply", ["var", "f"], 1, 2];
    expect(decompile(script)).toBe("f(1, 2)");
  });
});
