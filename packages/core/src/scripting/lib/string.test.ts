import { describe, test, expect, beforeEach } from "bun:test";
import {
  evaluate,
  ScriptContext,
  registerLibrary,
  ScriptError,
} from "../interpreter";
import { CoreLibrary } from "./core";
import { StringLibrary } from "./string";
import { ListLibrary } from "./list";

describe("String Library", () => {
  let ctx: ScriptContext;

  beforeEach(() => {
    registerLibrary(CoreLibrary);
    registerLibrary(StringLibrary);
    registerLibrary(ListLibrary); // Needed for str.join test
    ctx = {
      caller: { id: 1 } as any,
      this: { id: 2 } as any,
      args: [],
      gas: 1000,
      warnings: [],
    };
  });

  test("str.len", async () => {
    expect(await evaluate(["str.len", "hello"], ctx)).toBe(5);
    expect(await evaluate(["str.len", ""], ctx)).toBe(0);
    expect(
      await evaluate(["str.len", 123], ctx).catch((e) => e),
    ).toBeInstanceOf(ScriptError);
  });

  test("str.split", async () => {
    expect(await evaluate(["str.split", "a,b,c", ","], ctx)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(await evaluate(["str.split", "abc", ""], ctx)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  test("str.join", async () => {
    expect(
      await evaluate(["str.join", ["list", "a", "b", "c"], ","], ctx),
    ).toBe("a,b,c");
    expect(await evaluate(["str.join", ["list"], ","], ctx)).toBe("");
  });

  test("str.concat", async () => {
    expect(await evaluate(["str.concat", "hello", " world"], ctx)).toBe(
      "hello world",
    );
    expect(await evaluate(["str.concat", "num: ", 123], ctx)).toBe("num: 123");
  });

  test("str.slice", async () => {
    expect(await evaluate(["str.slice", "hello", 1], ctx)).toBe("ello");
    expect(await evaluate(["str.slice", "hello", 1, 3], ctx)).toBe("el");
  });

  test("str.lower/upper", async () => {
    expect(await evaluate(["str.lower", "HELLO"], ctx)).toBe("hello");
    expect(await evaluate(["str.upper", "hello"], ctx)).toBe("HELLO");
  });

  test("str.trim", async () => {
    expect(await evaluate(["str.trim", "  hello  "], ctx)).toBe("hello");
  });

  test("str.includes", async () => {
    expect(await evaluate(["str.includes", "hello", "ell"], ctx)).toBe(true);
    expect(await evaluate(["str.includes", "hello", "z"], ctx)).toBe(false);
  });

  test("str.replace", async () => {
    expect(await evaluate(["str.replace", "hello", "l", "w"], ctx)).toBe(
      "hewlo",
    ); // Only first occurrence
  });
});
