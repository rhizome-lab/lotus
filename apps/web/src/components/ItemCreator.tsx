import { createSignal, For } from "solid-js";
import { gameStore } from "../store/game";
import { ALL_ADJECTIVES } from "@viwo/shared/constants/adjectives";

export default function ItemCreator(props: { onClose?: () => void }) {
  const [name, setName] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [selectedAdjectives, setSelectedAdjectives] = createSignal<string[]>(
    [],
  );
  const [adjInput, setAdjInput] = createSignal("");

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

  const handleCreate = (e: Event) => {
    e.preventDefault();
    if (!name()) return;

    const itemProps = {
      description: description(),
      adjectives: selectedAdjectives(),
    };

    gameStore.execute("create", [name(), JSON.stringify(itemProps)]);

    setName("");
    setDescription("");
    setSelectedAdjectives([]);
    props.onClose?.();
  };

  return (
    <div class="builder__panel">
      <div class="builder__title">CREATE ITEM</div>
      <form onSubmit={handleCreate} class="builder__form">
        <input
          type="text"
          placeholder="Item Name"
          value={name()}
          onInput={(e) => setName(e.currentTarget.value)}
          class="builder__input"
          required
        />
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
          <button type="submit" class="builder__btn builder__btn--primary">
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
