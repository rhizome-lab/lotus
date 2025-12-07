import {
  BooleanLib,
  ListLib,
  MathLib,
  ObjectLib,
  type ScriptContext,
  StdLib,
  StringLib,
  compile,
  createOpcodeRegistry,
  createScriptContext,
  evaluate,
} from "./index";
import { describe, expect, test } from "bun:test";

// Register libraries once
const TEST_OPS = createOpcodeRegistry(StdLib, MathLib, BooleanLib, ListLib, ObjectLib, StringLib);

function createTestContext(): ScriptContext {
  return createScriptContext({
    args: [],
    caller: { id: 200 } as any,
    gas: 10_000,
    ops: TEST_OPS,
    this: { id: 100 } as any,
  });
}

function checkParity(name: string, ast: any, ctxOverride?: Partial<ScriptContext>) {
  test(name, async () => {
    const ctx1 = { ...createTestContext(), ...ctxOverride };
    const ctx2 = { ...createTestContext(), ...ctxOverride };

    let errInterp, resInterp;
    try {
      resInterp = await evaluate(ast, ctx1);
    } catch (error) {
      errInterp = error;
    }

    let errCompile, resCompile;
    try {
      const compiledFn = compile(ast, TEST_OPS);
      resCompile = await compiledFn(ctx2);
    } catch (error) {
      errCompile = error;
    }

    if (errInterp) {
      console.log(errInterp);
      expect(errCompile).toBeDefined();
      // We might want to check error message parity too, but for now just existence
      // expect(errCompile.message).toBe(errInterp.message);
    } else {
      expect(errCompile).toBeUndefined();
      expect(resCompile).toEqual(resInterp);

      // Also check that they produced the same side effects on vars if any
      // Note: This requires the compiler to implement scoping correctly!
      expect(ctx2.vars).toEqual(ctx1.vars);
    }
  });
}

describe("Parity: Interpreter vs Compiler", () => {
  describe("Primitives", () => {
    checkParity("number", 123);
    checkParity("string", "hello");
    checkParity("boolean", true);
    checkParity("null", null);
    // Invalid because 1 is not an opcode
    checkParity("invalid opcode", [1, 2, 3]);
    checkParity("quoted list", StdLib.quote([1, 2, 3]));
  });

  describe("Numbers", () => {
    checkParity("std.int", StdLib.int("123"));
    checkParity("std.int radix", StdLib.int("101", 2));
    checkParity("std.float", StdLib.float("123.456"));
    checkParity("std.number", StdLib.number("123"));
    checkParity("std.number from bool", StdLib.number(true));
  });

  describe("Arithmetic", () => {
    checkParity("add", MathLib.add(1, 2));
    checkParity("sub", MathLib.sub(10, 2));
    checkParity("mul", MathLib.mul(3, 4));
    checkParity("div", MathLib.div(20, 5));
    checkParity("mod", MathLib.mod(10, 3));
    checkParity("pow", MathLib.pow(2, 3));
    checkParity("nested math", MathLib.add(MathLib.mul(2, 3), MathLib.sub(10, 4)));
  });

  describe("Logic", () => {
    checkParity("eq true", BooleanLib.eq(1, 1));
    checkParity("eq false", BooleanLib.eq(1, 2));
    checkParity("neq", BooleanLib.neq(1, 2));
    checkParity("lt", BooleanLib.lt(1, 2));
    checkParity("gt", BooleanLib.gt(2, 1));
    checkParity("lte", BooleanLib.lte(1, 1));
    checkParity("gte", BooleanLib.gte(1, 1));
    checkParity("and", BooleanLib.and(true, false));
    checkParity("or", BooleanLib.or(false, true));
    checkParity("not", BooleanLib.not(true));
  });

  describe("Control Flow", () => {
    checkParity("if true", StdLib.if(true, 10, 20));
    checkParity("if false", StdLib.if(false, 10, 20));
    checkParity("seq", StdLib.seq(1, 2, 3));

    checkParity(
      "while",
      StdLib.seq(
        StdLib.let("i", 0),
        StdLib.while(
          BooleanLib.lt(StdLib.var("i"), 3),
          StdLib.set("i", MathLib.add(StdLib.var("i"), 1)),
        ),
        StdLib.var("i"),
      ),
    );
  });

  describe("Variables", () => {
    checkParity("let/var", StdLib.seq(StdLib.let("x", 42), StdLib.var("x")));

    checkParity("set", StdLib.seq(StdLib.let("x", 1), StdLib.set("x", 2), StdLib.var("x")));
  });

  describe("Functions", () => {
    checkParity(
      "lambda apply",
      StdLib.apply(StdLib.lambda(["x"], MathLib.mul(StdLib.var("x"), 2)), 21),
    );

    checkParity(
      "lambda closure",
      StdLib.seq(
        StdLib.let("a", 10),
        StdLib.apply(StdLib.lambda(["x"], MathLib.add(StdLib.var("x"), StdLib.var("a"))), 5),
      ),
    );
  });

  describe("Objects", () => {
    checkParity("obj.new", ObjectLib.objNew(["a", 1], ["b", 2]));
    checkParity("obj.get", ObjectLib.objGet(ObjectLib.objNew(["a", 1]), "a"));
  });

  describe("Chained Expressions", () => {
    checkParity("chained add", MathLib.add(1, 2, 3, 4));
    checkParity("chained sub", MathLib.sub(10, 1, 2, 3));
    checkParity("chained mul", MathLib.mul(1, 2, 3, 4));
    checkParity("chained div", MathLib.div(24, 2, 3, 2));
    checkParity("chained pow", MathLib.pow(2, 3, 2)); // 2^3^2 = 64 (left associative)

    checkParity("chained and", BooleanLib.and(true, true, true));
    checkParity("chained and false", BooleanLib.and(true, false, true));
    checkParity("chained or", BooleanLib.or(false, false, true));
    checkParity("chained or false", BooleanLib.or(false, false, false));

    checkParity("chained lt", BooleanLib.lt(1, 2, 3));
    checkParity("chained gt", BooleanLib.gt(3, 2, 1));
    checkParity("chained lte", BooleanLib.lte(1, 2, 2, 3));
    checkParity("chained gte", BooleanLib.gte(3, 2, 2, 1));

    // Fail cases
    checkParity("chained lt fail", BooleanLib.lt(1, 3, 2));
  });

  describe("List Library", () => {
    checkParity("list.len", ListLib.listLen(ListLib.listNew(1, 2, 3)));
    checkParity("list.empty true", ListLib.listEmpty(ListLib.listNew()));
    checkParity("list.empty false", ListLib.listEmpty(ListLib.listNew(1)));
    checkParity("list.get", ListLib.listGet(ListLib.listNew(10, 20, 30), 1));
    checkParity(
      "list.set",
      StdLib.seq(
        StdLib.let("l", ListLib.listNew(1, 2, 3)),
        ListLib.listSet(StdLib.var("l"), 1, 99),
        StdLib.var("l"),
      ),
    );
    checkParity(
      "list.push",
      StdLib.seq(
        StdLib.let("l", ListLib.listNew(1, 2)),
        ListLib.listPush(StdLib.var("l"), 3),
        StdLib.var("l"),
      ),
    );
    checkParity(
      "list.pop",
      StdLib.seq(
        StdLib.let("l", ListLib.listNew(1, 2, 3)),
        StdLib.let("popped", ListLib.listPop(StdLib.var("l"))),
        ListLib.listNew(StdLib.var("popped"), StdLib.var("l")),
      ),
    );
    checkParity(
      "list.unshift",
      StdLib.seq(
        StdLib.let("l", ListLib.listNew(2, 3)),
        ListLib.listUnshift(StdLib.var("l"), 1),
        StdLib.var("l"),
      ),
    );
    checkParity(
      "list.shift",
      StdLib.seq(
        StdLib.let("l", ListLib.listNew(1, 2, 3)),
        StdLib.let("shifted", ListLib.listShift(StdLib.var("l"))),
        ListLib.listNew(StdLib.var("shifted"), StdLib.var("l")),
      ),
    );
    checkParity(
      "list.slice",
      StdLib.seq(
        StdLib.let("l", ListLib.listNew(1, 2, 3, 4, 5)),
        ListLib.listSlice(StdLib.var("l"), 1, 4),
      ),
    );
    checkParity(
      "list.splice",
      StdLib.seq(
        StdLib.let("l", ListLib.listNew(1, 2, 3, 4, 5)),
        ListLib.listSplice(StdLib.var("l"), 1, 2, 9, 10),
        StdLib.var("l"),
      ),
    );
    checkParity(
      "list.concat",
      ListLib.listConcat(ListLib.listNew(1, 2), ListLib.listNew(3, 4), ListLib.listNew(5)),
    );
    checkParity("list.includes true", ListLib.listIncludes(ListLib.listNew(1, 2, 3), 2));
    checkParity("list.includes false", ListLib.listIncludes(ListLib.listNew(1, 2, 3), 4));
    checkParity(
      "list.reverse",
      StdLib.seq(
        StdLib.let("l", ListLib.listNew(1, 2, 3)),
        ListLib.listReverse(StdLib.var("l")),
        StdLib.var("l"),
      ),
    );
    checkParity(
      "list.sort",
      StdLib.seq(
        StdLib.let("l", ListLib.listNew(3, 1, 2)),
        ListLib.listSort(StdLib.var("l")),
        StdLib.var("l"),
      ),
    );
  });

  describe("Object Library", () => {
    checkParity("obj.keys", ObjectLib.objKeys(ObjectLib.objNew(["a", 1], ["b", 2])));
    checkParity("obj.values", ObjectLib.objValues(ObjectLib.objNew(["a", 1], ["b", 2])));
    checkParity("obj.entries", ObjectLib.objEntries(ObjectLib.objNew(["a", 1], ["b", 2])));
    checkParity(
      "obj.merge",
      ObjectLib.objMerge(
        ObjectLib.objNew(["a", 1]),
        ObjectLib.objNew(["b", 2]),
        ObjectLib.objNew(["a", 3]), // Override
      ),
    );
  });

  describe("String Library", () => {
    checkParity("str.len", StringLib.strLen("hello"));
    checkParity("str.split", StringLib.strSplit("a-b-c", "-"));
    checkParity("str.slice", StringLib.strSlice("hello world", 0, 5));
    checkParity("str.upper", StringLib.strUpper("hello"));
    checkParity("str.lower", StringLib.strLower("HELLO"));
    checkParity("str.trim", StringLib.strTrim("  hello  "));
    checkParity("str.replace", StringLib.strReplace("hello world", "world", "viwo"));
    checkParity("str.includes true", StringLib.strIncludes("hello world", "world"));
    checkParity("str.includes false", StringLib.strIncludes("hello world", "viwo"));
    checkParity("str.join", StringLib.strJoin(ListLib.listNew("x", "y", "z"), ","));
  });
});
