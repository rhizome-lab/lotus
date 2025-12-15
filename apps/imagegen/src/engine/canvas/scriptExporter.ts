import { type ScriptValue, decompile } from "@viwo/scripting";

/**
 * Export a ViwoScript as pretty-printed code.
 * Uses the decompiler to convert S-expressions to TypeScript-style syntax.
 */
export function exportAsViwoScript(script: ScriptValue<unknown>): void {
  // Decompile to TypeScript-style code
  const code = decompile(script);

  const blob = new Blob([code], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `canvas-script-${Date.now()}.viwo`;
  a.click();
  URL.revokeObjectURL(url);
}
