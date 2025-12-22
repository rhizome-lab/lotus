import * as BooleanLib from "./lib/boolean";
import * as ListLib from "./lib/list";
import * as ObjectLib from "./lib/object";
import * as StdLib from "./lib/std";
import { describe, expect, test } from "bun:test";
import { transpile } from "./transpiler";

// Temp vars are now deterministic: __tmp_1, __tmp_2, etc.
// Counter resets at start of each transpile() call.

describe("transpiler optional chaining", () => {
  test("simple optional property access", () => {
    // a?.b
    // if (a != null) a.b else null
    const code = "a?.b";
    const expected = StdLib.if(
      BooleanLib.neq(StdLib.var("a"), null),
      ObjectLib.objGet(StdLib.var("a"), "b"),
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
    const expected = StdLib.if(
      BooleanLib.neq(StdLib.var("a"), null),
      ObjectLib.objGet(ObjectLib.objGet(StdLib.var("a"), "b"), "c"),
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

    expect(result[0]).toBe("std.if");
    expect(result[1]).toEqual(BooleanLib.neq(StdLib.var("a"), null));

    const { 2: inner } = result; // The then branch
    expect(inner[0]).toBe("std.seq");
    // let tmp = a.b
    expect(inner[1][0]).toBe("std.let");
    expect(inner[1][2]).toEqual(ObjectLib.objGet(StdLib.var("a"), "b"));
    const [, [, tmpName]] = inner;

    // if (tmp != null, tmp.c, null)
    const { 2: innerIf } = inner;
    expect(innerIf[0]).toBe("std.if");
    expect(innerIf[1]).toEqual(BooleanLib.neq(StdLib.var(tmpName), null));
    expect(innerIf[2]).toEqual(ObjectLib.objGet(StdLib.var(tmpName), "c"));
    expect(innerIf[3]).toBe(null);

    expect(result[3]).toBe(null);
  });

  test("optional element access", () => {
    // arr?.[0]
    const code = "arr?.[0]";
    const expected = StdLib.if(
      BooleanLib.neq(StdLib.var("arr"), null),
      ListLib.listGet(StdLib.var("arr"), 0),
      null,
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("optional call", () => {
    // func?.()
    const code = "func?.()";
    const expected = StdLib.if(
      BooleanLib.neq(StdLib.var("func"), null),
      StdLib.apply(StdLib.var("func")),
      null,
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("nested optional call", () => {
    // a?.b()
    // Should use std.call_method to preserve `this` context
    const code = "a?.b()";
    const expected = StdLib.if(
      BooleanLib.neq(StdLib.var("a"), null),
      StdLib.callMethod(StdLib.var("a"), "b"),
      null,
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("optional method call with argument", () => {
    // a?.b(x)
    // Should use std.call_method with argument
    const code = "a?.b(x)";
    const expected = StdLib.if(
      BooleanLib.neq(StdLib.var("a"), null),
      StdLib.callMethod(StdLib.var("a"), "b", StdLib.var("x")),
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
    const keyTranspiled = StdLib.if(
      BooleanLib.neq(StdLib.var("b"), null),
      ObjectLib.objGet(StdLib.var("b"), "c"),
      null,
    );

    const expected = StdLib.if(
      BooleanLib.neq(StdLib.var("a"), null),
      ObjectLib.objGet(StdLib.var("a"), keyTranspiled),
      null,
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("mixed chain a.b?.c", () => {
    const code = "a.b?.c";
    const tmp = "__tmp_1";
    const expected = StdLib.seq(
      StdLib.let(tmp, ObjectLib.objGet(StdLib.var("a"), "b")),
      StdLib.if(
        BooleanLib.neq(StdLib.var(tmp), null),
        ObjectLib.objGet(StdLib.var(tmp), "c"),
        null,
      ),
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("mixed chain a?.b[c]", () => {
    const code = "a?.b[c]";
    const expected = StdLib.if(
      BooleanLib.neq(StdLib.var("a"), null),
      ObjectLib.objGet(ObjectLib.objGet(StdLib.var("a"), "b"), StdLib.var("c")),
      null,
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("mixed chain a.b?.[c]", () => {
    const code = "a.b?.[c]";
    const tmp = "__tmp_1";
    const expected = StdLib.seq(
      StdLib.let(tmp, ObjectLib.objGet(StdLib.var("a"), "b")),
      StdLib.if(
        BooleanLib.neq(StdLib.var(tmp), null),
        ObjectLib.objGet(StdLib.var(tmp), StdLib.var("c")),
        null,
      ),
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("mixed chain a?.[b].c", () => {
    const code = "a?.[b].c";
    const expected = StdLib.if(
      BooleanLib.neq(StdLib.var("a"), null),
      ObjectLib.objGet(ObjectLib.objGet(StdLib.var("a"), StdLib.var("b")), "c"),
      null,
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("mixed chain a[b]?.c", () => {
    const code = "a[b]?.c";
    const tmp = "__tmp_1";
    const expected = StdLib.seq(
      StdLib.let(tmp, ObjectLib.objGet(StdLib.var("a"), StdLib.var("b"))),
      StdLib.if(
        BooleanLib.neq(StdLib.var(tmp), null),
        ObjectLib.objGet(StdLib.var(tmp), "c"),
        null,
      ),
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("mixed chain a.b?.()", () => {
    // a.b?.()
    // Should fuse b and () into call_method
    const code = "a.b?.()";
    const expected = StdLib.if(
      BooleanLib.neq(StdLib.var("a"), null),
      StdLib.callMethod(StdLib.var("a"), "b"),
      null,
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("mixed chain a?.().c", () => {
    const code = "a?.().c";
    const expected = StdLib.if(
      BooleanLib.neq(StdLib.var("a"), null),
      ObjectLib.objGet(StdLib.apply(StdLib.var("a")), "c"),
      null,
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("mixed chain a()?.c", () => {
    const code = "a()?.c";
    const tmp = "__tmp_1";

    const expected = StdLib.seq(
      StdLib.let(tmp, StdLib.apply(StdLib.var("a"))),
      StdLib.if(
        BooleanLib.neq(StdLib.var(tmp), null),
        ObjectLib.objGet(StdLib.var(tmp), "c"),
        null,
      ),
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("nested arg a?.(b?.c)", () => {
    const code = "a?.(b?.c)";
    const arg = StdLib.if(
      BooleanLib.neq(StdLib.var("b"), null),
      ObjectLib.objGet(StdLib.var("b"), "c"),
      null,
    );
    const expected = StdLib.if(
      BooleanLib.neq(StdLib.var("a"), null),
      StdLib.apply(StdLib.var("a"), arg),
      null,
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("nested arg a?.[b.c]", () => {
    const code = "a?.[b.c]";
    const arg = ObjectLib.objGet(StdLib.var("b"), "c");
    const expected = StdLib.if(
      BooleanLib.neq(StdLib.var("a"), null),
      ObjectLib.objGet(StdLib.var("a"), arg),
      null,
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("nested arg a?.(b.c)", () => {
    const code = "a?.(b.c)";
    const arg = ObjectLib.objGet(StdLib.var("b"), "c");
    const expected = StdLib.if(
      BooleanLib.neq(StdLib.var("a"), null),
      StdLib.apply(StdLib.var("a"), arg),
      null,
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("nested arg a?.[b?.()]", () => {
    const code = "a?.[b?.()]";
    const arg = StdLib.if(
      BooleanLib.neq(StdLib.var("b"), null),
      StdLib.apply(StdLib.var("b")),
      null,
    );
    const expected = StdLib.if(
      BooleanLib.neq(StdLib.var("a"), null),
      ObjectLib.objGet(StdLib.var("a"), arg),
      null,
    );
    expect(transpile(code)).toEqual(expected);
  });

  test("nested arg a?.(b?.())", () => {
    const code = "a?.(b?.())";
    const arg = StdLib.if(
      BooleanLib.neq(StdLib.var("b"), null),
      StdLib.apply(StdLib.var("b")),
      null,
    );
    const expected = StdLib.if(
      BooleanLib.neq(StdLib.var("a"), null),
      StdLib.apply(StdLib.var("a"), arg),
      null,
    );
    expect(transpile(code)).toEqual(expected);
  });
});
