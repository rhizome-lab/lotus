import { onMount } from "solid-js";
import { gameStore } from "./store/game";
import GameLog from "./components/GameLog";
import Actions from "./components/Actions";
import Builder from "./components/Builder";
import "./index.css";

function App() {
  onMount(() => {
    gameStore.connect();
  });

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Sidebar (Future Inventory/Stats) */}
      <div
        style={{
          width: "250px",
          "background-color": "#151518",
          "border-right": "1px solid #333",
          padding: "20px",
          display: "flex",
          "flex-direction": "column",
        }}
      >
        <h2 style={{ "margin-top": 0, color: "var(--accent-color)" }}>VIWO</h2>
        <div
          style={{ "margin-top": "20px", "font-size": "12px", color: "#888" }}
        >
          STATUS: {gameStore.state.isConnected ? "ONLINE" : "OFFLINE"}
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", "flex-direction": "column" }}>
        <Actions />
        <GameLog />
        <Builder />
      </div>
    </div>
  );
}

export default App;
