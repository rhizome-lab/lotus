import { describe, test } from "bun:test";

type TestFunction = typeof test;

export function createLibraryTester(
  library: Record<string, any>,
  suiteName: string,
  fn: (testOp: TestFunction) => void,
) {
  describe(suiteName, () => {
    const coveredOpcodes = new Set<string>();
    const allOpcodes = Object.keys(library).filter((key) => {
      const val = library[key];
      return typeof val === "function" && "opcode" in val && "handler" in val && "metadata" in val;
    });

    const testOp: any = (name: string, ...args: any[]) => {
      // If the test name matches an opcode (or is an opcode name), mark it as covered

      // Find the opcode object for this test name
      let opcodeObj: any = null;
      if (name in library) {
        opcodeObj = library[name];
      } else {
        // Maybe name is the opcode string itself, find it in library
        const key = Object.keys(library).find((k) => library[k].opcode === name);
        if (key) opcodeObj = library[key];
      }

      if (opcodeObj) {
        // Mark ALL keys that point to this opcode object as covered
        allOpcodes.forEach((key) => {
          if (library[key] === opcodeObj) {
            coveredOpcodes.add(key);
          }
        });
        // Also mark by opcode name if needed, but we track by keys
      }

      return (test as any)(name, ...args);
    };

    // Copy properties from original test to testOp
    Object.assign(testOp, test);

    fn(testOp);

    test("coverage", () => {
      const missing = allOpcodes.filter((op) => !coveredOpcodes.has(op));
      if (missing.length > 0) {
        throw new Error(
          `Missing tests for opcodes: ${missing.join(", ")}\n` +
            `Ensure you have a test named exactly as the exported key or the opcode name.`,
        );
      }
    });
  });
}
