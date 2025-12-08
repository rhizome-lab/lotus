import { compile, transpile } from "../packages/scripting/src/index.ts";
import { describe, expect, it } from "bun:test";

describe("Typed Facade Architecture", () => {
  const ops = {};

  it("should preserve 'this' when transpiling method calls", () => {
    // 1. Source (Simulating SDK call)
    // "std.arg(0).check()"

    // We expect the transpiler to convert this `CallExpression`
    // into `["std.call_method", ["std.arg", 0], "check", []]`

    const source = `std.arg(0).check()`;
    const transpiled = transpile(source); // Note: transpile returns an S-Expr

    // Check structure
    expect(transpiled[0]).toBe("std.call_method");
    expect(transpiled[2]).toBe("check");

    // 2. Compilation (Simulating Kernel Execution)
    const compiled = compile(transpiled, ops);

    // 3. Execution (Simulating Native Object Host)
    const nativeObj = {
      // oxlint-disable-next-line consistent-function-scoping
      check: function check() {
        return this.id;
      },
      id: "SECRET_ID",
    };

    const result = compiled({ args: [nativeObj] } as any);
    expect(result).toBe("SECRET_ID");
  });
});
