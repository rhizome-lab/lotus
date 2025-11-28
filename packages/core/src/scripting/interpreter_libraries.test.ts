import { describe, test, expect, mock, beforeAll } from "bun:test";
import { evaluate, registerLibrary, ScriptContext } from "./interpreter";
import { StringLibrary } from "./lib/string";
import { ListLibrary } from "./lib/list";
import { ObjectLibrary } from "./lib/object";
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
};

describe("Interpreter Libraries", () => {
  beforeAll(() => {
    registerLibrary(StringLibrary);
    registerLibrary(ListLibrary);
    registerLibrary(ObjectLibrary);
  });

  describe("Lambda & HOF", () => {
    test("lambda & apply", async () => {
      // (lambda (x) (+ x 1))
      const inc = ["lambda", ["x"], ["+", ["var", "x"], 1]];
      expect(await evaluate(["apply", inc, 1], ctx)).toBe(2);
    });

    test("closure capture", async () => {
      // (let x 10)
      // (let addX (lambda (y) (+ x y)))
      // (apply addX 5) -> 15
      const localCtx = { ...ctx, locals: {} };
      await evaluate(["let", "x", 10], localCtx);
      await evaluate(
        ["let", "addX", ["lambda", ["y"], ["+", ["var", "x"], ["var", "y"]]]],
        localCtx,
      );
      expect(await evaluate(["apply", ["var", "addX"], 5], localCtx)).toBe(15);
    });
  });

  describe("Call Opcode", () => {
    test("call", async () => {
      // call(target, verb, args...)
      // We mocked sys.call to return "called " + args.join(",") if target=2 and verb="test"
      expect(await evaluate(["call", "this", "test", "a", "b"], ctx)).toBe(
        "called a,b",
      );
    });
  });
});
