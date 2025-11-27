import { describe, test, expect, mock, beforeEach, spyOn } from "bun:test";

// Mock dependencies
const mockDb = {
  getActiveEntity: mock((): unknown => null),
  getDefaultEntity: mock((): unknown => null),
  setDefaultEntity: mock(() => {}),
  setActiveEntity: mock(() => {}),
  get: mock(() => {}),
  run: mock(() => {}),
};

// Mock config to prevent invalid URL error if socket.ts loads
mock.module("./config", () => ({
  CONFIG: { CORE_URL: "ws://localhost:8080", DB_PATH: ":memory:" },
}));

// Mock ws to prevent actual connection attempts
mock.module("ws", () => ({
  default: class MockWebSocket {
    on = mock(() => {});
    send = mock(() => {});
    close = mock(() => {});
  },
}));

mock.module("./db", () => ({ db: mockDb }));

// Import real socketManager (now safe as it doesn't auto-connect)
import { socketManager } from "./socket";

// Mock system socket
const mockSystemSocket = {
  send: mock(() => {}),
  on: mock((event: string, handler: Function) => {
    // Default behavior: Simulate immediate response for create_player
    if (event === "message") {
      handler({ type: "player_created", name: "NewPlayer", id: 999 });
    }
  }),
  off: mock(() => {}),
  connect: mock(() => {}),
} as any;

// Spy on getSystemSocket
spyOn(socketManager, "getSystemSocket").mockReturnValue(mockSystemSocket);

// Also mock getSocket
const mockPlayerSocket = {
  send: mock(() => {}),
  on: mock(() => {}),
  connect: mock(() => {}),
} as any;
spyOn(socketManager, "getSocket").mockReturnValue(mockPlayerSocket);

// import { sessionManager } from "./session";
let sessionManager: any;

describe("Session Manager", () => {
  beforeEach(async () => {
    mockDb.getActiveEntity.mockClear();
    mockDb.getDefaultEntity.mockClear();
    mockDb.setDefaultEntity.mockClear();
    mockDb.setActiveEntity.mockClear();
    mockDb.get.mockClear();
    mockDb.run.mockClear();
    mockSystemSocket.send.mockClear();
    mockPlayerSocket.send.mockClear();

    // Reset default mock implementation for system socket
    mockSystemSocket.on.mockImplementation(
      (event: string, handler: Function) => {
        if (event === "message") {
          console.log("Mock socket emitting message for NewPlayer");
          handler({ type: "player_created", name: "NewPlayer", id: 999 });
        }
      },
    );

    const module = await import("./session");
    sessionManager = module.sessionManager;
  });

  test("Existing Session", async () => {
    mockDb.getActiveEntity.mockReturnValue(123 as any);
    const id = await sessionManager.ensureSession("u1", "c1", "User");
    expect(id).toBe(123);
    expect(mockDb.getActiveEntity).toHaveBeenCalledWith("u1", "c1");
  });

  test("Default Entity", async () => {
    mockDb.getActiveEntity.mockReturnValue(null);
    mockDb.getDefaultEntity.mockReturnValue(456 as any);

    const id = await sessionManager.ensureSession("u1", "c1", "User");
    expect(id).toBe(456);
    expect(mockDb.setActiveEntity).toHaveBeenCalledWith("u1", "c1", 456);
  });

  test("Create New Player", async () => {
    mockDb.getActiveEntity.mockReturnValue(null);
    mockDb.getDefaultEntity.mockReturnValue(null);

    const id = await sessionManager.ensureSession("u1", "c1", "NewPlayer");
    expect(id).toBe(999); // From mock socket response
    expect(mockDb.setDefaultEntity).toHaveBeenCalledWith("u1", 999);
    expect(mockDb.setActiveEntity).toHaveBeenCalledWith("u1", "c1", 999);
  });

  test("Create New Player Timeout", async () => {
    mockDb.getActiveEntity.mockReturnValue(null);
    mockDb.getDefaultEntity.mockReturnValue(null);

    // Override socket mock to NOT respond
    mockSystemSocket.on.mockImplementation(() => {});

    // Mock setTimeout
    const originalSetTimeout = global.setTimeout;
    const mockSetTimeout = mock((cb, _ms) => {
      cb(); // Trigger immediately
      return 0 as any;
    });
    // @ts-expect-error
    global.setTimeout = mockSetTimeout;

    try {
      await sessionManager.ensureSession("u1", "c1", "TimeoutPlayer");
      expect(true).toBe(false); // Should not reach here
    } catch (e: any) {
      expect(e.message).toBe("Timeout creating player");
    } finally {
      global.setTimeout = originalSetTimeout;
    }
  });

  test("Create New Player Ignored Message", async () => {
    mockDb.getActiveEntity.mockReturnValue(null);
    mockDb.getDefaultEntity.mockReturnValue(null);

    // Override socket to send an ignored message first
    mockSystemSocket.on.mockImplementation(
      (event: string, handler: Function) => {
        if (event === "message") {
          // Send unrelated message
          handler({ type: "other_message" });
          // Then send correct message
          handler({ type: "player_created", name: "IgnoredPlayer", id: 777 });
        }
      },
    );

    const id = await sessionManager.ensureSession("u1", "c1", "IgnoredPlayer");
    expect(id).toBe(777);
  });
});
