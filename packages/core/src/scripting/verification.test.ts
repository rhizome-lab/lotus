import { describe, it, expect, beforeAll, mock } from "bun:test";
import { evaluate, ScriptContext, registerLibrary } from "./interpreter";
import { StringLibrary } from "./lib/string";
import { ListLibrary } from "./lib/list";
import { TimeLibrary } from "./lib/time";
import { WorldLibrary } from "./lib/world";
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

describe("Scripting Verification", () => {
  beforeAll(() => {
    registerLibrary(StringLibrary);
    registerLibrary(ListLibrary);
    registerLibrary(TimeLibrary);
    registerLibrary(WorldLibrary);
  });

  const caller = mockEntity(1);
  const target = mockEntity(2);
  target.owner_id = 1;
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
  } satisfies ScriptContext;

  it("should return current time", async () => {
    const result = await evaluate(["time.now"], ctx);
    expect(typeof result).toBe("string");
    expect(new Date(result).getTime()).not.toBeNaN();
  });

  it("should format time", async () => {
    const now = new Date().toISOString();
    const result = await evaluate(["time.format", now, "time"], ctx);
    expect(typeof result).toBe("string");
    expect(result).not.toBe("Invalid Date");
  });

  it("should offset time", async () => {
    const result = await evaluate(["time.offset", 1, "hour"], ctx);
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
  });

  it("should count entities using list.len", async () => {
    const result = await evaluate(["list.len", ["world.entities"]], {
      ...ctx,
      sys: { ...ctx.sys, getAllEntities: () => [1, 2, 3, 4, 5] },
    });
    expect(result).toBe(5);
  });
});
