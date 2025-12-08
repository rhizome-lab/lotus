import { ListLib, ObjectLib, StdLib } from ".";
import { describe, expect, it } from "bun:test";
import { compile } from "./compiler";

describe("compiler security attributes", () => {
  const ops = {}; // No extra ops needed

  it("should prevent static access to dangerous keys (obj.get)", () => {
    expect(() => {
      compile(ObjectLib.objGet(ObjectLib.objNew(["__proto__", 1]), "__proto__"), ops);
    }).toThrow(/Security Error: Cannot access dangerous key "__proto__"/);
  });

  it("should prevent static access to dangerous keys (obj.set)", () => {
    expect(() => {
      compile(ObjectLib.objSet(ObjectLib.objNew(), "constructor", 1), ops);
    }).toThrow(/Security Error: Cannot access dangerous key "constructor"/);
  });

  it("should prevent static access to dangerous keys (obj.new)", () => {
    expect(() => {
      compile(ObjectLib.objNew(["prototype", 1]), ops);
    }).toThrow(/Security Error: Cannot access dangerous key "prototype"/);
  });

  it("should prevent dynamic access to dangerous keys (runtime)", () => {
    const script = ObjectLib.objGet(ObjectLib.objNew(["foo", "bar"]), StdLib.arg(0));
    const compiledFn = compile(script, ops);

    // We need a proper context for std.let/std.var to work if they use context?
    // std.let uses JS variables in the compiled function.
    // std.var just references them.
    // It should work with minimal
    // It uses `let ${toJSName(name)} = ...`.
    // So we don't need context for vars.

    expect(() => {
      compiledFn({ args: ["constructor"] } as any);
    }).toThrow(/Security Error: Cannot access dangerous key "constructor"/);
  });

  it("should allow safe keys", () => {
    const script = ObjectLib.objGet(ObjectLib.objNew(["foo", "bar"]), "foo");
    const compiledFn = compile(script, ops);
    expect(compiledFn({} as any)).toBe("bar");
  });

  it("should prevent list.get with dangerous key", () => {
    // @ts-expect-error We are intentionally passing invalid input to test the runtime check
    const script = ListLib.listGet(ListLib.listNew(1, 2), "constructor");
    // Compile time check if "constructor" is string literal
    expect(() => {
      compile(script, ops);
    }).toThrow(/Security Error: Cannot access dangerous key "constructor"/);
  });

  it("should prevent list.get with dynamic dangerous key", () => {
    // Dynamic key
    const script = ListLib.listGet(ListLib.listNew(1, 2), StdLib.arg(0));
    const compiledFn = compile(script, ops);
    expect(() => {
      compiledFn({ args: ["constructor"] } as any);
    }).toThrow(/Security Error: Cannot access dangerous key "constructor"/);
  });

  it("should optimize constant keys (no runtime check)", () => {
    const script = ObjectLib.objGet(ObjectLib.objNew(["foo", "bar"]), "foo");
    const compiledFn = compile(script, ops);
    const funcString = compiledFn.toString();
    expect(funcString).not.toContain("checkObjKey");
    expect(compiledFn({} as any)).toBe("bar");
  });

  it("should NOT optimize dynamic keys (runtime check present)", () => {
    const script = ObjectLib.objGet(ObjectLib.objNew(["foo", "bar"]), StdLib.arg(0));
    const compiledFn = compile(script, ops);
    const funcString = compiledFn.toString();
    expect(funcString).toContain("checkObjKey");
  });
});
