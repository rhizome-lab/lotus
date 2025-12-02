import {
  evaluate,
  createScriptContext,
  registerLibrary,
  StdLib,
  MathLib,
  BooleanLib,
  compile,
} from "@viwo/scripting";

registerLibrary(StdLib);
registerLibrary(MathLib);
registerLibrary(BooleanLib);

const ITERATIONS = 1_000_000;

// A simple loop that sums numbers:
// (let sum 0)
// (let i 0)
// (while (< i ITERATIONS)
//   (seq
//     (set sum (+ sum i))
//     (set i (+ i 1))
//   )
// )
// sum

const script = StdLib.seq(
  StdLib.let("sum", 0),
  StdLib.let("i", 0),
  StdLib.while(
    BooleanLib["<"](StdLib.var("i"), ITERATIONS),
    StdLib.seq(
      StdLib.set("sum", MathLib["+"](StdLib.var("sum"), StdLib.var("i"))),
      StdLib.set("i", MathLib["+"](StdLib.var("i"), 1)),
    ),
  ),
  StdLib.var("sum"),
);

console.log(`Benchmarking loop with ${ITERATIONS} iterations...`);

// 1. Interpreter
const ctx1 = createScriptContext({
  this: null!,
  caller: null!,
  args: [],
  gas: ITERATIONS * 100,
});
const startInterp = performance.now();
evaluate(script, ctx1);
const endInterp = performance.now();
const timeInterp = endInterp - startInterp;
console.log(`Interpreter: ${timeInterp.toFixed(2)}ms`);

// 2. Compiler
const ctx2 = createScriptContext({
  this: null!,
  caller: null!,
  args: [],
  gas: ITERATIONS * 100,
});
const startCompile = performance.now();
const compiledFn = compile(script);
const endCompile = performance.now();
const compileTime = endCompile - startCompile;
console.log(`Compilation time: ${compileTime.toFixed(2)}ms`);

const startExec = performance.now();
compiledFn(ctx2);
const endExec = performance.now();
const timeExec = endExec - startExec;
console.log(`Compiled Execution: ${timeExec.toFixed(2)}ms`);

console.log(`Speedup (Exec only): ${(timeInterp / timeExec).toFixed(2)}x`);
console.log(
  `Speedup (Total): ${(timeInterp / (compileTime + timeExec)).toFixed(2)}x`,
);
