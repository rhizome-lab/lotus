import { StdLib, MathLib, BooleanLib } from "@viwo/scripting";

const HelloWorld = StdLib.seq(StdLib.log("Hello World"));

const Counter = StdLib.seq(
  StdLib["let"]("i", 0),
  StdLib["while"](
    BooleanLib["<"](StdLib["var"]("i"), 5),
    StdLib.seq(
      StdLib.log(StdLib["var"]("i")),
      StdLib.set("i", MathLib["+"](StdLib["var"]("i"), 1)),
    ),
  ),
);

const Fibonacci = StdLib.seq(
  StdLib["let"]("a", 0),
  StdLib["let"]("b", 1),
  StdLib.log(StdLib["var"]("a")),
  StdLib.log(StdLib["var"]("b")),
  StdLib["let"]("count", 0),
  StdLib["while"](
    BooleanLib["<"](StdLib["var"]("count"), 8),
    StdLib.seq(
      StdLib["let"]("temp", MathLib["+"](StdLib["var"]("a"), StdLib["var"]("b"))),
      StdLib.log(StdLib["var"]("temp")),
      StdLib.set("a", StdLib["var"]("b")),
      StdLib.set("b", StdLib["var"]("temp")),
      StdLib.set("count", MathLib["+"](StdLib["var"]("count"), 1)),
    ),
  ),
);

export const examples = {
  "Hello World": JSON.stringify(HelloWorld),
  Counter: JSON.stringify(Counter),
  Fibonacci: JSON.stringify(Fibonacci),
};
