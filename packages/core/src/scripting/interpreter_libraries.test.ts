import { describe, test, expect, mock, beforeAll } from "bun:test";
import { evaluate, registerLibrary, ScriptContext } from "./interpreter";
import * as Core from "./lib/core";
import * as String from "./lib/string";
import * as List from "./lib/list";
import * as Object from "./lib/object";
import { mockEntity } from "../mock";

const ctx: ScriptContext = {
  caller: mockEntity(1),
  this: mockEntity(2),
  args: [],
  gas: 1000,
  sys: {
    move: mock(() => {}),
    create: mock(() => 3),
    send: mock(() => {}),
    destroy: mock(() => {}),
    call: mock(async (_caller, targetId, verb, args, _warnings) => {
      if (targetId === 2 && verb === "test") {
        return "called " + args.join(",");
      }
      return null;
    }),
  } as any,
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
      const localCtx = { ...ctx, locals: {} };
      await evaluate(Core["let"]("x", 10), localCtx);
      await evaluate(
        Core["let"](
          "addX",
          Core["lambda"](["y"], Core["+"](Core["var"]("x"), Core["var"]("y"))),
        ),
        localCtx,
      );
      expect(await evaluate(Core["apply"]("addX", 5), localCtx)).toBe(15);
    });
  });
});
