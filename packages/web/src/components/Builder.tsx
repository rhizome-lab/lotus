import { createSignal, Show } from "solid-js";
import { gameStore } from "../store/game";

interface BuilderProps {
  initialDirection?: string;
  isLocked?: boolean;
  hideDirection?: boolean;
  onClose?: () => void;
}

export default function Builder(props: BuilderProps) {
  const [direction, setDirection] = createSignal(props.initialDirection || "");
  const [mode, setMode] = createSignal<"new" | "existing">("new");
  const [roomName, setRoomName] = createSignal("");
  const [targetRoom, setTargetRoom] = createSignal("");
  const [description, setDescription] = createSignal("");

  // Reset state on mount (or when props change if we wanted, but mount is enough for popover)
  // Actually, since the component is remounted each time the popover opens (due to Show when={isOpen}),
  // the signals are re-initialized. So roomName("") above is correct.
  // BUT, if the component is kept alive, we might need to reset.
  // Given the Popover implementation uses Show when={isOpen}, it unmounts when closed.
  // So the state *should* reset automatically.
  // If the user says it's prefilled, maybe they mean the browser autocomplete?
  // Or maybe the Popover doesn't unmount?
  // Looking at Popover.tsx: <Show when={isOpen()}> ... </Show>
  // It definitely unmounts.
  // I'll add autocomplete="off" to inputs just in case.

  const handleDig = (e: Event) => {
    e.preventDefault();
    if (mode() === "new") {
      if (!roomName()) return;
      gameStore.send(["dig", direction(), roomName()]);
    } else {
      if (!targetRoom()) return;
      gameStore.send(["dig", direction(), targetRoom()]);
    }

    setRoomName("");
    setTargetRoom("");
    props.onClose?.();
  };

  const handleUpdateDesc = (e: Event) => {
    e.preventDefault();
    if (!description()) return;
    gameStore.send(["set", "here", "description", description()]);
    setDescription("");
  };

  return (
    <div class="builder">
      {/* Dig Panel */}
      <div class="builder__panel">
        <div class="builder__title">DIG ROOM</div>
        <form onSubmit={handleDig} class="builder__form">
          <Show when={!props.hideDirection}>
            <div class="builder__row">
              <input
                type="text"
                placeholder="Direction (e.g. north, up, portal)"
                value={direction()}
                onInput={(e) => setDirection(e.currentTarget.value)}
                class="builder__input"
                disabled={props.isLocked}
                autocomplete="off"
              />
            </div>
          </Show>

          <div
            class="builder__tabs"
            style={{ display: "flex", gap: "10px", "font-size": "0.9em" }}
          >
            <button
              type="button"
              onClick={() => setMode("new")}
              style={{
                "font-weight": mode() === "new" ? "bold" : "normal",
                "text-decoration": mode() === "new" ? "underline" : "none",
                background: "none",
                border: "none",
                color: "var(--text-primary)",
                cursor: "pointer",
                padding: "0",
              }}
            >
              New Room
            </button>
            <button
              type="button"
              onClick={() => setMode("existing")}
              style={{
                "font-weight": mode() === "existing" ? "bold" : "normal",
                "text-decoration": mode() === "existing" ? "underline" : "none",
                background: "none",
                border: "none",
                color: "var(--text-primary)",
                cursor: "pointer",
                padding: "0",
              }}
            >
              Existing Room
            </button>
          </div>

          <Show when={mode() === "new"}>
            <input
              type="text"
              placeholder="New Room Name"
              value={roomName()}
              onInput={(e) => setRoomName(e.currentTarget.value)}
              class="builder__input"
              autocomplete="off"
            />
          </Show>

          <Show when={mode() === "existing"}>
            <input
              type="text"
              placeholder="Target Room Name (exact match)"
              value={targetRoom()}
              onInput={(e) => setTargetRoom(e.currentTarget.value)}
              class="builder__input"
              autocomplete="off"
            />
          </Show>

          <div class="builder__actions">
            {props.onClose && (
              <button
                type="button"
                onClick={props.onClose}
                class="builder__btn"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              classList={{
                builder__btn: true,
                "builder__btn--primary": true,
              }}
            >
              Dig
            </button>
          </div>
        </form>
      </div>

      {/* Edit Panel (Only show if not in modal/popover mode) */}
      {!props.onClose && (
        <div
          classList={{
            builder__panel: true,
            "builder__panel--edit": true,
          }}
        >
          <div class="builder__title">EDIT DESCRIPTION</div>
          <form onSubmit={handleUpdateDesc} class="builder__row">
            <input
              type="text"
              placeholder="New description for current room..."
              value={description()}
              onInput={(e) => setDescription(e.currentTarget.value)}
              class="builder__input"
            />
            <button type="submit" class="builder__btn">
              Set
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
