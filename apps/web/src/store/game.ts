import { type GameState as ClientGameState, LotusClient } from "@lotus/client";
import type { Entity } from "@lotus/shared/jsonrpc";
import { createStore } from "solid-js/store";

export type { Entity };

interface WebGameState extends ClientGameState {
  inspectedItem: number | null;
}

const client = new LotusClient("ws://localhost:8080");

const [state, setState] = createStore<WebGameState>({
  entities: new Map(),
  inspectedItem: null,
  isConnected: false,
  messages: [],
  opcodes: null,
  playerId: null,
  roomId: null,
});

// Sync client state to Solid store
client.subscribe((newState) => {
  setState(newState);
});

export const gameStore = {
  client,
  connect: client.connect.bind(client),
  execute: client.execute.bind(client),
  state,
};
