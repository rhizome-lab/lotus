import { describe, test, expect, mock, beforeEach, spyOn, Mock } from "bun:test";

// Mock dependencies
const mockDb = {
  getActiveEntity: mock((): unknown => null),
  getDefaultEntity: mock((): unknown => null),
  setDefaultEntity: mock(() => {}),
  setActiveEntity: mock(() => {}),
  get: mock(() => {}),
  run: mock(() => {}),
};

mock.module("./db", () => ({ db: mockDb }));

// Import real socketManager
import { socketManager } from "./socket";
import { SessionManager } from "./session";

// Mock GameSockets

const mockPlayerSocket = {
  send: mock(() => {}),
  execute: mock(() => {}),
  on: mock(() => {}),
  off: mock(() => {}),
  connect: mock(() => {}),
} as any;

describe("Session Manager", () => {
  let sessionManager: SessionManager;

  beforeEach(async () => {
    mockDb.getActiveEntity.mockClear();
    mockDb.getDefaultEntity.mockClear();
    mockDb.setDefaultEntity.mockClear();
    mockDb.setActiveEntity.mockClear();
    mockDb.get.mockClear();
    mockDb.run.mockClear();

    // Reset socket mocks
    mockPlayerSocket.execute.mockClear();
    mockPlayerSocket.on.mockClear();
    mockPlayerSocket.off.mockClear();

    // Spy on socketManager methods
    if (!(socketManager.getSocket as Mock<typeof socketManager.getSocket>).mock) {
      spyOn(socketManager, "getSocket");
    }

    (socketManager.getSocket as any).mockReturnValue(mockPlayerSocket);

    // Default behavior for socket
    mockPlayerSocket.on.mockImplementation((event: string, _handler: Function) => {
      if (event === "message") {
        // no-op
      }
    });

    // We need to trigger the message handler when execute is called.
    mockPlayerSocket.execute.mockImplementation((cmd: string, args: any[]) => {
      if (cmd === "create_player") {
        const name = args[0];
        // Find the registered message handler
        // We need to capture it from the .on call
        const call = mockPlayerSocket.on.mock.calls.find((c: any) => c[0] === "message");
        if (call) {
          const handler = call[1];
          // Simulate async response
          setTimeout(() => {
            handler({ type: "player_created", name, id: 999 });
          }, 10);
        }
      }
    });

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
    expect(id).toBe(999);
    expect(mockDb.setDefaultEntity).toHaveBeenCalledWith("u1", 999);
    expect(mockDb.setActiveEntity).toHaveBeenCalledWith("u1", "c1", 999);
  });

  test("Create New Player Timeout", async () => {
    mockDb.getActiveEntity.mockReturnValue(null);
    mockDb.getDefaultEntity.mockReturnValue(null);

    // Override execute to NOT trigger response
    mockPlayerSocket.execute.mockImplementation(() => {});

    // Mock setTimeout to trigger immediately
    const originalSetTimeout = global.setTimeout;
    // @ts-expect-error
    global.setTimeout = (cb: Function, ms: number) => {
      if (ms > 1000) {
        cb();
        return 0;
      }
      return originalSetTimeout(cb, ms);
    };

    try {
      await sessionManager.ensureSession("u1", "c1", "TimeoutPlayer");
      expect(true).toBe(false); // Should not reach here
    } catch (e: any) {
      expect(e.message).toBe("Timeout creating player");
    } finally {
      global.setTimeout = originalSetTimeout;
    }
  });
});
