import { describe, test, expect } from "bun:test";
import { evaluate, registerLibrary, ScriptContext } from "./interpreter";
import { mockEntity } from "../mock";
import { CoreLibrary } from "./lib/core";

const ctx: ScriptContext = {
  caller: mockEntity(1),
  this: mockEntity(2),
  args: [],
  gas: 1000,
  warnings: [],
};

describe("Interpreter Errors and Warnings", () => {
  // Register libraries
  registerLibrary(CoreLibrary);

  test("throw", async () => {
    try {
      await evaluate(["throw", "Something went wrong"], ctx);
      expect(true).toBe(false); // Should not reach here
    } catch (e: any) {
      expect(e.message).toBe("Something went wrong");
    }
  });

  test("try/catch", async () => {
    // try { throw "error" } catch { return "caught" }
    const script = [
      "try",
      ["throw", "oops"],
      null, // No error var
      "caught",
    ];
    expect(await evaluate(script, ctx)).toBe("caught");
  });

  test("try/catch with error variable", async () => {
    // try { throw "error" } catch(e) { return e }
    const localCtx = { ...ctx, locals: {} };
    const script = ["try", ["throw", "oops"], "err", ["var", "err"]];
    expect(await evaluate(script, localCtx)).toBe("oops");
  });

  test("try/catch no error", async () => {
    // try { return "ok" } catch { return "bad" }
    const script = ["try", "ok", null, "bad"];
    expect(await evaluate(script, ctx)).toBe("ok");
  });

  test("warn", async () => {
    const warnings: string[] = [];
    const localCtx = { ...ctx, warnings };
    await evaluate(["warn", "Be careful"], localCtx);
    expect(localCtx.warnings).toContain("Be careful");
  });

  test("nested try/catch", async () => {
    const script = [
      "try",
      [
        "try",
        ["throw", "inner"],
        null,
        ["throw", "outer"], // Rethrow as outer
      ],
      "e",
      ["var", "e"],
    ];
    expect(await evaluate(script, { ...ctx, locals: {} })).toBe("outer");
  });
});
