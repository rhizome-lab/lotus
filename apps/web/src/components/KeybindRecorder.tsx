import { createSignal, onCleanup, onMount } from "solid-js";
import { ActionType, keybindsStore } from "../store/keybinds";

interface Props {
  action: ActionType;
}

export const KeybindRecorder = (props: Props) => {
  const [isRecording, setIsRecording] = createSignal(false);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isRecording()) return;

    e.preventDefault();
    e.stopPropagation();

    // Ignore modifier keys alone
    if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;

    keybindsStore.setKey(props.action, e.key);
    setIsRecording(false);
  };

  const startRecording = () => {
    setIsRecording(true);
  };

  // Click outside to cancel
  const handleClickOutside = (e: MouseEvent) => {
    if (isRecording() && !(e.target as HTMLElement).closest(".keybind-recorder")) {
      setIsRecording(false);
    }
  };

  onMount(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("click", handleClickOutside);
  });

  onCleanup(() => {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("click", handleClickOutside);
  });

  return (
    <button
      class={`keybind-recorder ${isRecording() ? "keybind-recorder--recording" : ""}`}
      onClick={startRecording}
      title="Click to rebind"
    >
      {isRecording() ? "Press any key..." : keybindsStore.getKey(props.action)}
    </button>
  );
};
