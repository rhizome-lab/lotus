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
  responseResolveFunctions: Map<number, (value: any) => void>;
  isConnected: boolean;
  messages: GameMessage[];
  room: RoomMessage | null;
  inventory: InventoryMessage | null;
  inspectedItem: ItemMessage | null;
  opcodes: any[] | null;
  socket: WebSocket | null;
}

const [state, setState] = createStore<GameState>({
  responseResolveFunctions: new Map(),
  isConnected: false,
  messages: [],
  room: null,
  inventory: null,
  inspectedItem: null,
  opcodes: null,
  socket: null,
});

let idCounter = 1;

export const gameStore = {
  state,

  connect: () => {
    if (state.isConnected) return;

    const socket = new WebSocket("ws://localhost:8080");
    setState("socket", socket);

    socket.onopen = () => {
      setState("isConnected", true);
      // Initial fetch
      gameStore.send(["look"]).then((result) => {
        setState("room", result as any);
      });
      gameStore.send(["inventory"]).then((result) => {
        setState("inventory", result as any);
      });

      // Fetch opcodes
      socket?.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "get_opcodes",
          id: 0, // Static ID for now
          params: [],
        }),
      );
    };

    socket.onclose = () => {
      setState("isConnected", false);
      gameStore.addMessage({
        type: "error",
        text: "Disconnected from server.",
      });
      setState("socket", null);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Handle JSON-RPC Responses
        if (data.jsonrpc === "2.0") {
          if (data.result) {
            if (data.id) {
              const resolve = state.responseResolveFunctions.get(data.id);
              if (resolve) {
                resolve(data.result);
                state.responseResolveFunctions.delete(data.id);
              }
            }
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

        gameStore.addMessage(structuredClone(data));
      } catch (e) {
        console.error("Failed to parse message", e);
      }
    };
  },

  send: (command: readonly string[]) => {
    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
      const id = idCounter;
      idCounter += 1;

      state.socket.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "execute",
          params: command,
          id,
        }),
      );
      return new Promise((resolve) => {
        state.responseResolveFunctions.set(id, resolve);
      });
    } else {
      throw new Error("Socket not connected");
    }
  },

  addMessage: (msg: GameMessage) => {
    setState("messages", (msgs) => [...msgs, msg]);
  },
};
