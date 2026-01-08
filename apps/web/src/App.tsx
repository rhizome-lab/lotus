// oxlint-disable-next-line no-unassigned-import
import "@lotus/shared/index.css";
import { Show, createSignal, onCleanup, onMount } from "solid-js";
import Compass from "./components/Compass";
import CustomExits from "./components/CustomExits";
import GameLog from "./components/GameLog";
import InspectorPanel from "./components/InspectorPanel";
import InventoryPanel from "./components/InventoryPanel";
import RoomPanel from "./components/RoomPanel";
import { SettingsModal } from "./components/SettingsModal";
import { ThemeEditor } from "./components/ThemeEditor";
import { gameStore } from "./store/game";
import { keybindsStore } from "./store/keybinds";
import { themeStore } from "./store/theme";

function App() {
  const [showSettings, setShowSettings] = createSignal(false);
  const [showThemeEditor, setShowThemeEditor] = createSignal(false);

  const handleKeyDown = (event: KeyboardEvent) => {
    // Ignore if typing in an input or textarea
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    const modifiers = [];
    if (event.ctrlKey) {
      modifiers.push("Ctrl");
    }
    if (event.altKey) {
      modifiers.push("Alt");
    }
    if (event.shiftKey) {
      modifiers.push("Shift");
    }
    if (event.metaKey) {
      modifiers.push("Meta");
    }

    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const fullKey = [...modifiers, key].join("+");

    const action = keybindsStore.getActionForKey(fullKey);
    if (action) {
      event.preventDefault();
      switch (action) {
        case "north": {
          gameStore.execute("go", ["north"]);
          break;
        }
        case "south": {
          gameStore.execute("go", ["south"]);
          break;
        }
        case "east": {
          gameStore.execute("go", ["east"]);
          break;
        }
        case "west": {
          gameStore.execute("go", ["west"]);
          break;
        }
        case "look": {
          gameStore.execute("look", []);
          break;
        }
        case "inventory": {
          gameStore.execute("inventory", []);
          break;
        }
      }
    }
  };

  onMount(() => {
    gameStore.connect();
    globalThis.addEventListener("keydown", handleKeyDown);
  });

  onCleanup(() => {
    globalThis.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div class="app">
      <SettingsModal isOpen={showSettings()} onClose={() => setShowSettings(false)} />
      {/* Custom CSS Injection */}
      <style>
        {themeStore.state.allowCustomCss && gameStore.state.roomId
          ? ((gameStore.state.entities.get(gameStore.state.roomId)?.["custom_css"] as string) ?? "")
          : ""}
      </style>

      <Show when={showThemeEditor()}>
        <ThemeEditor onClose={() => setShowThemeEditor(false)} />
      </Show>

      <header class="app__header">
        <div class="app__title">Lotus</div>
        <div class="app__header-controls">
          <div class={`app__status ${gameStore.state.isConnected ? "app__status--online" : ""}`}>
            {gameStore.state.isConnected ? "ONLINE" : "OFFLINE"}
          </div>
          <button class="app__builder-btn" onClick={() => setShowThemeEditor(true)}>
            Theme
          </button>
          <button onClick={() => setShowSettings(true)} class="app__settings-btn" title="Settings">
            ⚙️
          </button>
        </div>
      </header>

      {/* Log Area: Log + Custom Exits */}
      <div class="app__log">
        <div class="app__sidebar-header">Log</div>
        <GameLog />
        <CustomExits />
      </div>

      {/* Room Area */}
      <div class="app__room">
        <RoomPanel />
      </div>

      {/* Inventory Area */}
      <div class="app__inventory">
        <div class="app__sidebar-header">Inventory</div>
        <InventoryPanel />
      </div>

      {/* Compass Area */}
      <div class="app__compass">
        <Compass />
      </div>

      {/* Inspector Area */}
      <div class="app__inspector">
        <div class="app__sidebar-header">Inspector</div>
        <InspectorPanel />
      </div>
    </div>
  );
}

export default App;
