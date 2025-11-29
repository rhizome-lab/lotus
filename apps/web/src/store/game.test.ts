/// <reference types="bun" />
import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { gameStore } from "./game";

// Capture instances
let mockSockets: MockWebSocket[] = [];

class MockWebSocket {
  static OPEN = 1;
  readyState = 1;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  send = mock((_data: string) => {});
  close = mock(() => {});

  constructor(_url: string) {
    mockSockets.push(this);
    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 0);
  }
}

Object.defineProperty(global, "WebSocket", {
  value: MockWebSocket,
});

describe("Game Store", () => {
  beforeEach(() => {
    mockSockets = [];
    // Reset store state if possible, but it's a singleton.
    // We might need to just rely on connect() check.
  });

  afterEach(() => {
    // Close all sockets to reset store state
    mockSockets.forEach((s) => {
      if (s.onclose) s.onclose();
    });
  });

  test("Initial state", () => {
    expect(gameStore.state.isConnected).toBe(false);
    expect(gameStore.state.messages).toBeArray();
  });

  test("Connect and Receive Message", async () => {
    gameStore.connect();

    // Wait for onopen
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(gameStore.state.isConnected).toBe(true);

    const socket = mockSockets[0];
    expect(socket).toBeDefined();

    // Simulate receiving a message
    if (socket?.onmessage) {
      socket.onmessage({
        data: JSON.stringify({
          type: "message",
          text: "Hello World",
        }),
      });
    }

    expect(gameStore.state.messages.length).toBeGreaterThan(0);
    const lastMsg =
      gameStore.state.messages[gameStore.state.messages.length - 1];
    if (lastMsg && lastMsg.type === "message") {
      expect(lastMsg.text).toBe("Hello World");
    }
  });

  test("Send Message", async () => {
    // Ensure connected
    if (!gameStore.state.isConnected) {
      gameStore.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const socket = mockSockets[0];
    gameStore.execute(["look"]);
    expect(socket?.send).toHaveBeenCalled();
    expect(socket?.send.mock.lastCall?.[0]).toContain(JSON.stringify(["look"]));
  });

  test("Handle Room Message", async () => {
    gameStore.connect();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const socket = mockSockets[0];

    const roomMsg = {
      type: "room",
      name: "Test Room",
      description: "A test room",
      contents: [],
    };

    if (socket?.onmessage) {
      socket.onmessage({ data: JSON.stringify(roomMsg) });
    }

    expect(gameStore.state.room).toEqual(roomMsg as any);
  });

  test("Handle Inventory Message", async () => {
    gameStore.connect();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const socket = mockSockets[0];

    const invMsg = {
      type: "inventory",
      items: [],
    };

    if (socket?.onmessage) {
      socket.onmessage({ data: JSON.stringify(invMsg) });
    }

    expect(gameStore.state.inventory).toEqual(invMsg as any);
  });

  test("Handle Item Message", async () => {
    gameStore.connect();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const socket = mockSockets[0];

    const itemMsg = {
      type: "item",
      name: "Sword",
      description: "Sharp",
      contents: [],
    };

    if (socket?.onmessage) {
      socket.onmessage({ data: JSON.stringify(itemMsg) });
    }

    expect(gameStore.state.inspectedItem).toEqual(itemMsg as any);
  });

  test("Handle Malformed Message", async () => {
    gameStore.connect();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const socket = mockSockets[0];

    // Mock console.error to keep output clean
    const originalError = console.error;
    console.error = mock(() => {});

    if (socket?.onmessage) {
      socket.onmessage({ data: "invalid json" });
    }

    expect(console.error).toHaveBeenCalled();
    console.error = originalError;
  });
});
