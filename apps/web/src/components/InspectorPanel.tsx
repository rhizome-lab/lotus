import { Show, For } from "solid-js";
import { gameStore } from "../store/game";

const ItemView = (props: { item: number }) => {
  const item = gameStore.state.entities.get(props.item)!;
  return (
    <Show when={item}>
      <div class="inspector-panel__item">
        <span
          onClick={() => gameStore.execute("look", [item["name"] as string])}
          class={`inspector-panel__item-link ${
            (item["adjectives"] as readonly string[])
              ?.map((a) => `attribute-${a.replace(/[: ]/g, "-")}`)
              .join(" ") || ""
          }`}
        >
          {item["name"] as string}
        </span>
        <Show when={(item["contents"] as readonly number[]).length > 0}>
          <div class="inspector-panel__item-contents">
            <For each={item["contents"] as readonly number[]}>
              {(sub) => <ItemView item={sub} />}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  );
};

export default function InspectorPanel() {
  const inspectedItem =
    gameStore.state.inspectedItem == null
      ? null!
      : gameStore.state.entities.get(gameStore.state.inspectedItem)!;
  return (
    <div class="inspector-panel">
      <Show
        when={inspectedItem}
        fallback={<div class="inspector-panel__empty">Select an item to inspect</div>}
      >
        <div class="inspector-panel__name">{inspectedItem["name"] as string}</div>
        <div class="inspector-panel__desc">{inspectedItem["description"] as string}</div>

        <Show when={(inspectedItem["contents"] as readonly number[]).length > 0}>
          <div class="inspector-panel__contents-label">Contains:</div>
          <For each={inspectedItem["contents"] as readonly number[]}>
            {(item) => <ItemView item={item} />}
          </For>
        </Show>
      </Show>
    </div>
  );
}
