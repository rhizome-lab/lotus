import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from "bun:test";
import { ViwoClient } from "@viwo/client";

// Mock config
mock.module("./config", () => ({
  CONFIG: { CORE_URL: "ws://test-url" },
}));

// Import after mocks
import { GameSocket, SocketManager } from "./socket";

describe("GameSocket", () => {
  let connectSpy: any;
  let executeSpy: any;
  let sendRequestSpy: any;
  let disconnectSpy: any;
  let onMessageSpy: any;

  beforeEach(() => {
    // Spy on ViwoClient prototype methods
    connectSpy = spyOn(ViwoClient.prototype, "connect").mockImplementation(function (this: any) {
      // Capture the instance.
    });
    executeSpy = spyOn(ViwoClient.prototype, "execute").mockResolvedValue(undefined);
    sendRequestSpy = spyOn(ViwoClient.prototype, "sendRequest").mockResolvedValue(undefined);
    disconnectSpy = spyOn(ViwoClient.prototype, "disconnect").mockImplementation(() => {});

    // We need to capture the subscribe listener to simulate state changes
    // We need to capture the subscribe listener to simulate state changes
    spyOn(ViwoClient.prototype, "subscribe").mockImplementation((listener: any) => {
      // Immediately call with connected state for testing happy path
      listener({ isConnected: true });
      return () => true;
    });

    onMessageSpy = spyOn(ViwoClient.prototype, "onMessage").mockImplementation((_listener: any) => {
      // Use `mock.fn` behavior to capture calls.
      return () => true;
    });
  });

  afterEach(() => {
    mock.restore();
  });

  test("Connects and sends login", async () => {
    const socket = new GameSocket(123);
    socket.connect();

    expect(connectSpy).toHaveBeenCalled();
    // Login is sent via sendRequest inside subscribe callback
    expect(sendRequestSpy).toHaveBeenCalledWith("login", { entityId: 123 });
  });

  test("Queue messages when disconnected", async () => {
    // Restore execute spy to throw error
    executeSpy.mockRejectedValue(new Error("Socket not connected"));

    const socket = new GameSocket();
    expect(socket.execute("test", [])).rejects.toThrow("Socket not connected");
  });

  test("Handle messages", async () => {
    // We need to trigger onMessage listener.
    // We can capture it from the spy.
    let capturedListener: any;
    onMessageSpy.mockImplementation((listener: any) => {
      capturedListener = listener;
      return () => {};
    });

    const socket = new GameSocket(1);
    socket.connect();

    let received: any = null;
    socket.on("message", (msg) => {
      received = msg;
    });

    // Simulate incoming message
    expect(capturedListener).toBeDefined();
    capturedListener({ type: "message", text: "hello" });

    expect(received).toEqual({
      method: "message",
      params: { type: "info", text: "hello" },
    });
  });

  test("Handle close", async () => {
    const socket = new GameSocket(1);
    socket.connect();
    socket.close();

    expect(disconnectSpy).toHaveBeenCalled();
  });
});

describe("SocketManager", () => {
  test("Singleton behavior", () => {
    const manager = new SocketManager();
    const s1 = manager.getSocket();
    const s2 = manager.getSocket();
    expect(s1).toBe(s2);
  });

  test("Socket connection", () => {
    const manager = new SocketManager();
    const socket = manager.getSocket();
    expect(socket).toBeDefined();
    // We can't easily test connection without a real server, but we can check it exists
  });
});
