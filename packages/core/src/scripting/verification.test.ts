import { describe, it, expect, beforeAll, mock } from "bun:test";
import { evaluate, ScriptContext, registerLibrary } from "./interpreter";
import * as Core from "./lib/core";
import * as String from "./lib/string";
import * as List from "./lib/list";
import * as Time from "./lib/time";
import { mockEntity } from "../mock";

describe("Scripting Verification", () => {
  beforeAll(() => {
    registerLibrary(Core);
    registerLibrary(String);
    registerLibrary(List);
    registerLibrary(Time);
  });

  const caller = mockEntity(1);
  const target = mockEntity(2);
  target["owner"] = 1;
  const sys = {
    move: mock(() => {}),
    create: mock(() => 3),
    destroy: mock(() => {}),
    send: mock(() => {}),
  } as any;

  const ctx = {
    caller,
    this: target,
    args: [],
    gas: 1000,
    sys,
    warnings: [],
    vars: {},
  } satisfies ScriptContext;

  it("should return current time", async () => {
    const result = await evaluate(Time["time.now"](), ctx);
    expect(typeof result).toBe("string");
    expect(new Date(result).getTime()).not.toBeNaN();
  });

  it("should format time", async () => {
    const now = new Date().toISOString();
    const result = await evaluate(Time["time.format"](now, "time"), ctx);
    expect(typeof result).toBe("string");
    expect(result).not.toBe("Invalid Date");
  });

  it("should offset time", async () => {
    const result = await evaluate(Time["time.offset"](1, "hour"), ctx);
    const now = new Date();
    const future = new Date(result);
    // Allow some small delta
    const diff = future.getTime() - now.getTime();
    expect(diff).toBeGreaterThan(3500000); // > 3500s (almost 1h)
    expect(diff).toBeLessThan(3700000); // < 3700s
  });

  it("should list entities (mocked)", async () => {
    const result = await evaluate(["world.entities"], {
      ...ctx,
      sys: { ...ctx.sys, getAllEntities: () => [1, 2, 3] },
    });
    expect(result).toEqual([1, 2, 3]);
    const result2 = await evaluate(List["list.len"](["world.entities"]), {
      ...ctx,
      sys: { ...ctx.sys, getAllEntities: () => ["a", 2, true] },
    });
    expect(result2).toEqual(["a", 2, true]);
  });

  it("should count entities using list.len", async () => {
    const result = await evaluate(List["list.len"](["world.entities"]), {
      ...ctx,
      sys: { ...ctx.sys, getAllEntities: () => [3, 2, 1] },
    });
    expect(result).toBe(3);
    const result2 = await evaluate(List["list.len"](["world.entities"]), {
      ...ctx,
      sys: { ...ctx.sys, getAllEntities: () => [1, 2, 3, 4, 5] },
    });
    expect(result2).toBe(5);
  });
});
