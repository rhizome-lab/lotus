import { For, Show, createSignal } from "solid-js";
import { gameStore, RichItem } from "../store/game";

const ItemView = (props: { item: RichItem }) => {
  const [isExpanded, setIsExpanded] = createSignal(false);
  const hasContents = () =>
    props.item.contents && props.item.contents.length > 0;

  return (
    <div class="inventory-panel__item-container">
      <div class="inventory-panel__item">
        <Show when={hasContents()}>
          <button
            class="inventory-panel__expand-btn"
            onClick={() => setIsExpanded(!isExpanded())}
          >
            {isExpanded() ? "▼" : "▶"}
          </button>
        </Show>
        <span
          onClick={() => gameStore.send(["look", props.item.name])}
          class={`inventory-panel__item-link ${
            props.item.adjectives
              ?.map((a) => `attribute-${a.replace(":", "-")}`)
              .join(" ") || ""
          }`}
          style={{ "margin-left": hasContents() ? "0" : "20px" }}
        >
          {props.item.name}
        </span>
        <Show when={props.item.location_detail}>
          <span class="inventory-panel__item-detail">
            ({props.item.location_detail})
          </span>
        </Show>
      </div>
      <Show when={isExpanded() && hasContents()}>
        <div class="inventory-panel__nested">
          <For each={props.item.contents}>
            {(child) => <ItemView item={child} />}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default function InventoryPanel() {
  return (
    <div class="inventory-panel">
      <Show when={gameStore.state.inventory}>
        <For each={gameStore.state.inventory!.items}>
          {(item) => <ItemView item={item} />}
        </For>
      </Show>
    </div>
  );
}
