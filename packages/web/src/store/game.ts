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
}

export interface RoomMessage {
  type: "room";
  name: string;
  description: string;
  contents: RichItem[];
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
}

interface GameState {
  isConnected: boolean;
  messages: GameMessage[];
  room: RoomMessage | null;
  inventory: InventoryMessage | null;
  inspectedItem: ItemMessage | null;
}

const [state, setState] = createStore<GameState>({
  isConnected: false,
  messages: [],
  room: null,
  inventory: null,
  inspectedItem: null,
});

let socket: WebSocket | null = null;

export const gameStore = {
  state,

  connect: () => {
    if (state.isConnected) return;

    socket = new WebSocket("ws://localhost:8080");

    socket.onopen = () => {
      setState("isConnected", true);
      // Initial fetch
      gameStore.send(["look"]);
      gameStore.send(["inventory"]);
    };

    socket.onclose = () => {
      setState("isConnected", false);
      gameStore.addMessage({
        type: "error",
        text: "Disconnected from server.",
      });
      socket = null;
    };

    socket.onmessage = (event) => {
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

  send: (payload: unknown[]) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    } else {
      console.error("Socket not connected");
    }
  },

  addMessage: (msg: GameMessage) => {
    setState("messages", (msgs) => [...msgs, msg]);
  },
};
