import { For, Show } from "solid-js";
import { ACTION_LABELS, ActionType, keybindsStore } from "../store/keybinds";
import { KeybindRecorder } from "./KeybindRecorder";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal = (props: Props) => {
  return (
    <Show when={props.isOpen}>
      <div class="settings-modal-overlay" onClick={props.onClose}>
        <div class="settings-modal" onClick={(e) => e.stopPropagation()}>
          <div class="settings-modal__header">
            <h2>Settings</h2>
            <button class="settings-modal__close" onClick={props.onClose}>
              ×
            </button>
          </div>
          <div class="settings-modal__content">
            <h3>Keybinds</h3>
            <div class="keybinds-list">
              <For each={Object.keys(ACTION_LABELS) as ActionType[]}>
                {(action) => (
                  <div class="keybind-row">
                    <span class="keybind-label">{ACTION_LABELS[action]}</span>
                    <KeybindRecorder action={action} />
                  </div>
                )}
              </For>
            </div>
            <div class="settings-actions">
              <button
                class="btn btn--secondary"
                onClick={() => keybindsStore.resetDefaults()}
              >
                Reset to Defaults
              </button>
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
};
