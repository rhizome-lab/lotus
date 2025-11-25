import { createSignal, onMount, Show } from "solid-js";
import { gameStore } from "./store/game";
import GameLog from "./components/GameLog";
import Actions from "./components/Actions";
import Builder from "./components/Builder";
import Compass from "./components/Compass";
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
    <div
      style={{
        display: "grid",
        "grid-template-columns": "250px 1fr 250px",
        "grid-template-rows": "auto 1fr 200px",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
      }}
    >
      {/* Header / Status */}
      <div
        style={{
          "grid-column": "1 / -1",
          "background-color": "#111",
          "border-bottom": "1px solid #333",
          padding: "10px 20px",
          display: "flex",
          "justify-content": "space-between",
          "align-items": "center",
        }}
      >
        <div style={{ "font-weight": "bold", color: "var(--accent-color)" }}>
          VIWO
        </div>
        <div style={{ display: "flex", gap: "10px", "align-items": "center" }}>
          <button
            onClick={() => setShowBuilder(!showBuilder())}
            style={{
              background: showBuilder() ? "var(--accent-color)" : "#333",
              color: showBuilder() ? "#000" : "#fff",
              border: "none",
              padding: "4px 8px",
              "border-radius": "4px",
              cursor: "pointer",
              "font-size": "0.8em",
            }}
          >
            Builder Mode
          </button>
          <div
            style={{
              "font-size": "12px",
              color: gameStore.state.isConnected ? "#4f4" : "#f44",
            }}
          >
            {gameStore.state.isConnected ? "ONLINE" : "OFFLINE"}
          </div>
        </div>
      </div>

      {/* Left Sidebar (Log / History - Optional, or maybe Chat?) */}
      <div
        style={{
          "grid-row": "2 / 3",
          "grid-column": "1 / 2",
          "border-right": "1px solid #333",
          display: "flex",
          "flex-direction": "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "10px",
            "font-size": "0.9em",
            color: "#666",
            "border-bottom": "1px solid #333",
          }}
        >
          LOG
        </div>
        <GameLog />
      </div>

      {/* Center (Room View) */}
      <div
        style={{
          "grid-row": "2 / 3",
          "grid-column": "2 / 3",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <RoomPanel />
        <Show when={showBuilder()}>
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              "z-index": 10,
            }}
          >
            <Builder />
          </div>
        </Show>
      </div>

      {/* Right Sidebar (Inventory) */}
      <div
        style={{
          "grid-row": "2 / 3",
          "grid-column": "3 / 4",
          overflow: "hidden",
        }}
      >
        <InventoryPanel />
      </div>

      {/* Bottom Panel (Controls & Inspector) */}
      <div
        style={{
          "grid-row": "3 / 4",
          "grid-column": "1 / -1",
          "border-top": "1px solid #333",
          display: "flex",
          "background-color": "#111",
        }}
      >
        {/* Controls */}
        <div
          style={{
            padding: "20px",
            display: "flex",
            gap: "20px",
            "align-items": "center",
            "border-right": "1px solid #333",
          }}
        >
          <Compass />
          <Actions />
        </div>

        {/* Inspector */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <InspectorPanel />
        </div>
      </div>
    </div>
  );
}

export default App;
