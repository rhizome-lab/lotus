import { Show, For } from "solid-js";
import { Entity, gameStore } from "../store/game";
import DigPanel from "./DigPanel";
import Popover from "./Popover";

const STANDARD_DIRS = [
  "north",
  "south",
  "east",
  "west",
  "northeast",
  "northwest",
  "southeast",
  "southwest",
];

export default function CustomExits() {
  const customExits = () => {
    const roomId = gameStore.state.roomId;
    if (!roomId) return [];
    const room = gameStore.state.entities.get(roomId);
    if (!room || !Array.isArray(room["exits"])) return [];

    return (room["exits"] as number[])
      .map((id) => gameStore.state.entities.get(id))
      .filter(
        (item) =>
          item &&
          !STANDARD_DIRS.includes((item["name"] as string).toLowerCase()),
      ) as Entity[];
  };

  return (
    <div class="custom-exits">
      <div class="custom-exits__header">
        <span>Custom Exits</span>
        <Popover
          contentClass="compass__popover"
          trigger={(triggerProps) => (
            <button
              class="compass__add-btn"
              onClick={triggerProps.onClick}
              title="Add Custom Exit"
            >
              +
            </button>
          )}
        >
          {(popoverProps) => (
            <div class="compass__builder-wrapper">
              <DigPanel variant="custom" onClose={popoverProps.close} />
            </div>
          )}
        </Popover>
      </div>
      <div class="custom-exits__list">
        <For each={customExits()}>
          {(exit) => (
            <div
              class="custom-exits__item"
              onClick={() =>
                gameStore.execute("move", [exit["name"] as string])
              }
            >
              <span class="custom-exits__name">{exit["name"] as string}</span>
              <Show when={exit["destination_name"] as string}>
                <span class="custom-exits__dest">
                  &rarr; {exit["destination_name"] as string}
                </span>
              </Show>
            </div>
          )}
        </For>
        <Show when={customExits().length === 0}>
          <div class="custom-exits__empty">No custom exits</div>
        </Show>
      </div>
    </div>
  );
}
