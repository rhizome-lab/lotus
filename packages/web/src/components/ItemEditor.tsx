import { createSignal, For, createEffect } from "solid-js";
import { gameStore } from "../store/game";
import { ALL_ADJECTIVES } from "@viwo/shared/constants/adjectives";

export default function ItemEditor() {
  const [selectedItemId, setSelectedItemId] = createSignal<number | null>(null);
  const [description, setDescription] = createSignal("");
  const [selectedAdjectives, setSelectedAdjectives] = createSignal<string[]>(
    [],
  );
  const [adjInput, setAdjInput] = createSignal("");

  const flattenItems = (items: any[], prefix = ""): any[] => {
    let result: any[] = [];
    for (const item of items) {
      result.push({ ...item, displayName: `${prefix}${item.name}` });
      if (item.contents && item.contents.length > 0) {
        result = result.concat(
          flattenItems(item.contents, `${prefix}${item.name} > `),
        );
      }
    }
    return result;
  };

  const items = () => {
    const roomItems =
      gameStore.state.room?.contents.filter((c) => c.kind === "ITEM") || [];
    const inventoryItems = gameStore.state.inventory?.items || [];

    // We want to distinguish between room and inventory, but also flatten.
    // Let's flatten separately and tag them.

    const flatRoom = flattenItems(roomItems).map((i) => ({
      ...i,
      source: "(Room)",
    }));
    const flatInventory = flattenItems(inventoryItems).map((i) => ({
      ...i,
      source: "(Inventory)",
    }));

    return [...flatRoom, ...flatInventory];
  };

  const selectedItem = () => items().find((i) => i.id === selectedItemId());

  createEffect(() => {
    const item = selectedItem();
    if (item) {
      setDescription(""); // RichItem doesn't have description, would need to fetch or store it elsewhere.
      // Wait, RichItem has adjectives but not generic props bag.
      // Actually, looking at game.ts, RichItem has adjectives.
      // Description is usually sent in 'look' or 'room' but not always fully exposed in list.
      // However, we can set it blindly or fetch it.
      // For now, let's assume we can set it.
      setSelectedAdjectives(item.adjectives || []);
    }
  });

  const filteredAdjectives = () => {
    const input = adjInput().toLowerCase();
    if (!input) return [];
    return ALL_ADJECTIVES.filter(
      (adj) => adj.includes(input) && !selectedAdjectives().includes(adj),
    ).slice(0, 5);
  };

  const addAdjective = (adj: string) => {
    setSelectedAdjectives([...selectedAdjectives(), adj]);
    setAdjInput("");
  };

  const removeAdjective = (adj: string) => {
    setSelectedAdjectives(selectedAdjectives().filter((a) => a !== adj));
  };

  const handleSave = (e: Event) => {
    e.preventDefault();
    const item = selectedItem();
    if (!item) return;

    if (description()) {
      gameStore.send(["set", item.name, "description", description()]);
    }

    gameStore.send([
      "set",
      item.name,
      "adjectives",
      JSON.stringify(selectedAdjectives()),
    ]);
  };

  return (
    <div class="builder__panel">
      <div class="builder__title">EDIT ITEM</div>
      <div class="builder__form">
        <select
          class="builder__input"
          onChange={(e) => setSelectedItemId(Number(e.currentTarget.value))}
          value={selectedItemId() || ""}
        >
          <option value="" disabled>
            Select an item...
          </option>
          <For each={items()}>
            {(item) => (
              <option value={item.id}>
                {item.displayName} {item.source}
              </option>
            )}
          </For>
        </select>

        {selectedItemId() && (
          <>
            <input
              type="text"
              placeholder="Description"
              value={description()}
              onInput={(e) => setDescription(e.currentTarget.value)}
              class="builder__input"
            />

            <div class="builder__row builder__row--column">
              <div class="builder__tags">
                <For each={selectedAdjectives()}>
                  {(adj) => (
                    <span
                      class="builder__tag"
                      onClick={() => removeAdjective(adj)}
                      title="Click to remove"
                    >
                      {adj} ×
                    </span>
                  )}
                </For>
              </div>
              <div class="builder__autocomplete-wrapper">
                <input
                  type="text"
                  placeholder="Add Adjective (e.g. color:red)"
                  value={adjInput()}
                  onInput={(e) => setAdjInput(e.currentTarget.value)}
                  class="builder__input"
                />
                {filteredAdjectives().length > 0 && (
                  <div class="builder__autocomplete-dropdown">
                    <For each={filteredAdjectives()}>
                      {(adj) => (
                        <div
                          class="builder__autocomplete-item"
                          onClick={() => addAdjective(adj)}
                        >
                          {adj}
                        </div>
                      )}
                    </For>
                  </div>
                )}
              </div>
            </div>

            <div class="builder__actions">
              <button
                onClick={handleSave}
                class="builder__btn builder__btn--primary"
              >
                Save Changes
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
