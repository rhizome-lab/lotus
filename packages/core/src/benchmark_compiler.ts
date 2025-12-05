import {
  evaluate,
  createScriptContext,
  registerLibrary,
  StdLib,
  MathLib,
  BooleanLib,
  compile,
  setTypechecking,
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
    BooleanLib.lt(StdLib.var("i"), ITERATIONS),
    StdLib.seq(
      StdLib.set("sum", MathLib.add(StdLib.var("sum"), StdLib.var("i"))),
      StdLib.set("i", MathLib.add(StdLib.var("i"), 1)),
    ),
  ),
  StdLib.return(StdLib.var("sum")),
);

const ctx2 = createScriptContext({
  this: null!,
  caller: null!,
  args: [],
  gas: ITERATIONS * 100,
});
const startCompile = performance.now();
const compiledFn = compile(script);
console.log(compiledFn + "");
const endCompile = performance.now();

console.log(`Benchmarking loop with ${ITERATIONS} iterations...`);

setTypechecking(false);
// 1. Interpreter
const ctx1 = createScriptContext({
  this: null!,
  caller: null!,
  args: [],
  gas: ITERATIONS * 100,
});
const startInterp = performance.now();
const result = await evaluate(script, ctx1);
const endInterp = performance.now();
const timeInterp = endInterp - startInterp;
console.log(`Interpreter: ${timeInterp.toFixed(2)}ms`);
console.log(`Result: ${result}`);

// 2. Compiler

const compileTime = endCompile - startCompile;
console.log(`Compilation time: ${compileTime.toFixed(2)}ms`);

const startExec = performance.now();
const result2 = compiledFn(ctx2);
const endExec = performance.now();
const timeExec = endExec - startExec;
console.log(`Compiled Execution: ${timeExec.toFixed(2)}ms`);
console.log(`Result: ${result2}`);

const startJs = performance.now();
let resultJs = 0;
(() => {
  let i = 0;
  while (i < ITERATIONS) {
    resultJs += i;
    i += 1;
  }
})();
const endJs = performance.now();
const timeJs = endJs - startJs;
console.log(`JS Execution: ${timeJs.toFixed(2)}ms`);
console.log(`Result: ${resultJs}`);

console.log(`Speedup (Exec only): ${(timeInterp / timeExec).toFixed(2)}x`);
console.log(`Speedup (Total): ${(timeInterp / (compileTime + timeExec)).toFixed(2)}x`);
console.log(`Slowdown vs native JS: ${(timeExec / timeJs).toFixed(2)}x`);
