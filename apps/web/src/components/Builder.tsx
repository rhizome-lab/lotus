import { createSignal, Show } from "solid-js";
import { gameStore } from "../store/game";
import ItemCreator from "./ItemCreator";
import ItemEditor from "./ItemEditor";
import { ScriptEditor, MonacoEditor, BlockDefinition } from "@viwo/web-editor";

export default function Builder() {
  const [activeTab, setActiveTab] = createSignal<
    "room" | "create" | "edit" | "script" | "script-code"
  >("room");
  const [description, setDescription] = createSignal("");

  const handleUpdateDesc = (e: Event) => {
    e.preventDefault();
    if (!description()) return;
    gameStore.execute("set", ["here", "description", description()]);
    setDescription("");
  };

  const [scriptCode, setScriptCode] = createSignal("// Start typing your script here...\n\n");

  const handleAICompletion = async (
    code: string,
    position: { lineNumber: number; column: number },
  ) => {
    try {
      const completion = await gameStore.client.callPluginMethod("ai_completion", {
        code,
        position,
      });
      if (typeof completion === "string") {
        return completion;
      }
      return null;
    } catch (e) {
      console.error("AI Completion Failed:", e);
      return null;
    }
  };

  const [script, setScript] = createSignal<any>(["seq"]);

  return (
    <div class="builder">
      <div class="builder__tabs">
        <button
          onClick={() => setActiveTab("room")}
          class={`builder__tab ${activeTab() === "room" ? "builder__tab--active" : ""}`}
        >
          Room
        </button>
        <button
          onClick={() => setActiveTab("create")}
          class={`builder__tab ${activeTab() === "create" ? "builder__tab--active" : ""}`}
        >
          Create Item
        </button>
        <button
          onClick={() => setActiveTab("edit")}
          class={`builder__tab ${activeTab() === "edit" ? "builder__tab--active" : ""}`}
        >
          Edit Item
        </button>
        <button
          onClick={() => setActiveTab("script")}
          class={`builder__tab ${activeTab() === "script" ? "builder__tab--active" : ""}`}
        >
          Script (Blocks)
        </button>
        <button
          onClick={() => setActiveTab("script-code")}
          class={`builder__tab ${activeTab() === "script-code" ? "builder__tab--active" : ""}`}
        >
          Script (Code)
        </button>
      </div>

      <Show when={activeTab() === "room"}>
        <div class="builder__panel">
          <div class="builder__title">EDIT DESCRIPTION</div>
          <form onSubmit={handleUpdateDesc} class="builder__row">
            <input
              type="text"
              placeholder="New description for current room..."
              value={description()}
              onInput={(e) => setDescription(e.currentTarget.value)}
              class="builder__input"
            />
            <button type="submit" class="builder__btn">
              Set
            </button>
          </form>
        </div>
      </Show>

      <Show when={activeTab() === "create"}>
        <ItemCreator />
      </Show>

      <Show when={activeTab() === "edit"}>
        <ItemEditor />
      </Show>

      <Show when={activeTab() === "script"}>
        <div class="builder__script-panel">
          <ScriptEditor
            value={script()}
            onChange={setScript}
            opcodes={(gameStore.state.opcodes || []) as BlockDefinition[]}
            onAICompletion={handleAICompletion}
          />
        </div>
      </Show>

      <Show when={activeTab() === "script-code"}>
        <div class="builder__script-panel">
          <MonacoEditor
            value={scriptCode()}
            onChange={(val) => setScriptCode(val)}
            opcodes={(gameStore.state.opcodes || []) as BlockDefinition[]}
            onAICompletion={handleAICompletion}
          />
        </div>
      </Show>
    </div>
  );
}
