import { BooleanLib, ListLib, MathLib, ObjectLib, RandomLib, StdLib, StringLib, TimeLib } from ".";
import { describe, expect, test } from "bun:test";
import { compile } from "./compiler"; // Standard compile
import { optimize } from "./optimizer";

describe("Optimizer", () => {
  describe("Constant Folding", () => {
    test("folds arithmetic expressions", () => {
      const optimized = optimize(MathLib.add(1, 2), compile);
      expect(optimized).toEqual(3);
    });

    test("folds nested arithmetic expressions", () => {
      const optimized = optimize(MathLib.mul(MathLib.add(1, 2), 3), compile);
      expect(optimized).toEqual(9);
    });

    test("folds string concatenation", () => {
      const optimized = optimize(StringLib.strConcat("hello", " ", "world"), compile);
      expect(optimized).toEqual("hello world");
    });

    test("folds string join", () => {
      const optimized = optimize(
        StringLib.strJoin(ListLib.listNew("hello", "world"), " "),
        compile,
      );
      expect(optimized).toEqual("hello world");
    });

    test("folds comparison logic", () => {
      const optimized = optimize(BooleanLib.gt(5, 3), compile);
      expect(optimized).toEqual(true);
    });

    test("folds logical operations", () => {
      const optimized = optimize(BooleanLib.and(true, BooleanLib.not(false)), compile);
      expect(optimized).toEqual(true);
    });

    test("folds list creation (pure)", () => {
      const optimized = optimize(ListLib.listNew(1, 2, 3), compile);
      expect(optimized).toEqual(StdLib.quote([1, 2, 3]));
    });

    test("folds list operations (length)", () => {
      const optimized = optimize(ListLib.listLen(ListLib.listNew(1, 2, 3)), compile);
      expect(optimized).toEqual(3);
    });

    test("folds list operations (get)", () => {
      const optimized = optimize(ListLib.listGet(ListLib.listNew(10, 20), 1), compile);
      expect(optimized).toEqual(20);
    });

    test("folds object operations (get) - skipped for obj.new (syntax limitation)", () => {
      // obj.new uses raw arrays for pairs, which look like unknown opcodes to isPureSubtree
      const optimized = optimize(
        ObjectLib.objGet(ObjectLib.objNew(["key", "value"]), "key"),
        compile,
      );
      // Expect NO optimization for now
      expect(optimized).toEqual(ObjectLib.objGet(ObjectLib.objNew(["key", "value"]), "key"));
    });

    test("folds chained math", () => {
      const optimized = optimize(MathLib.floor(MathLib.sin(0)), compile);
      expect(optimized).toEqual(0);
    });
  });

  describe("Impure/Context Preservation", () => {
    test("does NOT fold std.var", () => {
      const optimized = optimize(MathLib.add(StdLib.var("x"), 1), compile);
      // Should remain partially optimized: (+ (std.var x) 1)
      expect(optimized).toEqual(MathLib.add(StdLib.var("x"), 1));
    });

    test("partially folds mixed expressions", () => {
      const optimized = optimize(MathLib.add(StdLib.var("x"), MathLib.add(1, 2)), compile);
      // ["+", ["std.var", "x"], 3]
      expect(optimized).toEqual(MathLib.add(StdLib.var("x"), 3));
    });

    test("does NOT fold random", () => {
      // random is excluded from PURE_OPS
      const optimized = optimize(RandomLib.between(1, 10), compile);
      expect(optimized).toEqual(RandomLib.between(1, 10));
    });

    test("does NOT fold impure time", () => {
      const optimized = optimize(TimeLib.timeNow(), compile);
      expect(optimized).toEqual(TimeLib.timeNow());
    });

    test("folds pure time operations", () => {
      const optimized = optimize(TimeLib.timeFromTimestamp(1_600_000_000_000), compile);
      expect(optimized).toEqual("2020-09-13T12:26:40.000Z");
    });
  });
});
