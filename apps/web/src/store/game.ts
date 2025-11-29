import { createStore } from "solid-js/store";

export type GameMessage =
  | { type: "message"; text: string }
  | { type: "error"; text: string }
  | RoomMessage
  | InventoryMessage
  | ItemMessage;

export interface RichItem {
  id: number;
  name: string;
  kind: string;
  location_detail: string | null;
  contents: RichItem[];
  destination_name?: string;
  adjectives?: string[];
  custom_css?: string;
  image?: string;
  verbs?: string[];
}

export interface RoomMessage {
  type: "room";
  name: string;
  description: string;
  contents: RichItem[];
  custom_css?: string;
  image?: string;
}

export interface InventoryMessage {
  type: "inventory";
  items: RichItem[];
}

export interface ItemMessage {
  type: "item";
  name: string;
  description: string;
  contents: RichItem[];
  custom_css?: string;
}

interface GameState {
  isConnected: boolean;
  messages: GameMessage[];
  room: RoomMessage | null;
  inventory: InventoryMessage | null;
  inspectedItem: ItemMessage | null;
  opcodes: any[] | null;
  socket: WebSocket | null;
}

const [state, setState] = createStore<GameState>({
  isConnected: false,
  messages: [],
  room: null,
  inventory: null,
  inspectedItem: null,
  opcodes: null,
  socket: null,
});

export const gameStore = {
  state,

  connect: () => {
    if (state.isConnected) return;

    state.socket = new WebSocket("ws://localhost:8080");

    state.socket.onopen = () => {
      setState("isConnected", true);
      // Initial fetch
      gameStore.send(["look"]);
      gameStore.send(["inventory"]);

      // Fetch opcodes
      state.socket?.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "get_opcodes",
          id: 1, // Static ID for now
          params: [],
        }),
      );
    };

    state.socket.onclose = () => {
      setState("isConnected", false);
      gameStore.addMessage({
        type: "error",
        text: "Disconnected from server.",
      });
      state.socket = null;
    };

    state.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Handle JSON-RPC Responses
        if (data.jsonrpc === "2.0") {
          if (data.result) {
            // Check if this is the opcode response
            // Ideally we should track IDs, but for now we can infer or just check structure
            if (
              Array.isArray(data.result) &&
              data.result.length > 0 &&
              data.result[0].opcode
            ) {
              setState("opcodes", data.result);
              return;
            }
            // Handle other RPC results if needed
          }
          // Handle RPC errors?
          return;
        }

        // Update specific state based on type
        if (data.type === "room") {
          setState("room", data);
        } else if (data.type === "inventory") {
          setState("inventory", data);
        } else if (data.type === "item") {
          setState("inspectedItem", data);
        }

        gameStore.addMessage(structuredClone(data));
      } catch (e) {
        console.error("Failed to parse message", e);
      }
    };
  },

  send: (command: readonly string[]) => {
    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
      const id = Date.now(); // Simple ID generation

      state.socket.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "execute",
          params: command,
          id,
        }),
      );
    } else {
      console.error("Socket not connected");
    }
  },

  addMessage: (msg: GameMessage) => {
    setState("messages", (msgs) => [...msgs, msg]);
  },
};
