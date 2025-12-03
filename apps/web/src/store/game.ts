import { createStore } from "solid-js/store";
import { ViwoClient, GameMessage, GameState as ClientGameState } from "@viwo/client";
import { Entity } from "@viwo/shared/jsonrpc";

export type { Entity, GameMessage };

interface WebGameState extends ClientGameState {
  inspectedItem: number | null;
}

const client = new ViwoClient("ws://localhost:8080");

const [state, setState] = createStore<WebGameState>({
  isConnected: false,
  messages: [],
  entities: new Map(),
  roomId: null,
  playerId: null,
  opcodes: null,
  inspectedItem: null,
});

// Sync client state to Solid store
client.subscribe((newState) => {
  setState(newState);
});

export const gameStore = {
  state,
  client, // Expose the client instance
  connect: client.connect.bind(client),
  execute: client.execute.bind(client),
};
