import { describe, test, expect, beforeEach } from "bun:test";
import { DatabaseManager } from "./db";

describe("Discord Bot DB", () => {
  let db: DatabaseManager;

  beforeEach(() => {
    // Re-instantiate to get fresh memory DB
    db = new DatabaseManager();
  });

  test("Channel Maps", () => {
    db.setRoomForChannel("123", 10);
    expect(db.getRoomForChannel("123")).toBe(10);
    expect(db.getRoomForChannel("456")).toBeNull();
  });

  test("User Defaults", () => {
    db.setDefaultEntity("user1", 100);
    expect(db.getDefaultEntity("user1")).toBe(100);
    expect(db.getDefaultEntity("user2")).toBeNull();
  });

  test("Active Sessions", () => {
    db.setActiveEntity("user1", "chan1", 200);
    expect(db.getActiveEntity("user1", "chan1")).toBe(200);
    expect(db.getActiveEntity("user1", "chan2")).toBeNull();

    const sessions = db.getSessionsForEntity(200);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.discord_id).toBe("user1");
    expect(sessions[0]?.channel_id).toBe("chan1");
  });
});
