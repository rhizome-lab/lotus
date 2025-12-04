import { expect, test, describe } from "bun:test";
import { transpile } from "./transpiler";
import { evaluate, createScriptContext } from "./interpreter";
import * as StdLib from "./lib/std";
import * as MathLib from "./lib/math";
import * as BooleanLib from "./lib/boolean";
import * as ListLib from "./lib/list";
import * as ObjectLib from "./lib/object";
import * as StringLib from "./lib/string";
import { registerLibrary } from "./interpreter";

registerLibrary(StdLib);
registerLibrary(MathLib);
registerLibrary(BooleanLib);
registerLibrary(ListLib);
registerLibrary(ObjectLib);
registerLibrary(StringLib);

const run = async (code: string) => {
  try {
    const ast = transpile(code);
    const ctx = createScriptContext({
      caller: { id: 0 } as any,
      this: { id: 0 } as any,
    });
    return await evaluate(ast, ctx);
  } catch (e) {
    console.error("Test execution failed:", e);
    throw e;
  }
};

describe("Scoping", () => {
  test("Block scoping - variables should not leak", async () => {
    const code = `
      let x = 1;
      {
        let y = 2;
      }
      x;
    `;
    expect(await run(code)).toBe(1);

    // y should not be accessible
    const code2 = `
      {
        let y = 2;
      }
      y;
    `;
    // Depending on implementation, accessing undefined var might return null or throw.
    // Our var opcode returns null if not found.
    expect(await run(code2)).toBe(null);
  });

  test("Shadowing - inner variable should shadow outer", async () => {
    const code = `
      let x = 1;
      {
        let x = 2;
        if (x != 2) throw "Inner x should be 2";
      }
      if (x != 1) throw "Outer x should be 1";
      x;
    `;
    expect(await run(code)).toBe(1);
  });

  test("Assignment - should update nearest variable", async () => {
    const code = `
      let x = 1;
      {
        x = 2;
      }
      x;
    `;
    expect(await run(code)).toBe(2);
  });

  test("Assignment - should update shadowed variable only", async () => {
    const code = `
      let x = 1;
      {
        let x = 2;
        x = 3;
        if (x != 3) throw "Inner x should be 3";
      }
      x;
    `;
    expect(await run(code)).toBe(1);
  });

  test("Closures - should capture by reference", async () => {
    const code = `
      let x = 1;
      let f = () => x;
      x = 2;
      f();
    `;
    expect(await run(code)).toBe(2);
  });

  test("Closures - should maintain their own scope", async () => {
    const code = `
      let makeCounter = () => {
        let count = 0;
        return () => {
          count = count + 1;
          return count;
        };
      };
      let c1 = makeCounter();
      let c2 = makeCounter();
      c1(); // 1
      c1(); // 2
      c2(); // 1
      if (c1() != 3) throw "c1 should be 3";
      if (c2() != 2) throw "c2 should be 2";
      "ok";
    `;
    expect(await run(code)).toBe("ok");
  });

  test("Loops - loop variable should be scoped", async () => {
    const code = `
      let i = "outer";
      for (let i of [1, 2, 3]) {
        // do nothing
      }
      i;
    `;
    expect(await run(code)).toBe("outer");
  });

  test("Loops - for loop variable capture", async () => {
    const code = `
      let funcs = [];
      for (let i of [1, 2, 3]) {
        list.push(funcs, () => i);
      }
      let results = list.map(funcs, f => f());
      results;
    `;
    // We expect [1, 2, 3]
    const result = await run(code);
    expect(result).toEqual([1, 2, 3]);
  });

  test("While loop scoping", async () => {
    const code = `
      let x = 0;
      while (x < 1) {
        let y = 2;
        x = x + 1;
      }
      y; 
    `;
    expect(await run(code)).toBe(null);
  });

  test("If statement scoping", async () => {
    const code = `
        let x = 1;
        if (true) {
            let y = 2;
        }
        y;
    `;
    expect(await run(code)).toBe(null);
  });
});
