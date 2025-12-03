import {
  registerLibrary,
  getOpcodeMetadata,
  StdLib,
  MathLib,
  BooleanLib,
  ListLib,
  ObjectLib,
  StringLib,
  TimeLib,
  OpcodeDefinition,
} from "@viwo/scripting";
import { BlockDefinition } from "@viwo/web-editor";

// Simple output buffer
export const outputBuffer: string[] = [];
export const clearOutput = () => {
  outputBuffer.length = 0;
};
export const getOutput = () => outputBuffer.join("\n");

const log = (msg: string) => {
  outputBuffer.push(msg);
  console.log("[Playground]", msg);
};

// Register all standard libraries
registerLibrary(StdLib);
registerLibrary(MathLib);
registerLibrary(BooleanLib);
registerLibrary(ListLib);
registerLibrary(ObjectLib);
registerLibrary(StringLib);
registerLibrary(TimeLib);

// Custom log opcode to capture output
const customLog: OpcodeDefinition = {
  ...StdLib.log,
  handler: (args) => {
    // Join args with space
    const msg = args.map(String).join(" ");
    log(msg);
    return null;
  },
};

// Register custom log (overwrites StdLib.log)
registerLibrary({ log: customLog });

// Export opcodes for the editor
export const playgroundOpcodes: BlockDefinition[] = getOpcodeMetadata().map((meta) => ({
  ...meta,
  // Ensure type is compatible with BlockDefinition
  type: (meta.returnType as any) || "statement",
  category: meta.category as any,
}));
