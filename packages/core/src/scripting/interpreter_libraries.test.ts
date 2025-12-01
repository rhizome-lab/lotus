import { describe, test, expect, beforeAll } from "bun:test";
import { evaluate, registerLibrary, ScriptContext } from "./interpreter";
import * as Core from "./lib/core";
import * as String from "./lib/string";
import * as List from "./lib/list";
import * as Object from "./lib/object";

const ctx: ScriptContext = {
  caller: { id: 1 },
  this: { id: 2 },
  args: [],
  gas: 1000,
  warnings: [],
  vars: {},
};

describe("Interpreter Libraries", () => {
  beforeAll(() => {
    registerLibrary(Core);
    registerLibrary(String);
    registerLibrary(List);
    registerLibrary(Object);
  });

  describe("Lambda & HOF", () => {
    test("lambda & apply", async () => {
      // (lambda (x) (+ x 1))
      const inc = Core["lambda"](["x"], Core["+"](Core["var"]("x"), 1));
      expect(await evaluate(Core["apply"](inc, 1), ctx)).toBe(2);
    });

    test("closure capture", async () => {
      // (let x 10)
      // (let addX (lambda (y) (+ x y)))
      // (apply addX 5) -> 15
      expect(
        await evaluate(
          Core["seq"](
            Core["let"]("x", 10),
            Core["let"](
              "addX",
              Core["lambda"](
                ["y"],
                Core["+"](Core["var"]("x"), Core["var"]("y")),
              ),
            ),
            Core["apply"](Core["var"]("addX"), 5),
          ),
          ctx,
        ),
      ).toBe(15);
    });
  });
});
