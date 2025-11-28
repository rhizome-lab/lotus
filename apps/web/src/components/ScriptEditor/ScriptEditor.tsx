import { Component, createSignal } from "solid-js";
import { BlockPalette } from "./BlockPalette";
import { BlockNode } from "./BlockNode";
import { BLOCK_DEFINITIONS } from "./types";

export const ScriptEditor: Component = () => {
  // Initial script: ["seq"]
  const [script, setScript] = createSignal<any>(["seq"]);

  const updateNode = (path: number[], newNode: any) => {
    const newScript = JSON.parse(JSON.stringify(script()));
    let current = newScript;

    // Navigate to parent
    for (const segment of path.slice(0, -1)) {
      current = current[segment];
    }

    // Update child
    current[path[path.length - 1]!] = newNode;
    setScript(newScript);
  };

  const deleteNode = (path: number[]) => {
    const newScript = JSON.parse(JSON.stringify(script()));
    let current = newScript;

    // Navigate to parent
    for (const segment of path.slice(0, -1)) {
      current = current[segment];
    }

    const index = path[path.length - 1]!;

    // Check if parent is a sequence (array starting with "seq")
    // OR if we are at the root (which is implicitly a seq/array)
    // Actually, our root is ["seq", ...].
    // If current is an array, check its first element.
    const isSeq = Array.isArray(current) && current[0] === "seq";

    // If it's a sequence, we splice (remove).
    // If it's a fixed slot (e.g. "if" args), we replace with null.
    // Note: In "seq" blocks, children start at index 1.

    if (isSeq && index > 0) {
      current.splice(index, 1);
    } else {
      // It's a slot argument, set to null
      current[index] = null;
    }

    setScript(newScript);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const data = e.dataTransfer?.getData("application/json");
    if (!data) return;

    const { opcode } = JSON.parse(data);
    const def = BLOCK_DEFINITIONS.find((d) => d.opcode === opcode);
    if (!def) return;

    // Create new node structure based on definition
    let newNode: any = [opcode];
    if (def.slots) {
      def.slots.forEach((slot) => {
        newNode.push(slot.default !== undefined ? slot.default : null);
      });
    }

    // For now, just append to root seq
    const newScript = JSON.parse(JSON.stringify(script()));
    newScript.push(newNode);
    setScript(newScript);
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
  };

  return (
    <div class="script-editor">
      <BlockPalette />
      <div
        class="script-editor__workspace"
        onDrop={onDrop}
        onDragOver={onDragOver}
      >
        <div class="script-editor__canvas">
          <BlockNode
            node={script()}
            path={[]}
            onUpdate={updateNode}
            onDelete={deleteNode}
          />
        </div>
        <div class="script-editor__json-preview">
          <pre>{JSON.stringify(script())}</pre>
        </div>
      </div>
    </div>
  );
};
