import { describe, test, expect, beforeEach } from "bun:test";
import {
  evaluate,
  ScriptContext,
  registerLibrary,
  ScriptError,
  createScriptContext,
} from "../interpreter";
import * as Core from "./core";
import * as String from "./string";
import * as List from "./list";

describe("String Library", () => {
  registerLibrary(Core);
  registerLibrary(String);
  registerLibrary(List); // Needed for str.join test

  let ctx: ScriptContext;

  beforeEach(() => {
    ctx = createScriptContext({
      caller: { id: 1 } as any,
      this: { id: 2 } as any,
    });
  });

  test("str.len", async () => {
    expect(await evaluate(String["str.len"]("hello"), ctx)).toBe(5);
    expect(await evaluate(String["str.len"](""), ctx)).toBe(0);
    expect(
      // @ts-expect-error
      await evaluate(String["str.len"](123), ctx).catch((e) => e),
    ).toBeInstanceOf(ScriptError);
  });

  test("str.split", async () => {
    expect(await evaluate(String["str.split"]("a,b,c", ","), ctx)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(await evaluate(String["str.split"]("abc", ""), ctx)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  test("str.join", async () => {
    expect(
      await evaluate(
        String["str.join"](List["list.new"]("a", "b", "c"), ","),
        ctx,
      ),
    ).toBe("a,b,c");
    expect(
      await evaluate(String["str.join"](List["list.new"](), ","), ctx),
    ).toBe("");
  });

  test("str.concat", async () => {
    expect(await evaluate(String["str.concat"]("hello", " world"), ctx)).toBe(
      "hello world",
    );
    expect(await evaluate(String["str.concat"]("num: ", 123), ctx)).toBe(
      "num: 123",
    );
  });

  test("str.slice", async () => {
    expect(await evaluate(String["str.slice"]("hello", 1), ctx)).toBe("ello");
    expect(await evaluate(String["str.slice"]("hello", 1, 3), ctx)).toBe("el");
  });

  test("str.lower/upper", async () => {
    expect(await evaluate(String["str.lower"]("HELLO"), ctx)).toBe("hello");
    expect(await evaluate(String["str.upper"]("hello"), ctx)).toBe("HELLO");
  });

  test("str.trim", async () => {
    expect(await evaluate(String["str.trim"]("  hello  "), ctx)).toBe("hello");
  });

  test("str.includes", async () => {
    expect(await evaluate(String["str.includes"]("hello", "ell"), ctx)).toBe(
      true,
    );
    expect(await evaluate(String["str.includes"]("hello", "z"), ctx)).toBe(
      false,
    );
  });

  test("str.replace", async () => {
    expect(await evaluate(String["str.replace"]("hello", "l", "w"), ctx)).toBe(
      "hewlo",
    ); // Only first occurrence
  });
});
