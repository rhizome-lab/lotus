import { expect, beforeEach } from "bun:test";
import {
  evaluate,
  ScriptContext,
  registerLibrary,
  ScriptError,
  createScriptContext,
} from "../interpreter";
import * as Core from "./core";
import * as StringLib from "./string";
import * as List from "./list";
import { createLibraryTester } from "./test-utils";

createLibraryTester(StringLib, "String Library", (test) => {
  registerLibrary(Core);
  registerLibrary(StringLib);
  registerLibrary(List); // Needed for str.join test

  let ctx: ScriptContext;

  beforeEach(() => {
    ctx = createScriptContext({
      caller: { id: 1 } as any,
      this: { id: 2 } as any,
    });
  });

  test("str.len", async () => {
    expect(await evaluate(StringLib["str.len"]("hello"), ctx)).toBe(5);
    expect(await evaluate(StringLib["str.len"](""), ctx)).toBe(0);
    expect(
      // @ts-expect-error
      await evaluate(StringLib["str.len"](123), ctx).catch((e) => e),
    ).toBeInstanceOf(ScriptError);
  });

  test("str.split", async () => {
    expect(await evaluate(StringLib["str.split"]("a,b,c", ","), ctx)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(await evaluate(StringLib["str.split"]("abc", ""), ctx)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  test("str.join", async () => {
    expect(
      await evaluate(
        StringLib["str.join"](List["list.new"]("a", "b", "c"), ","),
        ctx,
      ),
    ).toBe("a,b,c");
    expect(
      await evaluate(StringLib["str.join"](List["list.new"](), ","), ctx),
    ).toBe("");
  });

  test("str.concat", async () => {
    expect(
      await evaluate(StringLib["str.concat"]("hello", " world"), ctx),
    ).toBe("hello world");
    expect(await evaluate(StringLib["str.concat"]("num: ", 123), ctx)).toBe(
      "num: 123",
    );
  });

  test("str.slice", async () => {
    expect(await evaluate(StringLib["str.slice"]("hello", 1), ctx)).toBe(
      "ello",
    );
    expect(await evaluate(StringLib["str.slice"]("hello", 1, 3), ctx)).toBe(
      "el",
    );
  });

  test("str.lower", async () => {
    expect(await evaluate(StringLib["str.lower"]("HELLO"), ctx)).toBe("hello");
  });

  test("str.upper", async () => {
    expect(await evaluate(StringLib["str.upper"]("hello"), ctx)).toBe("HELLO");
  });

  test("str.trim", async () => {
    expect(await evaluate(StringLib["str.trim"]("  hello  "), ctx)).toBe(
      "hello",
    );
  });

  test("str.includes", async () => {
    expect(await evaluate(StringLib["str.includes"]("hello", "ell"), ctx)).toBe(
      true,
    );
    expect(await evaluate(StringLib["str.includes"]("hello", "z"), ctx)).toBe(
      false,
    );
  });

  test("str.replace", async () => {
    expect(
      await evaluate(StringLib["str.replace"]("hello", "l", "w"), ctx),
    ).toBe("hewlo"); // Only first occurrence
  });
});
