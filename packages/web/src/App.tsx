import { createSignal, onMount, Show } from "solid-js";
import { gameStore } from "./store/game";
import GameLog from "./components/GameLog";
import Builder from "./components/Builder";
import Compass from "./components/Compass";
import CustomExits from "./components/CustomExits";
import RoomPanel from "./components/RoomPanel";
import InventoryPanel from "./components/InventoryPanel";
import InspectorPanel from "./components/InspectorPanel";
import "./index.css";

function App() {
  const [showBuilder, setShowBuilder] = createSignal(false);

  onMount(() => {
    gameStore.connect();
  });

  return (
    <div class="app">
      {/* Header / Status */}
      <div class="app__header">
        <div class="app__title">VIWO</div>
        <div class="app__header-controls">
          <button
            onClick={() => setShowBuilder(!showBuilder())}
            classList={{
              "app__builder-btn": true,
              "app__builder-btn--active": showBuilder(),
            }}
          >
            Builder Mode
          </button>
          <div
            classList={{
              app__status: true,
              "app__status--online": gameStore.state.isConnected,
            }}
          >
            {gameStore.state.isConnected ? "ONLINE" : "OFFLINE"}
          </div>
        </div>
      </div>

      {/* Left Sidebar (Log / History - Optional, or maybe Chat?) */}
      <div class="app__sidebar-left">
        <div class="app__sidebar-header">LOG</div>
        <GameLog />
        <CustomExits />
      </div>

      {/* Center (Room View) */}
      <div class="app__main">
        <RoomPanel />
        <Show when={showBuilder()}>
          <div class="app__builder-overlay">
            <Builder />
          </div>
        </Show>
      </div>

      {/* Right Sidebar (Inventory) */}
      <div class="app__sidebar-right">
        <InventoryPanel />
      </div>

      {/* Bottom Panel (Controls & Inspector) */}
      <div class="app__bottom">
        {/* Controls */}
        <div class="app__controls">
          <Compass />
        </div>

        {/* Inspector */}
        <div class="app__inspector">
          <InspectorPanel />
        </div>
      </div>
    </div>
  );
}

export default App;
