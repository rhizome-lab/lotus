import { Component } from "solid-js";
import { BlockPalette } from "./BlockPalette";
import { BlockNode } from "./BlockNode";
import { BlockDefinition } from "./types";
import { MonacoEditor } from "./MonacoEditor";
import { decompile, transpile } from "@viwo/scripting";

interface ScriptEditorProps {
  opcodes: BlockDefinition[];
  value: unknown;
  onChange: (value: any) => void;
  onAICompletion?: (
    code: string,
    position: { lineNumber: number; column: number },
  ) => Promise<string | null>;
}

export const ScriptEditor: Component<ScriptEditorProps> = (props) => {
  const updateNode = (path: number[], newNode: any) => {
    const newScript = structuredClone(props.value) as any;
    let current = newScript;

    // Navigate to parent
    for (const segment of path.slice(0, -1)) {
      current = current[segment];
    }

    // Update child
    current[path[path.length - 1]!] = newNode;
    props.onChange(newScript);
  };

  const deleteNode = (path: number[]) => {
    const newScript = structuredClone(props.value) as any;
    let current = newScript;

    // Navigate to parent
    for (const segment of path.slice(0, -1)) {
      current = current[segment];
    }

    const index = path[path.length - 1]!;

    // Check if parent is a sequence (array starting with "seq") or root.
    // In "seq" blocks, children start at index 1.
    const isSeq = Array.isArray(current) && current[0] === "seq";

    // If it's a sequence, we splice (remove).
    // If it's a fixed slot (e.g. "if" args), we replace with null.

    if (isSeq && index > 0) {
      current.splice(index, 1);
    } else {
      // It's a slot argument, set to null
      current[index] = null;
    }

    props.onChange(newScript);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const data = e.dataTransfer?.getData("application/json");
    if (!data) return;

    const { opcode } = JSON.parse(data);
    const opcodes = props.opcodes || [];
    const def = opcodes.find((d) => d.opcode === opcode);
    if (!def) return;

    // Create new node structure based on definition
    let newNode: any = [opcode];
    if (def.slots) {
      def.slots.forEach((slot) => {
        newNode.push(slot.default !== undefined ? slot.default : null);
      });
    }

    // For now, just append to root seq
    const newScript = structuredClone(props.value) as any;
    newScript.push(newNode);
    props.onChange(newScript);
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
  };

  const handleCodeChange = (newCode: string) => {
    try {
      const newScript = transpile(newCode);
      // Only update if we got a valid script back
      if (newScript) {
        props.onChange(newScript);
      }
    } catch {
      // Ignore transpilation errors while typing
    }
  };

  return (
    <div class="script-editor">
      <div class="script-editor__palette">
        <BlockPalette opcodes={props.opcodes} />
      </div>
      <div class="script-editor__workspace-container">
        <div
          class="script-editor__workspace"
          style={{ "flex-direction": "row" }}
          onDrop={onDrop}
          onDragOver={onDragOver}
        >
          <div
            class="script-editor__canvas"
            style={{ flex: 1, "border-right": "1px solid var(--border-color)" }}
          >
            <BlockNode
              node={props.value}
              path={[]}
              opcodes={props.opcodes}
              onUpdate={updateNode}
              onDelete={deleteNode}
            />
          </div>
          <div
            class="script-editor__code-preview"
            style={{ flex: 1, height: "100%", overflow: "hidden" }}
          >
            <MonacoEditor
              value={decompile(props.value, 0, true)}
              onChange={handleCodeChange}
              opcodes={props.opcodes}
              onAICompletion={props.onAICompletion!}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
