import { describe, test, expect, beforeEach } from "bun:test";
import {
  evaluate,
  ScriptContext,
  registerLibrary,
  ScriptError,
} from "../interpreter";
import { CoreLibrary } from "./core";
import { TimeLibrary } from "./time";

describe("Time Library", () => {
  let ctx: ScriptContext;

  beforeEach(() => {
    registerLibrary(CoreLibrary);
    registerLibrary(TimeLibrary);
    ctx = {
      caller: { id: 1 } as any,
      this: { id: 2 } as any,
      args: [],
      gas: 1000,
      warnings: [],
    };
  });

  test("time.now", async () => {
    const ts = await evaluate(["time.now"], ctx);
    expect(typeof ts).toBe("string");
    expect(new Date(ts).getTime()).toBeLessThanOrEqual(Date.now());
  });

  test("time.format edge cases", async () => {
    expect(
      await evaluate(["time.format", "invalid-date", "time"], ctx).catch(
        (e) => e,
      ),
    ).toBeInstanceOf(RangeError);

    const dateStr = "2023-01-01T12:00:00Z";
    expect(typeof (await evaluate(["time.format", dateStr, "time"], ctx))).toBe(
      "string",
    );
    expect(typeof (await evaluate(["time.format", dateStr, "date"], ctx))).toBe(
      "string",
    );
    expect(typeof (await evaluate(["time.format", dateStr, "full"], ctx))).toBe(
      "string",
    );
  });

  test("time.offset units", async () => {
    const base = "2023-01-01T00:00:00.000Z";

    // Years
    let res = await evaluate(["time.offset", 1, "years", base], ctx);
    expect(new Date(res).getFullYear()).toBe(2024);

    // Months
    res = await evaluate(["time.offset", 1, "months", base], ctx);
    expect(new Date(res).getMonth()).toBe(1); // Feb

    // Days
    res = await evaluate(["time.offset", 1, "days", base], ctx);
    expect(new Date(res).getDate()).toBe(2);

    // Hours
    res = await evaluate(["time.offset", 1, "hours", base], ctx);
    expect(new Date(res).getHours()).not.toBe(new Date(base).getHours());

    // Minutes
    res = await evaluate(["time.offset", 1, "minutes", base], ctx);
    expect(new Date(res).getMinutes()).not.toBe(new Date(base).getMinutes());

    // Seconds
    res = await evaluate(["time.offset", 1, "seconds", base], ctx);
    expect(new Date(res).getSeconds()).not.toBe(new Date(base).getSeconds());

    // Default date (now)
    res = await evaluate(["time.offset", 0, "days"], ctx);
    expect(typeof res).toBe("string");

    // Invalid amount
    res = await evaluate(["time.offset", "invalid", "days"], ctx).catch(
      (e) => e,
    );
    expect(res).toBeInstanceOf(ScriptError);
  });
});
