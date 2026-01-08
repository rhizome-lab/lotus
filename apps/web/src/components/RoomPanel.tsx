import { type Entity, gameStore } from "../store/game";
import { For, Show } from "solid-js";

const ItemView = (props: { item: Entity }) => (
  <div class="room-panel__item">
    <span
      onClick={() => gameStore.execute("look", [props.item["name"] as string])}
      class={`room-panel__item-link ${
        (props.item["adjectives"] as readonly string[])
          ?.map((adjective) => `attribute-${adjective.replaceAll(":", "-").replaceAll(" ", "-")}`)
          .join(" ") || ""
      }`}
    >
      {props.item["name"] as string}
    </span>
    <Show when={props.item["location_detail"] as string | undefined}>
      <span class="room-panel__item-detail">({props.item["location_detail"] as string})</span>
    </Show>
    <Show when={props.item["verbs"] && (props.item["verbs"] as string[]).length > 0}>
      <span class="room-panel__item-verbs">
        <For each={(props.item["verbs"] as string[]) ?? []}>
          {(verb) => (
            <button
              class="room-panel__verb-btn"
              onClick={() => gameStore.execute(verb, [props.item["name"] as string])}
            >
              {verb}
            </button>
          )}
        </For>
      </span>
    </Show>
  </div>
);

export default function RoomPanel() {
  const room = () => {
    const id = gameStore.state.roomId;
    return id ? gameStore.state.entities.get(id) : undefined;
  };

  const contents = () => {
    const roomValue = room();
    if (!roomValue || !Array.isArray(roomValue["contents"])) {
      return [];
    }
    return (roomValue["contents"] as number[])
      .map((id) => gameStore.state.entities.get(id))
      .filter((entity) => Boolean(entity));
  };

  const exits = () => {
    const roomValue = room();
    if (!roomValue || !Array.isArray(roomValue["exits"])) {
      return [];
    }
    return (roomValue["exits"] as number[])
      .map((id) => gameStore.state.entities.get(id))
      .filter((entity) => Boolean(entity));
  };

  return (
    <div class="room-panel">
      <Show when={room()} fallback={<div class="room-panel__empty">No room data</div>}>
        <div class="room-panel__header">
          <h2 class="room-panel__title">{room()?.["name"] as string}</h2>
        </div>
        <div class="room-panel__description">{room()?.["description"] as string}</div>

        {/* Exits */}
        <div class="room-panel__section">
          <div class="room-panel__section-title">Exits</div>
          <div class="room-panel__exits">
            <For each={exits()}>
              {(exit) => (
                <span
                  onClick={() => gameStore.execute("go", [exit["name"] as string])}
                  class="room-panel__exit-tag"
                >
                  {exit["name"] as string}
                </span>
              )}
            </For>
          </div>
        </div>

        {/* Items */}
        <div>
          <div class="room-panel__section-title">Contents</div>
          <For each={contents()}>{(item) => <ItemView item={item} />}</For>
        </div>
      </Show>

      {/* Custom CSS Injection */}
      <Show when={room()?.["custom_css"]}>
        <style>{room()?.["custom_css"] as string}</style>
      </Show>
    </div>
  );
}
