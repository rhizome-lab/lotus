import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { gameStore } from "./store/game";
import { keybindsStore } from "./store/keybinds";
import { themeStore } from "./store/theme";
import GameLog from "./components/GameLog";
import Builder from "./components/Builder";
import Compass from "./components/Compass";
import CustomExits from "./components/CustomExits";
import RoomPanel from "./components/RoomPanel";
import InventoryPanel from "./components/InventoryPanel";
import InspectorPanel from "./components/InspectorPanel";
import { SettingsModal } from "./components/SettingsModal";
import { ThemeEditor } from "./components/ThemeEditor";
import "./index.css";

function App() {
  const [showBuilder, setShowBuilder] = createSignal(false);
  const [showSettings, setShowSettings] = createSignal(false);
  const [showThemeEditor, setShowThemeEditor] = createSignal(false);

  const handleKeyDown = (e: KeyboardEvent) => {
    // Ignore if typing in an input or textarea
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    const modifiers = [];
    if (e.ctrlKey) modifiers.push("Ctrl");
    if (e.altKey) modifiers.push("Alt");
    if (e.shiftKey) modifiers.push("Shift");
    if (e.metaKey) modifiers.push("Meta");

    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const fullKey = [...modifiers, key].join("+");

    const action = keybindsStore.getActionForKey(fullKey);
    if (action) {
      e.preventDefault();
      switch (action) {
        case "north":
          gameStore.execute(["move", "north"]);
          break;
        case "south":
          gameStore.execute(["move", "south"]);
          break;
        case "east":
          gameStore.execute(["move", "east"]);
          break;
        case "west":
          gameStore.execute(["move", "west"]);
          break;
        case "look":
          gameStore.execute(["look"]);
          break;
        case "inventory":
          gameStore.execute(["inventory"]);
          break;
      }
    }
  };

  onMount(() => {
    gameStore.connect();
    window.addEventListener("keydown", handleKeyDown);
  });

  onCleanup(() => {
    window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div class="app">
      <SettingsModal
        isOpen={showSettings()}
        onClose={() => setShowSettings(false)}
      />
      {/* Custom CSS Injection */}
      <style>
        {themeStore.state.allowCustomCss && gameStore.state.room?.custom_css
          ? gameStore.state.room.custom_css
          : ""}
      </style>

      <Show when={showThemeEditor()}>
        <ThemeEditor onClose={() => setShowThemeEditor(false)} />
      </Show>

      <header class="app__header">
        <div class="app__title">Viwo</div>
        <div class="app__header-controls">
          <div
            class={`app__status ${
              gameStore.state.isConnected ? "app__status--online" : ""
            }`}
          >
            {gameStore.state.isConnected ? "ONLINE" : "OFFLINE"}
          </div>
          <button
            class="app__builder-btn"
            onClick={() => setShowThemeEditor(true)}
          >
            Theme
          </button>
          <button
            class={`app__builder-btn ${
              showBuilder() ? "app__builder-btn--active" : ""
            }`}
            onClick={() => setShowBuilder(!showBuilder())}
          >
            Builder
          </button>
          <button
            onClick={() => setShowSettings(true)}
            class="app__settings-btn"
            title="Settings"
          >
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

      {/* Room Area: Main View + Builder Overlay */}
      <div class="app__room">
        <RoomPanel />
        <Show when={showBuilder()}>
          <Builder />
        </Show>
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
