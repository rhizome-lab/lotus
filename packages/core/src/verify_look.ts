import { startServer } from "./index";
import WebSocket from "ws";
import { db } from "./db";

// Start the server
const wss = startServer(8081);

const ws = new WebSocket("ws://localhost:8081");

ws.on("open", () => {
  console.log("Connected");

  // Login as Guest
  // First we need to find the Guest ID
  const guest = db
    .query("SELECT id FROM entities WHERE name = 'Guest'")
    .get() as { id: number };
  if (!guest) {
    console.error("Guest not found");
    process.exit(1);
  }

  ws.send(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "login",
      params: [guest.id],
      id: 1,
    }),
  );
});

ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  console.log("Received:", JSON.stringify(msg, null, 2));

  if (msg.id === 1) {
    // Login successful
    console.log("Logged in, sending look...");
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "execute",
        params: ["look"],
        id: 2,
      }),
    );
  } else if (msg.id === 2) {
    // Look result
    console.log("Look result received.");

    // Now send inventory
    console.log("Sending inventory...");
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "execute",
        params: ["inventory"],
        id: 3,
      }),
    );
  } else if (msg.id === 3) {
    // Inventory result
    console.log("Inventory result received.");

    // Check for dynamic props in the output
    // We expect to see "Dynamic Mood Ring" with resolved props if it's in the room or inventory?
    // Wait, Dynamic Mood Ring is in the Lobby (room).
    // So look result should contain it.

    console.log("Closing...");
    ws.close();
    wss.close();
    process.exit(0);
  } else if (msg.method === "message") {
    // Async message
    console.log("Async message:", msg.params.text);
  }
});
