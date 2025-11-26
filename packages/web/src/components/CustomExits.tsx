import { Show, For } from "solid-js";
import { gameStore } from "../store/game";
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
  const customExits = () =>
    gameStore.state.room?.contents.filter(
      (c) => c.kind === "EXIT" && !STANDARD_DIRS.includes(c.name.toLowerCase()),
    ) || [];

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
              onClick={() => gameStore.send(["move", exit.name])}
            >
              <span class="custom-exits__name">{exit.name}</span>
              <Show when={exit.destination_name}>
                <span class="custom-exits__dest">
                  &rarr; {exit.destination_name}
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
