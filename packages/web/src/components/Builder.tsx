import { createSignal } from "solid-js";
import { gameStore } from "../store/game";

export default function Builder() {
  const [direction, setDirection] = createSignal("north");
  const [roomName, setRoomName] = createSignal("");
  const [description, setDescription] = createSignal("");

  const handleDig = (e: Event) => {
    e.preventDefault();
    if (!roomName()) return;
    gameStore.send(["dig", direction(), roomName()]);
    setRoomName("");
  };

  const handleUpdateDesc = (e: Event) => {
    e.preventDefault();
    if (!description()) return;
    gameStore.send(["set", "here", "description", description()]);
    setDescription("");
  };

  return (
    <div
      style={{
        "background-color": "#1a1a1d",
        "border-top": "1px solid #333",
        padding: "10px",
        display: "flex",
        gap: "20px",
        "font-size": "12px",
      }}
    >
      {/* Dig Panel */}
      <div style={{ display: "flex", "flex-direction": "column", gap: "5px" }}>
        <div style={{ "font-weight": "bold", color: "#888" }}>DIG ROOM</div>
        <form onSubmit={handleDig} style={{ display: "flex", gap: "5px" }}>
          <select
            value={direction()}
            onInput={(e) => setDirection(e.currentTarget.value)}
            style={{
              background: "#333",
              color: "#fff",
              border: "none",
              padding: "4px",
            }}
          >
            <option value="north">North</option>
            <option value="south">South</option>
            <option value="east">East</option>
            <option value="west">West</option>
            <option value="up">Up</option>
            <option value="down">Down</option>
          </select>
          <input
            type="text"
            placeholder="Room Name"
            value={roomName()}
            onInput={(e) => setRoomName(e.currentTarget.value)}
            style={{
              background: "#333",
              color: "#fff",
              border: "none",
              padding: "4px",
            }}
          />
          <button type="submit" style={{ cursor: "pointer" }}>
            Dig
          </button>
        </form>
      </div>

      {/* Edit Panel */}
      <div
        style={{
          display: "flex",
          "flex-direction": "column",
          gap: "5px",
          flex: 1,
        }}
      >
        <div style={{ "font-weight": "bold", color: "#888" }}>
          EDIT DESCRIPTION
        </div>
        <form
          onSubmit={handleUpdateDesc}
          style={{ display: "flex", gap: "5px" }}
        >
          <input
            type="text"
            placeholder="New description for current room..."
            value={description()}
            onInput={(e) => setDescription(e.currentTarget.value)}
            style={{
              background: "#333",
              color: "#fff",
              border: "none",
              padding: "4px",
              flex: 1,
            }}
          />
          <button type="submit" style={{ cursor: "pointer" }}>
            Set
          </button>
        </form>
      </div>
    </div>
  );
}
