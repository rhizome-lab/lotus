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
  socket: WebSocket | null;
}

const [state, setState] = createStore<GameState>({
  isConnected: false,
  messages: [],
  room: null,
  inventory: null,
  inspectedItem: null,
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
