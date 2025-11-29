import { Show, For } from "solid-js";
import { gameStore, RichItem } from "../store/game";

const ItemView = (props: { item: RichItem }) => (
  <div class="inspector-panel__item">
    <span
      onClick={() => gameStore.execute(["look", props.item.name])}
      class={`inspector-panel__item-link ${
        props.item.props.adjectives
          ?.map((a) => `attribute-${a.replace(/[: ]/g, "-")}`)
          .join(" ") || ""
      }`}
    >
      {props.item.name}
    </span>
    <Show when={props.item.contents.length > 0}>
      <div class="inspector-panel__item-contents">
        <For each={props.item.contents}>{(sub) => <ItemView item={sub} />}</For>
      </div>
    </Show>
  </div>
);

export default function InspectorPanel() {
  return (
    <div class="inspector-panel">
      <Show
        when={gameStore.state.inspectedItem}
        fallback={
          <div class="inspector-panel__empty">Select an item to inspect</div>
        }
      >
        <div class="inspector-panel__name">
          {gameStore.state.inspectedItem!.name}
        </div>
        <div class="inspector-panel__desc">
          {gameStore.state.inspectedItem!.description}
        </div>

        <Show when={gameStore.state.inspectedItem!.contents.length > 0}>
          <div class="inspector-panel__contents-label">Contains:</div>
          <For each={gameStore.state.inspectedItem!.contents}>
            {(item) => <ItemView item={item} />}
          </For>
        </Show>
      </Show>
    </div>
  );
}
