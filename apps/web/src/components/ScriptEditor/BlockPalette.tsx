import { Component, For, createSignal } from "solid-js";
import { gameStore } from "../../store/game";
import { BlockDefinition } from "./types";

export const BlockPalette: Component = () => {
  const [search, setSearch] = createSignal("");

  const filteredBlocks = () => {
    const s = search().toLowerCase();
    const opcodes = (gameStore.state.opcodes || []) as BlockDefinition[];
    return opcodes.filter(
      (def) =>
        def.label.toLowerCase().includes(s) ||
        def.opcode.toLowerCase().includes(s) ||
        def.category.toLowerCase().includes(s),
    );
  };

  const onDragStart = (e: DragEvent, opcode: string) => {
    e.dataTransfer?.setData("application/json", JSON.stringify({ opcode }));
    e.dataTransfer!.effectAllowed = "copy";
  };

  return (
    <div class="block-palette">
      <div class="block-palette__search">
        <input
          type="text"
          placeholder="Search blocks..."
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
          class="block-palette__search-input"
        />
      </div>
      <div class="block-palette__list">
        <For each={filteredBlocks()}>
          {(def) => (
            <div
              class={`block-palette__item block-palette__item--${def.category}`}
              draggable={true}
              onDragStart={(e) => onDragStart(e, def.opcode)}
            >
              {def.label}
            </div>
          )}
        </For>
      </div>
    </div>
  );
};
