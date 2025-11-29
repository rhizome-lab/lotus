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
          onClick={() => gameStore.lookAt(props.item.id)}
          class={`inventory-panel__item-link ${
            props.item.props.adjectives
              ?.map(
                (a) => `attribute-${a.replace(/:/g, "-").replace(/ /g, "-")}`,
              )
              .join(" ") || ""
          }`}
          style={{ "margin-left": hasContents() ? "0" : "20px" }}
        >
          {props.item.props.name}
        </span>
        <Show when={props.item.props.location_detail}>
          <span class="inventory-panel__item-detail">
            ({props.item.props.location_detail})
          </span>
        </Show>
        <Show when={props.item.verbs && props.item.verbs.length > 0}>
          <span class="inventory-panel__item-verbs">
            <For each={props.item.verbs}>
              {(verb) => (
                <button
                  class="inventory-panel__verb-btn"
                  onClick={() => gameStore.execute([verb, props.item.name])}
                >
                  {verb}
                </button>
              )}
            </For>
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
