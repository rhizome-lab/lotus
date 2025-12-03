import { expect, beforeEach } from "bun:test";
import {
  evaluate,
  ScriptContext,
  registerLibrary,
  ScriptError,
  createScriptContext,
} from "../interpreter";
import * as Core from "./std";
import * as StringLib from "./string";
import * as List from "./list";
import * as MathLib from "./math";
import * as BooleanLib from "./boolean";
import { createLibraryTester } from "./test-utils";

createLibraryTester(StringLib, "String Library", (test) => {
  registerLibrary(Core);
  registerLibrary(StringLib);
  registerLibrary(List);
  registerLibrary(MathLib);
  registerLibrary(BooleanLib);

  let ctx: ScriptContext;

  beforeEach(() => {
    ctx = createScriptContext({
      caller: { id: 1 } as any,
      this: { id: 2 } as any,
    });
  });

  test("str.len", () => {
    expect(evaluate(StringLib["str.len"]("hello"), ctx)).toBe(5);
    expect(evaluate(StringLib["str.len"](""), ctx)).toBe(0);
    expect(
      (() => {
        try {
          // @ts-expect-error
          return evaluate(StringLib["str.len"](123), ctx);
        } catch (e) {
          return e;
        }
      })(),
    ).toBeInstanceOf(ScriptError);
  });

  test("str.split", () => {
    expect(evaluate(StringLib["str.split"]("a,b,c", ","), ctx)).toEqual(["a", "b", "c"]);
    expect(evaluate(StringLib["str.split"]("abc", ""), ctx)).toEqual(["a", "b", "c"]);
  });

  test("str.join", () => {
    expect(evaluate(StringLib["str.join"](List["list.new"]("a", "b", "c"), ","), ctx)).toBe(
      "a,b,c",
    );
    expect(evaluate(StringLib["str.join"](List["list.new"](), ","), ctx)).toBe("");
  });

  test("str.concat", () => {
    expect(evaluate(StringLib["str.concat"]("hello", " world"), ctx)).toBe("hello world");
    expect(evaluate(StringLib["str.concat"]("num: ", 123), ctx)).toBe("num: 123");
  });

  test("str.slice", () => {
    expect(evaluate(StringLib["str.slice"]("hello", 1), ctx)).toBe("ello");
    expect(evaluate(StringLib["str.slice"]("hello", 1, 3), ctx)).toBe("el");
  });

  test("str.lower", () => {
    expect(evaluate(StringLib["str.lower"]("HELLO"), ctx)).toBe("hello");
  });

  test("str.upper", () => {
    expect(evaluate(StringLib["str.upper"]("hello"), ctx)).toBe("HELLO");
  });

  test("str.trim", () => {
    expect(evaluate(StringLib["str.trim"]("  hello  "), ctx)).toBe("hello");
  });

  test("str.includes", () => {
    expect(evaluate(StringLib["str.includes"]("hello", "ell"), ctx)).toBe(true);
    expect(evaluate(StringLib["str.includes"]("hello", "z"), ctx)).toBe(false);
  });

  test("str.replace", () => {
    expect(evaluate(StringLib["str.replace"]("hello", "l", "w"), ctx)).toBe("hewlo"); // Only first occurrence
  });
});
