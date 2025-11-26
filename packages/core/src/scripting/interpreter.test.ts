import { describe, test, expect, mock } from "bun:test";
import { evaluate, ScriptContext } from "./interpreter";
import { Entity } from "../repo";

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

describe("Interpreter", () => {
  const caller = mockEntity(1);
  const target = mockEntity(2);
  target.owner_id = 1;
  const sys = {
    move: mock(() => {}),
    create: mock(() => 3),
    destroy: mock(() => {}),
    send: mock(() => {}),
  };

  const ctx: ScriptContext = {
    caller,
    this: target,
    args: [],
    gas: 1000,
    sys,
  };

  test("literals", async () => {
    expect(await evaluate(1, ctx)).toBe(1);
    expect(await evaluate("hello", ctx)).toBe("hello");
    expect(await evaluate(true, ctx)).toBe(true);
  });

  test("math", async () => {
    expect(await evaluate(["+", 1, 2], ctx)).toBe(3);
    expect(await evaluate(["-", 5, 3], ctx)).toBe(2);
    expect(await evaluate(["*", 2, 3], ctx)).toBe(6);
    expect(await evaluate(["/", 6, 2], ctx)).toBe(3);
  });

  test("logic", async () => {
    expect(await evaluate(["and", true, true], ctx)).toBe(true);
    expect(await evaluate(["or", true, false], ctx)).toBe(true);
    expect(await evaluate(["not", true], ctx)).toBe(false);
    expect(await evaluate(["==", 1, 1], ctx)).toBe(true);
    expect(await evaluate([">", 2, 1], ctx)).toBe(true);
  });

  test("variables", async () => {
    const localCtx = { ...ctx, locals: {} };
    await evaluate(["let", "x", 10], localCtx);
    expect(await evaluate(["var", "x"], localCtx)).toBe(10);
  });

  test("control flow", async () => {
    expect(await evaluate(["if", true, 1, 2], ctx)).toBe(1);
    expect(await evaluate(["if", false, 1, 2], ctx)).toBe(2);

    expect(await evaluate(["seq", 1, 2, 3], ctx)).toBe(3);
  });

  test("actions", async () => {
    await evaluate(["tell", "caller", "hello"], ctx);
    expect(sys.send).toHaveBeenCalledWith({ type: "message", text: "hello" });

    await evaluate(["move", "this", "caller"], ctx);
    expect(sys.move).toHaveBeenCalledWith(target.id, caller.id);

    await evaluate(["destroy", "this"], ctx);
    expect(sys.destroy).toHaveBeenCalledWith(target.id);
  });

  test("gas limit", async () => {
    const lowGasCtx = { ...ctx, gas: 2 };
    // seq (1) + let (1) + let (1) = 3 ops -> should fail
    const script = ["seq", ["let", "a", 1], ["let", "b", 2]];

    // We expect it to throw
    let error;
    try {
      await evaluate(script, lowGasCtx);
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect((error as Error).message).toContain("Gas limit");
  });
});
