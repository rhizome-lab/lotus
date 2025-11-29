import { createSignal, Show, For } from "solid-js";
import { gameStore } from "../store/game";

interface DigPanelProps {
  initialDirection?: string;
  isLocked?: boolean;
  variant?: "default" | "compass" | "custom";
  onClose?: () => void;
}

export default function DigPanel(props: DigPanelProps) {
  const [direction, setDirection] = createSignal(props.initialDirection || "");
  const [mode, setMode] = createSignal<"new" | "existing">("new");
  const [roomName, setRoomName] = createSignal("");
  const [targetRoom, setTargetRoom] = createSignal("");

  const handleDig = (e: Event) => {
    e.preventDefault();
    if (mode() === "new") {
      if (!roomName()) return;
      gameStore.execute(["dig", direction(), roomName()]);
    } else {
      if (!targetRoom()) return;
      gameStore.execute(["dig", direction(), targetRoom()]);
    }

    setRoomName("");
    setTargetRoom("");
    props.onClose?.();
  };

  const showInput = () => props.variant !== "compass";
  const showCompassGrid = () =>
    props.variant === "default" || props.variant === undefined;

  return (
    <div class="builder__panel dig-panel">
      <div class="builder__title">DIG ROOM</div>
      <form onSubmit={handleDig} class="builder__form">
        <Show when={showInput()}>
          <div class="builder__row">
            <input
              type="text"
              placeholder={
                props.variant === "custom"
                  ? "Exit Name (e.g. portal, crack)"
                  : "Direction (e.g. north, up)"
              }
              value={direction()}
              onInput={(e) => setDirection(e.currentTarget.value)}
              class="builder__input"
              disabled={props.isLocked}
              autocomplete="off"
            />
          </div>
        </Show>

        <div class="builder__tabs">
          <button
            type="button"
            onClick={() => setMode("new")}
            class={`builder__tab ${
              mode() === "new" ? "builder__tab--active" : ""
            }`}
          >
            New Room
          </button>
          <button
            type="button"
            onClick={() => setMode("existing")}
            class={`builder__tab ${
              mode() === "existing" ? "builder__tab--active" : ""
            }`}
          >
            Existing Room
          </button>
        </div>

        <Show when={mode() === "new"}>
          <div class="builder__row">
            <input
              type="text"
              placeholder="New Room Name"
              value={roomName()}
              onInput={(e) => setRoomName(e.currentTarget.value)}
              class="builder__input builder__input--full"
              required
            />
          </div>
        </Show>

        <Show when={mode() === "existing"}>
          <div class="builder__row">
            <input
              type="text"
              placeholder="Target Room Name (exact match)"
              value={targetRoom()}
              onInput={(e) => setTargetRoom(e.currentTarget.value)}
              class="builder__input builder__input--full"
              autocomplete="off"
            />
          </div>
        </Show>

        <Show when={showCompassGrid()}>
          <div class="dig-panel__row">
            <div class="dig-panel__compass">
              <For
                each={["nw", "n", "ne", "w", "center", "e", "sw", "s", "se"]}
              >
                {(dir) => (
                  <div
                    class={`dig-panel__cell ${
                      dir === "center"
                        ? "dig-panel__cell--center"
                        : direction() === dir
                        ? "dig-panel__cell--active"
                        : ""
                    }`}
                    onClick={() => dir !== "center" && setDirection(dir)}
                  >
                    {dir === "center" ? "●" : dir.toUpperCase()}
                  </div>
                )}
              </For>
            </div>
            <div class="builder__row builder__row--column dig-panel__direction-wrapper">
              <div class="builder__title dig-panel__direction-label">
                DIRECTION
              </div>
              <div class="dig-panel__direction-value">
                {direction().toUpperCase()}
              </div>
            </div>
          </div>
        </Show>

        <div class="builder__actions">
          {props.onClose && (
            <button type="button" onClick={props.onClose} class="builder__btn">
              Cancel
            </button>
          )}
          <button type="submit" class="builder__btn builder__btn--primary">
            Dig
          </button>
        </div>
      </form>
    </div>
  );
}
