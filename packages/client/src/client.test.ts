import { beforeEach, describe, expect, it, mock } from "bun:test";
import { LotusClient } from "./client";

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  onopen: () => void = () => {};
  onclose: () => void = () => {};
  onmessage: (event: any) => void = () => {};
  onerror: (err: any) => void = () => {};
  readyState = 1; // OPEN
  send = mock(() => {});
  close = mock(() => {});
}

globalThis.WebSocket = MockWebSocket as any;

describe("LotusClient", () => {
  let client: LotusClient;
  let ws: MockWebSocket;

  beforeEach(() => {
    client = new LotusClient();
    client.connect();
    ws = (client as any).socket;
  });

  it("should connect", () => {
    expect((client as any).socket).toBeInstanceOf(MockWebSocket);
  });

  it("should update state on connection", () => {
    // Mock sendRequest to prevent actual logic from running and creating dangling promises
    // We cast to any to overwrite the private/protected method if needed, or just public
    const originalSendRequest = client.sendRequest;
    client.sendRequest = mock(() => Promise.resolve());

    ws.onopen();
    expect(client.getState().isConnected).toBe(true);

    // Restore
    client.sendRequest = originalSendRequest;
  });

  it("should send requests", async () => {
    // Verify execute() sends data without full connection setup.

    const promise = client.execute("look", []);

    // Check if send was called
    expect(ws.send).toHaveBeenCalled();
    const sentData = JSON.parse((ws.send.mock.calls as any)[0][0]);
    expect(sentData.method).toBe("execute");
    expect(sentData.params).toEqual(["look"]);

    // Simulate response
    ws.onmessage({
      data: JSON.stringify({
        id: sentData.id,
        jsonrpc: "2.0",
        result: "You see a room.",
      }),
    });

    const result = await promise;
    expect(result).toBe("You see a room.");
  });

  it("should handle notifications", () => {
    // No need to call onopen, just test onmessage

    // Simulate update notification
    ws.onmessage({
      data: JSON.stringify({
        jsonrpc: "2.0",
        method: "update",
        params: {
          entities: [{ id: 1, name: "Room" }],
        },
      }),
    });

    expect(client.getState().entities.get(1)).toEqual({ id: 1, name: "Room" });
  });

  it("should notify listeners", () => {
    const listener = mock(() => {});
    client.subscribe(listener);

    // Listener should be called with initial state
    expect(listener).toHaveBeenCalled();

    // Simulate update
    ws.onmessage({
      data: JSON.stringify({
        jsonrpc: "2.0",
        method: "room_id",
        params: { roomId: 123 },
      }),
    });

    expect(listener).toHaveBeenCalledTimes(2); // Initial + Update
    expect(client.getState().roomId).toBe(123);
  });
});
