import { describe, test, expect, mock, beforeAll } from "bun:test";
import { evaluate, ScriptContext } from "./interpreter";
import { Entity } from "../repo";
import { registerStandardLibraries } from "./lib";

// Mock Entity
const mockEntity = (id: number, props: any = {}): Entity => ({
  id,
  name: "Mock",
  kind: "ITEM",
  location_id: null,
  location_detail: null,
  prototype_id: null,
  owner_id: null,
  created_at: "",
  updated_at: "",
  props,
  state: {},
  ai_context: {},
  slug: null,
});

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
  },
  warnings: [],
};

describe("Interpreter Libraries", () => {
  beforeAll(() => {
    registerStandardLibraries();
  });

  describe("String Library", () => {
    test("str.len", async () => {
      expect(await evaluate(["str.len", "hello"], ctx)).toBe(5);
      expect(await evaluate(["str.len", ""], ctx)).toBe(0);
      expect(await evaluate(["str.len", 123], ctx)).toBe(0); // Not a string
    });

    test("str.split", async () => {
      expect(await evaluate(["str.split", "a,b,c", ","], ctx)).toEqual([
        "a",
        "b",
        "c",
      ]);
      expect(await evaluate(["str.split", "abc", ""], ctx)).toEqual([
        "a",
        "b",
        "c",
      ]);
    });

    test("str.join", async () => {
      expect(
        await evaluate(["str.join", ["list", "a", "b", "c"], ","], ctx),
      ).toBe("a,b,c");
      expect(await evaluate(["str.join", ["list"], ","], ctx)).toBe("");
    });

    test("str.concat", async () => {
      expect(await evaluate(["str.concat", "hello", " world"], ctx)).toBe(
        "hello world",
      );
      expect(await evaluate(["str.concat", "num: ", 123], ctx)).toBe(
        "num: 123",
      );
    });

    test("str.slice", async () => {
      expect(await evaluate(["str.slice", "hello", 1], ctx)).toBe("ello");
      expect(await evaluate(["str.slice", "hello", 1, 3], ctx)).toBe("el");
    });

    test("str.lower/upper", async () => {
      expect(await evaluate(["str.lower", "HELLO"], ctx)).toBe("hello");
      expect(await evaluate(["str.upper", "hello"], ctx)).toBe("HELLO");
    });

    test("str.trim", async () => {
      expect(await evaluate(["str.trim", "  hello  "], ctx)).toBe("hello");
    });

    test("str.includes", async () => {
      expect(await evaluate(["str.includes", "hello", "ell"], ctx)).toBe(true);
      expect(await evaluate(["str.includes", "hello", "z"], ctx)).toBe(false);
    });

    test("str.replace", async () => {
      expect(await evaluate(["str.replace", "hello", "l", "w"], ctx)).toBe(
        "hewlo",
      ); // Only first occurrence
    });
  });

  describe("List Library", () => {
    test("list.len", async () => {
      expect(await evaluate(["list.len", ["list", 1, 2, 3]], ctx)).toBe(3);
      expect(await evaluate(["list.len", ["list"]], ctx)).toBe(0);
    });

    test("list.get", async () => {
      expect(await evaluate(["list.get", ["list", 10, 20], 1], ctx)).toBe(20);
      expect(await evaluate(["list.get", ["list", 10, 20], 5], ctx)).toBe(
        undefined,
      );
    });

    test("list.set", async () => {
      // We need a variable to hold the list to modify it in place effectively in a real script,
      // but here we just pass the array literal which will be modified but we can't easily check it unless we return it.
      // Wait, evaluate returns the value of the last expression.
      // But `list.set` returns the value set.
      // Let's use a variable.
      const localCtx = { ...ctx, locals: {} };
      await evaluate(["let", "l", ["list", 1, 2, 3]], localCtx);
      await evaluate(["list.set", ["var", "l"], 1, 99], localCtx);
      expect(await evaluate(["var", "l"], localCtx)).toEqual([1, 99, 3]);
    });

    test("list.push/pop", async () => {
      const localCtx = { ...ctx, locals: {} };
      await evaluate(["let", "l", ["list", 1, 2]], localCtx);

      expect(await evaluate(["list.push", ["var", "l"], 3], localCtx)).toBe(3); // Returns new length
      expect(await evaluate(["var", "l"], localCtx)).toEqual([1, 2, 3]);

      expect(await evaluate(["list.pop", ["var", "l"]], localCtx)).toBe(3); // Returns popped value
      expect(await evaluate(["var", "l"], localCtx)).toEqual([1, 2]);
    });

    test("list.unshift/shift", async () => {
      const localCtx = { ...ctx, locals: {} };
      await evaluate(["let", "l", ["list", 2, 3]], localCtx);

      expect(await evaluate(["list.unshift", ["var", "l"], 1], localCtx)).toBe(
        3,
      );
      expect(await evaluate(["var", "l"], localCtx)).toEqual([1, 2, 3]);

      expect(await evaluate(["list.shift", ["var", "l"]], localCtx)).toBe(1);
      expect(await evaluate(["var", "l"], localCtx)).toEqual([2, 3]);
    });

    test("list.slice", async () => {
      const list = [1, 2, 3, 4, 5];
      // list.slice returns a new list
      expect(
        await evaluate(["list.slice", ["list", ...list], 1, 3], ctx),
      ).toEqual([2, 3]);
    });

    test("list.splice", async () => {
      const localCtx = { ...ctx, locals: {} };
      await evaluate(["let", "l", ["list", 1, 2, 3, 4]], localCtx);

      // Remove 2 elements starting at index 1, insert 99
      const removed = await evaluate(
        ["list.splice", ["var", "l"], 1, 2, 99],
        localCtx,
      );
      expect(removed).toEqual([2, 3]);
      expect(await evaluate(["var", "l"], localCtx)).toEqual([1, 99, 4]);
    });

    test("list.concat", async () => {
      expect(
        await evaluate(["list.concat", ["list", 1], ["list", 2]], ctx),
      ).toEqual([1, 2]);
    });

    test("list.includes", async () => {
      expect(await evaluate(["list.includes", ["list", 1, 2], 2], ctx)).toBe(
        true,
      );
      expect(await evaluate(["list.includes", ["list", 1, 2], 3], ctx)).toBe(
        false,
      );
    });

    test("list.reverse", async () => {
      const localCtx = { ...ctx, locals: {} };
      await evaluate(["let", "l", ["list", 1, 2, 3]], localCtx);
      await evaluate(["list.reverse", ["var", "l"]], localCtx);
      expect(await evaluate(["var", "l"], localCtx)).toEqual([3, 2, 1]);
    });

    test("list.sort", async () => {
      const localCtx = { ...ctx, locals: {} };
      await evaluate(["let", "l", ["list", "b", "a", "c"]], localCtx);
      await evaluate(["list.sort", ["var", "l"]], localCtx);
      expect(await evaluate(["var", "l"], localCtx)).toEqual(["a", "b", "c"]);
    });
  });

  describe("Object Library", () => {
    test("obj.keys", async () => {
      expect(await evaluate(["obj.keys", { a: 1, b: 2 }], ctx)).toEqual([
        "a",
        "b",
      ]);
      expect(await evaluate(["obj.keys", {}], ctx)).toEqual([]);
    });

    test("obj.values", async () => {
      expect(await evaluate(["obj.values", { a: 1, b: 2 }], ctx)).toEqual([
        1, 2,
      ]);
    });

    test("obj.entries", async () => {
      expect(await evaluate(["obj.entries", { a: 1 }], ctx)).toEqual([
        ["a", 1],
      ]);
    });

    test("obj.get", async () => {
      expect(await evaluate(["obj.get", { a: 1 }, "a"], ctx)).toBe(1);
      expect(await evaluate(["obj.get", { a: 1 }, "b"], ctx)).toBe(undefined);
    });

    test("obj.set", async () => {
      const localCtx = { ...ctx, locals: {} };
      await evaluate(["let", "o", { a: 1 }], localCtx);
      await evaluate(["obj.set", ["var", "o"], "b", 2], localCtx);
      expect(await evaluate(["var", "o"], localCtx)).toEqual({ a: 1, b: 2 });
    });

    test("obj.has", async () => {
      expect(await evaluate(["obj.has", { a: 1 }, "a"], ctx)).toBe(true);
      expect(await evaluate(["obj.has", { a: 1 }, "b"], ctx)).toBe(false);
    });

    test("obj.del", async () => {
      const localCtx = { ...ctx, locals: {} };
      await evaluate(["let", "o", { a: 1, b: 2 }], localCtx);
      expect(await evaluate(["obj.del", ["var", "o"], "a"], localCtx)).toBe(
        true,
      );
      expect(await evaluate(["var", "o"], localCtx)).toEqual({ b: 2 });
      expect(await evaluate(["obj.del", ["var", "o"], "c"], localCtx)).toBe(
        false,
      );
    });

    test("obj.merge", async () => {
      expect(
        await evaluate(["obj.merge", { a: 1 }, { b: 2, a: 3 }], ctx),
      ).toEqual({ a: 3, b: 2 });
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
