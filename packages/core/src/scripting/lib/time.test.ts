import { expect, beforeEach } from "bun:test";
import {
  evaluate,
  ScriptContext,
  registerLibrary,
  ScriptError,
  createScriptContext,
} from "../interpreter";
import * as Core from "./core";
import * as Time from "./time";
import { createLibraryTester } from "./test-utils";

createLibraryTester(Time, "Time Library", (test) => {
  registerLibrary(Core);
  registerLibrary(Time);

  let ctx: ScriptContext;

  beforeEach(() => {
    ctx = createScriptContext({
      caller: { id: 1 } as any,
      this: { id: 2 } as any,
    });
  });

  test("time.now", async () => {
    const ts = await evaluate(Time["time.now"](), ctx);
    expect(typeof ts).toBe("string");
    expect(new Date(ts).getTime()).toBeLessThanOrEqual(Date.now());
  });

  test("time.format", async () => {
    expect(
      await evaluate(Time["time.format"]("invalid-date", "time"), ctx).catch(
        (e) => e,
      ),
    ).toBeInstanceOf(RangeError);

    const dateStr = "2023-01-01T12:00:00Z";
    expect(
      typeof (await evaluate(Time["time.format"](dateStr, "time"), ctx)),
    ).toBe("string");
    expect(
      typeof (await evaluate(Time["time.format"](dateStr, "date"), ctx)),
    ).toBe("string");
    expect(
      typeof (await evaluate(Time["time.format"](dateStr, "full"), ctx)),
    ).toBe("string");
  });

  test("time.parse", async () => {
    const iso = "2023-01-01T12:00:00.000Z";
    expect(await evaluate(Time["time.parse"](iso), ctx)).toBe(iso);
  });

  test("time.from_timestamp", async () => {
    const ts = 1672574400000; // 2023-01-01T12:00:00.000Z
    expect(await evaluate(Time["time.from_timestamp"](ts), ctx)).toBe(
      "2023-01-01T12:00:00.000Z",
    );
  });

  test("time.to_timestamp", async () => {
    const iso = "2023-01-01T12:00:00.000Z";
    expect(await evaluate(Time["time.to_timestamp"](iso), ctx)).toBe(
      1672574400000,
    );
  });

  test("time.offset", async () => {
    const base = "2023-01-01T00:00:00.000Z";

    // Years
    let res = await evaluate(Time["time.offset"](1, "years", base), ctx);
    expect(new Date(res).getFullYear()).toBe(2024);

    // Months
    res = await evaluate(Time["time.offset"](1, "months", base), ctx);
    expect(new Date(res).getMonth()).toBe(1); // Feb

    // Days
    res = await evaluate(Time["time.offset"](1, "days", base), ctx);
    expect(new Date(res).getDate()).toBe(2);

    // Hours
    res = await evaluate(Time["time.offset"](1, "hours", base), ctx);
    expect(new Date(res).getHours()).not.toBe(new Date(base).getHours());

    // Minutes
    res = await evaluate(Time["time.offset"](1, "minutes", base), ctx);
    expect(new Date(res).getMinutes()).not.toBe(new Date(base).getMinutes());

    // Seconds
    res = await evaluate(Time["time.offset"](1, "seconds", base), ctx);
    expect(new Date(res).getSeconds()).not.toBe(new Date(base).getSeconds());

    // Default date (now)
    res = await evaluate(Time["time.offset"](0, "days"), ctx);
    expect(typeof res).toBe("string");

    // Invalid amount
    // @ts-expect-error
    res = await evaluate(Time["time.offset"]("invalid", "days"), ctx).catch(
      (e) => e,
    );
    expect(res).toBeInstanceOf(ScriptError);
  });
});
