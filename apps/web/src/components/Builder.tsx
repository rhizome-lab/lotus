import { createSignal, Show, For } from "solid-js";
import { gameStore, Entity } from "../store/game";
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

  /* Script Fetching Logic */
  const [selectedEntityId, setSelectedEntityId] = createSignal<number | null>(null);
  const [verbName, setVerbName] = createSignal("interact"); // Default or empty

  // Helper to fetch entities (copied from ItemEditor for now)
  const items = (): Entity[] => {
    // Identify missing IDs
    const missingIds = new Set<number>();
    const checkAndAdd = (id: number) => {
      if (!gameStore.state.entities.has(id)) {
        missingIds.add(id);
      }
    };

    (gameStore.state.entities.get(gameStore.state.roomId!)?.["contents"] as number[])?.forEach(
      checkAndAdd,
    );
    (gameStore.state.entities.get(gameStore.state.playerId!)?.["contents"] as number[])?.forEach(
      checkAndAdd,
    );

    // Fetch missing entities
    if (missingIds.size > 0) {
      setTimeout(() => {
        gameStore.client.fetchEntities(Array.from(missingIds));
      }, 0);
    }

    // Return all entities in map for selection
    // (ItemEditor filtered to room/inventory, but for script editor we might want everything available?)
    // Let's stick to Room + Inventory + Player + Room itself for context
    const allIds = new Set<number>();
    if (gameStore.state.roomId) allIds.add(gameStore.state.roomId);
    if (gameStore.state.playerId) allIds.add(gameStore.state.playerId);

    (gameStore.state.entities.get(gameStore.state.roomId!)?.["contents"] as number[])?.forEach(
      (id) => allIds.add(id),
    );
    (gameStore.state.entities.get(gameStore.state.playerId!)?.["contents"] as number[])?.forEach(
      (id) => allIds.add(id),
    );

    return Array.from(allIds)
      .map((id) => gameStore.state.entities.get(id))
      .filter((e) => !!e);
  };

  const handleLoadScript = async () => {
    const eid = selectedEntityId();
    const vName = verbName();
    if (!eid || !vName) {
      alert("Please select an entity and enter a verb name.");
      return;
    }

    console.log(`Loading verb '${vName}' from entity ${eid}...`);
    try {
      const code = await gameStore.client.getVerb(eid, vName);
      setScriptCode(code);
    } catch (e: any) {
      console.error("Failed to load verb:", e);
      alert(`Failed to load verb: ${e.message}`);
      setScriptCode(`// Failed to load: ${e.message}`);
    }
  };

  const handleSaveScript = async () => {
    const code = scriptCode();
    const eid = selectedEntityId();
    const vName = verbName();

    // If we loaded a script, default to saving back to it.
    // But user might change selection.
    // Let's use current selection, but warn if it differs from loaded?
    // For simplicity, just use current selection.

    if (!eid || !vName) {
      alert("Please select an entity and enter a verb name to save to.");
      return;
    }

    try {
      await gameStore.client.updateVerb(eid, vName, code);
      alert(`Saved verb '${vName}' to entity ${eid}.`);
    } catch (e: any) {
      console.error("Failed to save verb:", e);
      alert(`Failed to save verb: ${e.message}`);
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
          <div
            class="builder__toolbar"
            style={{
              padding: "10px",
              margin: "10px",
              background: "#2a2a2a",
              "border-radius": "4px",
              display: "flex",
              gap: "10px",
              "align-items": "center",
            }}
          >
            <select
              class="builder__input"
              style={{ width: "200px", margin: 0 }}
              onChange={(e) => setSelectedEntityId(Number(e.currentTarget.value))}
              value={selectedEntityId() || ""}
            >
              <option value="" disabled>
                Select Entity...
              </option>
              <For each={items()}>
                {(item) => (
                  <option value={item.id}>
                    {item["name"] as string} ({item.id})
                  </option>
                )}
              </For>
            </select>
            <input
              type="text"
              class="builder__input"
              style={{ width: "150px", margin: 0 }}
              placeholder="Verb Name (e.g. interact)"
              value={verbName()}
              onInput={(e) => setVerbName(e.currentTarget.value)}
            />
            <button class="builder__btn" onClick={handleLoadScript}>
              Load
            </button>
            <button class="builder__btn builder__btn--primary" onClick={handleSaveScript}>
              Save
            </button>
          </div>
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
