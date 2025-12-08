import { ObjectLib, StdLib, compile } from "../packages/scripting/src/index.ts";
import { describe, expect, it } from "bun:test";

describe("Method Call 'this' Context", () => {
  const ops = {};

  it("should preserve 'this' in method calls", () => {
    const nativeObj = {
      // oxlint-disable-next-line consistent-function-scoping
      check: function check() {
        return this.id;
      },
      id: "SECRET",
    };

    // Script: arg(0).check()
    // Compiles to: std.apply(obj.get(arg0, "check"), [])
    const callScript = StdLib.apply(ObjectLib.objGet(StdLib.arg(0), "check"));

    const compiled = compile(callScript, ops);

    // Execution
    const result = compiled({ args: [nativeObj] } as any);

    expect(result).toBe("SECRET");
  });
});
