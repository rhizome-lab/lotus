/**
 * Check that opcodes in the Rust codegen have associated tests.
 *
 * Extracts opcodes from crates/runtime/luajit/src/codegen/*.rs
 * and checks for test coverage in the test files.
 */

import { execSync } from "node:child_process";

const CODEGEN_DIR = "crates/runtime/luajit/src/codegen";
const TEST_FILES = [
  "crates/runtime/luajit/src/tests.rs",
];

// Extract opcodes from codegen match statements
function getDefinedOpcodes(): Set<string> {
  const output = execSync(
    `grep -ohE '"[a-z]+\\.[a-z_]+"' ${CODEGEN_DIR}/*.rs`,
    { encoding: "utf8" }
  );

  const opcodes = new Set<string>();
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) {
      // Remove quotes
      opcodes.add(trimmed.slice(1, -1));
    }
  }
  return opcodes;
}

// Get opcodes that appear in test files
function getTestedOpcodes(): Set<string> {
  const tested = new Set<string>();

  for (const testFile of TEST_FILES) {
    try {
      const output = execSync(
        `grep -ohE '"[a-z]+\\.[a-z_]+"' ${testFile}`,
        { encoding: "utf8" }
      );

      for (const line of output.split("\n")) {
        const trimmed = line.trim();
        if (trimmed) {
          tested.add(trimmed.slice(1, -1));
        }
      }
    } catch {
      // File doesn't exist or no matches
    }
  }

  // Also check inline tests in codegen files
  try {
    const output = execSync(
      `grep -A50 '#\\[test\\]' ${CODEGEN_DIR}/*.rs | grep -ohE '"[a-z]+\\.[a-z_]+"'`,
      { encoding: "utf8" }
    );

    for (const line of output.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) {
        tested.add(trimmed.slice(1, -1));
      }
    }
  } catch {
    // No matches
  }

  return tested;
}

function main() {
  console.log("Checking opcode test coverage...\n");

  const defined = getDefinedOpcodes();
  const tested = getTestedOpcodes();

  const untested: string[] = [];
  for (const op of defined) {
    if (!tested.has(op)) {
      untested.push(op);
    }
  }

  console.log(`Total opcodes: ${defined.size}`);
  console.log(`Tested opcodes: ${tested.size}`);
  console.log(`Untested opcodes: ${untested.length}`);

  if (untested.length > 0) {
    console.log("\nUntested opcodes:");
    // Group by library
    const byLib = new Map<string, string[]>();
    for (const op of untested.sort()) {
      const [lib] = op.split(".");
      if (!byLib.has(lib)) byLib.set(lib, []);
      byLib.get(lib)!.push(op);
    }

    for (const [lib, ops] of byLib) {
      console.log(`\n  ${lib}:`);
      for (const op of ops) {
        console.log(`    - ${op}`);
      }
    }

    // Don't fail - just report
    // Process.exit(1);
  } else {
    console.log("\n✅ All opcodes have test coverage!");
  }
}

main();
