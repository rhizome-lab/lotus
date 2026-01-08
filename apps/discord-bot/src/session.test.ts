import { type Mock, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

// Mock dependencies
const mockDb = {
  get: mock(() => {}),
  getActiveEntity: mock((): unknown => null),
  getDefaultEntity: mock((): unknown => null),
  run: mock(() => {}),
  setActiveEntity: mock(() => {}),
  setDefaultEntity: mock(() => {}),
};

mock.module("./instances", () => ({ db: mockDb }));

// Import real socketManager
// oxlint-disable-next-line first
import { socketManager } from "./socket";
// oxlint-disable-next-line first
import type { SessionManager } from "./session";

// Mock GameSockets

const mockPlayerSocket = {
  connect: mock(() => {}),
  execute: mock(() => {}),
  off: mock(() => {}),
  on: mock(() => {}),
  send: mock(() => {}),
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
    mockPlayerSocket.on.mockImplementation(
      (event: string, _handler: (...args: any[]) => unknown) => {
        if (event === "message") {
          // No-op
        }
      },
    );

    // We need to trigger the message handler when execute is called.
    mockPlayerSocket.execute.mockImplementation((cmd: string, args: any[]) => {
      if (cmd === "create_player") {
        const [name] = args;
        // Find the registered message handler
        // We need to capture it from the .on call
        const call = mockPlayerSocket.on.mock.calls.find((call: any) => call[0] === "message");
        if (call) {
          const [, handler] = call;
          // Simulate async response
          setTimeout(() => {
            handler({ id: 999, name, type: "player_created" });
          }, 10);
        }
      }
    });

    const module = await import("./session");
    ({ sessionManager } = module);
  });

  test("Existing Session", async () => {
    mockDb.getActiveEntity.mockReturnValue(123);
    const id = await sessionManager.ensureSession("u1", "c1", "User");
    expect(id).toBe(123);
    expect(mockDb.getActiveEntity).toHaveBeenCalledWith("u1", "c1");
  });

  test("Default Entity", async () => {
    mockDb.getActiveEntity.mockReturnValue(null);
    mockDb.getDefaultEntity.mockReturnValue(456);
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
    const originalSetTimeout = globalThis.setTimeout;
    // @ts-expect-error We do not need __promisify__.
    globalThis.setTimeout = (cb: (...args: any[]) => unknown, ms: number) => {
      if (ms > 1000) {
        cb();
        return 0;
      }
      return originalSetTimeout(cb, ms);
    };

    try {
      await sessionManager.ensureSession("u1", "c1", "TimeoutPlayer");
      expect(true).toBe(false); // Should not reach here
    } catch (error: any) {
      expect(error.message).toBe("Timeout creating player");
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });
});
