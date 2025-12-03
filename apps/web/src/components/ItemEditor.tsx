import { createSignal, For, createEffect } from "solid-js";
import { gameStore, Entity } from "../store/game";
import { ALL_ADJECTIVES } from "@viwo/shared/constants/adjectives";

export default function ItemEditor() {
  const [selectedItemId, setSelectedItemId] = createSignal<number | null>(null);
  const [description, setDescription] = createSignal("");
  const [selectedAdjectives, setSelectedAdjectives] = createSignal<readonly string[]>([]);
  const [adjectiveInput, setAdjectiveInput] = createSignal("");

  const flattenItems = (items: readonly Entity[], prefix = ""): readonly Entity[] => {
    let result: Entity[] = [];
    for (const item of items) {
      result.push({ ...item, displayName: `${prefix}${item["name"]}` });
      if (item["contents"] && (item["contents"] as readonly number[]).length > 0) {
        result = result.concat(
          flattenItems(
            // TODO: Batch retrieve items.
            // @ts-expect-error
            item["contents"] as readonly number[],
            `${prefix}${item["name"]} > `,
          ),
        );
      }
    }
    return result;
  };

  const items: () => readonly Entity[] = () => {
    const roomItems = (
      (gameStore.state.entities.get(gameStore.state.roomId!)?.["contents"] as number[]) ?? []
    ).map((id) => gameStore.state.entities.get(id)!);
    const inventoryItems = (
      (gameStore.state.entities.get(gameStore.state.playerId!)?.["contents"] as number[]) ?? []
    ).map((id) => gameStore.state.entities.get(id)!);

    // We want to distinguish between room and inventory, but also flatten.
    // Let's flatten separately and tag them.

    const flatRoom = flattenItems(roomItems).map((i) => ({
      ...i,
      source: "Room",
    }));
    const flatInventory = flattenItems(inventoryItems).map((i) => ({
      ...i,
      source: "Inventory",
    }));

    return [...flatRoom, ...flatInventory];
  };

  const selectedItem = () => items().find((i) => i.id === selectedItemId());

  createEffect(() => {
    const item = selectedItem();
    if (item) {
      setDescription((item["description"] as string) ?? "");
      setSelectedAdjectives((item["adjectives"] as readonly string[]) ?? []);
    }
  });

  const filteredAdjectives = () => {
    const input = adjectiveInput().toLowerCase();
    if (!input) return [];
    return ALL_ADJECTIVES.filter(
      (adj) => adj.includes(input) && !selectedAdjectives().includes(adj),
    ).slice(0, 5);
  };

  const addAdjective = (adj: string) => {
    setSelectedAdjectives([...selectedAdjectives(), adj]);
    setAdjectiveInput("");
  };

  const removeAdjective = (adj: string) => {
    setSelectedAdjectives(selectedAdjectives().filter((a) => a !== adj));
  };

  const handleSave = (e: Event) => {
    e.preventDefault();
    const item = selectedItem();
    if (!item) return;

    if (description()) {
      gameStore.execute("set", [item["name"] as string, "description", description()]);
    }

    gameStore.execute("set", [item["name"] as string, "adjectives", selectedAdjectives()]);
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
                {item["displayName"] as string} ({item["source"] as string})
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
                  value={adjectiveInput()}
                  onInput={(e) => setAdjectiveInput(e.currentTarget.value)}
                  class="builder__input"
                />
                {filteredAdjectives().length > 0 && (
                  <div class="builder__autocomplete-dropdown">
                    <For each={filteredAdjectives()}>
                      {(adj) => (
                        <div class="builder__autocomplete-item" onClick={() => addAdjective(adj)}>
                          {adj}
                        </div>
                      )}
                    </For>
                  </div>
                )}
              </div>
            </div>

            <div class="builder__actions">
              <button onClick={handleSave} class="builder__btn builder__btn--primary">
                Save Changes
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
