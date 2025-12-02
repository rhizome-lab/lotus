import { describe, test, expect, mock, beforeAll } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../schema";

// Setup in-memory DB
const db = new Database(":memory:");
initSchema(db);

// Mock the db module
mock.module("../db", () => ({ db }));

import {
  evaluate,
  ScriptContext,
  registerLibrary,
  ScriptError,
} from "./interpreter";
import * as Core from "./lib/core";
import * as Object from "./lib/object";
import * as List from "./lib/list";
import * as String from "./lib/string";
import { createEntity, getEntity } from "../repo";
import { Entity } from "@viwo/shared/jsonrpc";

describe("Interpreter", () => {
  registerLibrary(Core);
  registerLibrary(Object);
  registerLibrary(List);

  const caller: Entity = { id: 1 };
  const target: Entity = { id: 2 };
  target["owner"] = 1;

  const ctx = {
    caller,
    this: target,
    args: [],
    gas: 1000,
    warnings: [],
    vars: {},
  } satisfies ScriptContext;

  test("literals", async () => {
    expect(await evaluate(1, ctx)).toBe(1);
    expect(await evaluate("hello", ctx)).toBe("hello");
    expect(await evaluate(true, ctx)).toBe(true);
  });

  test("math", async () => {
    expect(await evaluate(Core["+"](1, 2), ctx)).toBe(3);
    expect(await evaluate(Core["-"](5, 3), ctx)).toBe(2);
    expect(await evaluate(Core["*"](2, 3), ctx)).toBe(6);
    expect(await evaluate(Core["/"](6, 2), ctx)).toBe(3);
  });

  test("math extended", async () => {
    expect(await evaluate(Core["%"](10, 3), ctx)).toBe(1);
    expect(await evaluate(Core["^"](2, 3), ctx)).toBe(8);
  });

  test("logic", async () => {
    expect(await evaluate(Core["and"](true, true), ctx)).toBe(true);
    expect(await evaluate(Core["or"](true, false), ctx)).toBe(true);
    expect(await evaluate(Core["not"](true), ctx)).toBe(false);
    expect(await evaluate(Core["=="](1, 1), ctx)).toBe(true);
    expect(await evaluate(Core[">"](2, 1), ctx)).toBe(true);
  });

  test("variables", async () => {
    const localCtx = { ...ctx, locals: {} };
    await evaluate(Core["let"]("x", 10), localCtx);
    expect(await evaluate(Core["var"]("x"), localCtx)).toBe(10);
  });

  test("control flow", async () => {
    expect(await evaluate(Core["if"](true, 1, 2), ctx)).toBe(1);
    expect(await evaluate(Core["if"](false, 1, 2), ctx)).toBe(2);

    expect(await evaluate(Core["seq"](1, 2, 3), ctx)).toBe(3);
  });

  test("gas limit", async () => {
    const lowGasCtx = { ...ctx, gas: 2 };
    // seq (1) + let (1) + let (1) = 3 ops -> should fail
    const script = Core["seq"](Core["let"]("a", 1), Core["let"]("b", 2));

    // We expect it to throw
    let error;
    try {
      await evaluate(script, lowGasCtx);
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect((error as Error).message).toContain("Script ran out of gas!");
  });

  test("capabilities", async () => {
    // Insert target into DB so updateEntity works
    const targetId = createEntity({
      name: "Mock",
      foo: "bar",
      permissions: { view: "public", edit: "public" },
    });
    const target = getEntity(targetId)!;

    // prop
    expect(await evaluate(Object["obj.get"](target, "foo"), ctx)).toBe("bar");

    // set_prop
    await evaluate(
      Core["set_entity"](Object["obj.set"](target, "foo", "baz")),
      ctx,
    );

    // Verify DB update
    const row = db
      .query<{ props: string }, [targetId: number]>(
        "SELECT props FROM entities WHERE id = ?",
      )
      .get(targetId)!;
    const props = JSON.parse(row.props);
    expect(props.foo).toBe("baz");
  });

  test("loops", async () => {
    // sum = 0; for x in [1, 2, 3]: sum += x
    const script = Core["seq"](
      Core["let"]("sum", 0),
      Core["for"](
        "x",
        List["list.new"](1, 2, 3),
        Core["let"]("sum", Core["+"](Core["var"]("sum"), Core["var"]("x"))),
      ),
      Core["var"]("sum"),
    );
    expect(await evaluate(script, ctx)).toBe(6);
  });

  test("errors", async () => {
    // Unknown opcode
    try {
      // @ts-expect-error
      await evaluate(["unknown_op"], ctx);
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain("Unknown opcode: unknown_op");
    }
  });

  test("comparisons", async () => {
    expect(await evaluate(Core["!="](1, 2), ctx)).toBe(true);
    expect(await evaluate(Core["<"](1, 2), ctx)).toBe(true);
    expect(await evaluate(Core[">="](2, 2), ctx)).toBe(true);
    expect(await evaluate(Core["<="](2, 2), ctx)).toBe(true);
  });

  test("if else", async () => {
    expect(await evaluate(Core["if"](false, "then", "else"), ctx)).toBe("else");
    expect(await evaluate(Core["if"](false, "then"), ctx)).toBe(null); // No else branch
  });

  test("var retrieval", async () => {
    const localCtx = { ...ctx, vars: { x: 10 } };
    expect(await evaluate(Core["var"]("x"), localCtx)).toBe(10);
    expect(await evaluate(Core["var"]("missing"), localCtx)).toBe(null); // Variable not found
  });

  test("tell other", async () => {
    // Should return null if target is not visible to the player
    expect(
      // TODO: get entity for `other`
      // @ts-expect-error
      await evaluate(Core["call"]("other", "tell", "msg"), ctx).catch((e) => e),
    ).toBeInstanceOf(ScriptError);
  });
});

describe("Interpreter Errors and Warnings", () => {
  registerLibrary(Core);

  const ctx: ScriptContext = {
    caller: { id: 1 },
    this: { id: 2 },
    args: [],
    gas: 1000,
    warnings: [],
    vars: {},
  };

  test("throw", async () => {
    try {
      await evaluate(Core["throw"]("Something went wrong"), ctx);
      expect(true).toBe(false); // Should not reach here
    } catch (e: any) {
      expect(e.message).toBe("Something went wrong");
    }
  });

  test("try/catch", async () => {
    // try { throw "error" } catch { return "caught" }
    const script = Core["try"](
      Core["throw"]("oops"),
      "this should be unused", // No error var
      "caught",
    );
    expect(await evaluate(script, ctx)).toBe("caught");
  });

  test("try/catch with error variable", async () => {
    // try { throw "error" } catch(e) { return e }
    const localCtx = { ...ctx, locals: {} };
    const script = Core["try"](
      Core["throw"]("oops"),
      "err",
      Core["var"]("err"),
    );
    expect(await evaluate(script, localCtx)).toBe("oops");
  });

  test("try/catch no error", async () => {
    // try { return "ok" } catch { return "bad" }
    const script = Core["try"]("ok", "this should be unused", "bad");
    expect(await evaluate(script, ctx)).toBe("ok");
  });

  test("warn", async () => {
    const warnings: string[] = [];
    const localCtx = { ...ctx, warnings };
    await evaluate(Core["warn"]("Be careful"), localCtx);
    expect(localCtx.warnings).toContain("Be careful");
  });

  test("nested try/catch", async () => {
    const script = Core["try"](
      Core["try"](
        Core["throw"]("inner"),
        "this should be unused", // No error var
        Core["throw"]("outer"),
      ),
      "e",
      Core["var"]("e"),
    );
    expect(await evaluate(script, { ...ctx, vars: {} })).toBe("outer");
  });
});

describe("Interpreter Libraries", () => {
  const ctx: ScriptContext = {
    caller: { id: 1 },
    this: { id: 2 },
    args: [],
    gas: 1000,
    warnings: [],
    vars: {},
  };

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
      // (let x 10); (let addX (lambda (y) (+ x y))); (apply addX 5) -> 15
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
