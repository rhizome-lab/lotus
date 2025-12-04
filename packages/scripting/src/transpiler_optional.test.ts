import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { transpile } from "./transpiler";
import * as Std from "./lib/std";
import * as ObjectLib from "./lib/object";
import * as BooleanLib from "./lib/boolean";
import { ListLib } from ".";

// Mock Math.random for deterministic temp vars
const originalRandom = Math.random;
beforeEach(() => {
  let i = 0;
  Math.random = () => {
    return (i++ * 0.1) % 1;
  };
});
afterEach(() => {
  Math.random = originalRandom;
});

describe("transpiler optional chaining", () => {
  test("simple optional property access", () => {
    // a?.b
    // if (a != null) a.b else null
    const code = "a?.b";
    const expected = Std.if(
      BooleanLib.neq(Std.var("a"), null),
      ObjectLib.objGet(Std.var("a"), "b"),
      null,
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("nested optional property access", () => {
    // a?.b.c
    // if (a != null) a.b.c else null
    // Wait, if a.b is null, it throws? No, .c is not optional here.
    // But if a is null, it short circuits.
    // Implementation:
    // if (a != null) {
    //   a.b.c
    // } else {
    //   null
    // }
    const code = "a?.b.c";
    const expected = Std.if(
      BooleanLib.neq(Std.var("a"), null),
      ObjectLib.objGet(ObjectLib.objGet(Std.var("a"), "b"), "c"),
      null,
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("nested optional chain", () => {
    // a?.b?.c
    // if (a != null) {
    //   let tmp = a.b;
    //   if (tmp != null) {
    //     tmp.c
    //   } else {
    //     null
    //   }
    // } else {
    //   null
    // }
    // Note: My implementation generates temp vars for complex bases.
    // a.b is complex (obj.get).

    // Actually, `a` is simple.
    // First check: a != null.
    // Then next base is `a.b`.
    // Next part is `.c` (optional).
    // `a.b` is complex. So it generates temp var.

    // Let's verify the structure by running the test.
    // I'll trust the transpiler output if it matches the logic.
    const result = transpile("a?.b?.c");
    // console.log(JSON.stringify(result, null, 2));

    // We can construct the expected object manually or just check properties.
    // But let's try to match exact structure.

    // 1. a?. ...
    // if (a != null, buildChain(a.b, [?.c]), null)

    // 2. buildChain(a.b, [?.c])
    // a.b is complex.
    // let tmp = a.b
    // if (tmp != null, tmp.c, null)

    // So:
    // if (a != null, seq(let tmp = a.b, if (tmp != null, tmp.c, null)), null)

    // Wait, `tmp` name is random.
    // I need to mock Math.random or use a regex match / structure match ignoring var names.
    // Or I can just check that it is an `if` containing a `seq` containing an `if`.

    expect(result[0]).toBe("if");
    expect(result[1]).toEqual(BooleanLib.neq(Std.var("a"), null));

    const inner = result[2]; // The then branch
    expect(inner[0]).toBe("seq");
    // let tmp = a.b
    expect(inner[1][0]).toBe("let");
    expect(inner[1][2]).toEqual(ObjectLib.objGet(Std.var("a"), "b"));
    const tmpName = inner[1][1];

    // if (tmp != null, tmp.c, null)
    const innerIf = inner[2];
    expect(innerIf[0]).toBe("if");
    expect(innerIf[1]).toEqual(BooleanLib.neq(Std.var(tmpName), null));
    expect(innerIf[2]).toEqual(ObjectLib.objGet(Std.var(tmpName), "c"));
    expect(innerIf[3]).toBe(null);

    expect(result[3]).toBe(null);
  });

  test("optional element access", () => {
    // arr?.[0]
    const code = "arr?.[0]";
    const expected = Std.if(
      BooleanLib.neq(Std.var("arr"), null),
      ListLib.listGet(Std.var("arr"), 0),
      null,
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("optional call", () => {
    // func?.()
    const code = "func?.()";
    const expected = Std.if(
      BooleanLib.neq(Std.var("func"), null),
      Std.apply(Std.var("func")),
      null,
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("nested optional call", () => {
    // a?.b()
    // if (a != null) a.b() else null
    const code = "a?.b()";
    const expected = Std.if(
      BooleanLib.neq(Std.var("a"), null),
      Std.apply(ObjectLib.objGet(Std.var("a"), "b")),
      null,
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("complex nested chain", () => {
    // a?.[b?.c]
    // a is simple.
    // b?.c is argument.
    // b?.c -> if(b!=null, b.c, null) (b is simple)

    const code = "a?.[b?.c]";
    const keyTranspiled = Std.if(
      BooleanLib.neq(Std.var("b"), null),
      ObjectLib.objGet(Std.var("b"), "c"),
      null,
    );

    const expected = Std.if(
      BooleanLib.neq(Std.var("a"), null),
      ObjectLib.objGet(Std.var("a"), keyTranspiled),
      null,
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("mixed chain a.b?.c", () => {
    const code = "a.b?.c";
    const tmp = "__tmp_";
    const expected = Std.seq(
      Std.let(tmp, ObjectLib.objGet(Std.var("a"), "b")),
      Std.if(BooleanLib.neq(Std.var(tmp), null), ObjectLib.objGet(Std.var(tmp), "c"), null),
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("mixed chain a?.b[c]", () => {
    const code = "a?.b[c]";
    const expected = Std.if(
      BooleanLib.neq(Std.var("a"), null),
      ObjectLib.objGet(ObjectLib.objGet(Std.var("a"), "b"), Std.var("c")),
      null,
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("mixed chain a.b?.[c]", () => {
    const code = "a.b?.[c]";
    const tmp = "__tmp_";
    const expected = Std.seq(
      Std.let(tmp, ObjectLib.objGet(Std.var("a"), "b")),
      Std.if(
        BooleanLib.neq(Std.var(tmp), null),
        ObjectLib.objGet(Std.var(tmp), Std.var("c")),
        null,
      ),
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("mixed chain a?.[b].c", () => {
    const code = "a?.[b].c";
    const expected = Std.if(
      BooleanLib.neq(Std.var("a"), null),
      ObjectLib.objGet(ObjectLib.objGet(Std.var("a"), Std.var("b")), "c"),
      null,
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("mixed chain a[b]?.c", () => {
    const code = "a[b]?.c";
    const tmp = "__tmp_";
    const expected = Std.seq(
      Std.let(tmp, ObjectLib.objGet(Std.var("a"), Std.var("b"))),
      Std.if(BooleanLib.neq(Std.var(tmp), null), ObjectLib.objGet(Std.var(tmp), "c"), null),
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("mixed chain a.b?.()", () => {
    const code = "a.b?.()";
    const tmp = "__tmp_";
    const expected = Std.seq(
      Std.let(tmp, ObjectLib.objGet(Std.var("a"), "b")),
      Std.if(BooleanLib.neq(Std.var(tmp), null), Std.apply(Std.var(tmp)), null),
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("mixed chain a?.().c", () => {
    const code = "a?.().c";
    const expected = Std.if(
      BooleanLib.neq(Std.var("a"), null),
      ObjectLib.objGet(Std.apply(Std.var("a")), "c"),
      null,
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("mixed chain a()?.c", () => {
    const code = "a()?.c";
    // a() is complex, so temp var.
    // i=0.
    const tmp = "__tmp_"; // 0.toString(36) is "0", slice(2,8) is ""
    // Wait, if slice returns empty, var name is "__tmp_".

    const expected = Std.seq(
      Std.let(tmp, Std.apply(Std.var("a"))),
      Std.if(BooleanLib.neq(Std.var(tmp), null), ObjectLib.objGet(Std.var(tmp), "c"), null),
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("nested arg a?.(b?.c)", () => {
    const code = "a?.(b?.c)";
    const arg = Std.if(
      BooleanLib.neq(Std.var("b"), null),
      ObjectLib.objGet(Std.var("b"), "c"),
      null,
    );
    const expected = Std.if(BooleanLib.neq(Std.var("a"), null), Std.apply(Std.var("a"), arg), null);
    expect(transpile(code)).toEqual(expected);
  });

  test("nested arg a?.[b.c]", () => {
    const code = "a?.[b.c]";
    const arg = ObjectLib.objGet(Std.var("b"), "c");
    const expected = Std.if(
      BooleanLib.neq(Std.var("a"), null),
      ObjectLib.objGet(Std.var("a"), arg),
      null,
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("nested arg a?.(b.c)", () => {
    const code = "a?.(b.c)";
    const arg = ObjectLib.objGet(Std.var("b"), "c");
    const expected = Std.if(BooleanLib.neq(Std.var("a"), null), Std.apply(Std.var("a"), arg), null);
    expect(transpile(code)).toEqual(expected);
  });

  test("nested arg a?.[b?.()]", () => {
    const code = "a?.[b?.()]";
    const arg = Std.if(BooleanLib.neq(Std.var("b"), null), Std.apply(Std.var("b")), null);
    const expected = Std.if(
      BooleanLib.neq(Std.var("a"), null),
      ObjectLib.objGet(Std.var("a"), arg),
      null,
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("nested arg a?.(b?.())", () => {
    const code = "a?.(b?.())";
    const arg = Std.if(BooleanLib.neq(Std.var("b"), null), Std.apply(Std.var("b")), null);
    const expected = Std.if(BooleanLib.neq(Std.var("a"), null), Std.apply(Std.var("a"), arg), null);
    expect(transpile(code)).toEqual(expected);
  });
});
