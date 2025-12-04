import { Database } from "bun:sqlite";
import { CONFIG } from "./config";

export class DatabaseManager {
  private db: Database;

  constructor() {
    this.db = new Database(CONFIG.DB_PATH);
    this.init();
  }

  private init() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS channel_maps (
        channel_id TEXT PRIMARY KEY,
        room_id INTEGER NOT NULL
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS user_defaults (
        discord_id TEXT PRIMARY KEY,
        default_entity_id INTEGER NOT NULL
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS active_sessions (
        discord_id TEXT,
        channel_id TEXT,
        entity_id INTEGER NOT NULL,
        PRIMARY KEY (discord_id, channel_id)
      )
    `);
  }

  // Channel Maps
  getRoomForChannel(channelId: string): number | null {
    const res = this.db
      .query("SELECT room_id FROM channel_maps WHERE channel_id = ?")
      .get(channelId) as { room_id: number } | null;
    return res ? res.room_id : null;
  }

  setRoomForChannel(channelId: string, roomId: number) {
    this.db
      .query("INSERT OR REPLACE INTO channel_maps (channel_id, room_id) VALUES (?, ?)")
      .run(channelId, roomId);
  }

  // User Defaults
  getDefaultEntity(discordId: string): number | null {
    const res = this.db
      .query("SELECT default_entity_id FROM user_defaults WHERE discord_id = ?")
      .get(discordId) as { default_entity_id: number } | null;
    return res ? res.default_entity_id : null;
  }

  setDefaultEntity(discordId: string, entityId: number) {
    this.db
      .query("INSERT OR REPLACE INTO user_defaults (discord_id, default_entity_id) VALUES (?, ?)")
      .run(discordId, entityId);
  }

  // Active Sessions
  getActiveEntity(discordId: string, channelId: string): number | null {
    const res = this.db
      .query("SELECT entity_id FROM active_sessions WHERE discord_id = ? AND channel_id = ?")
      .get(discordId, channelId) as { entity_id: number } | null;
    return res ? res.entity_id : null;
  }

  setActiveEntity(discordId: string, channelId: string, entityId: number) {
    this.db
      .query(
        "INSERT OR REPLACE INTO active_sessions (discord_id, channel_id, entity_id) VALUES (?, ?, ?)",
      )
      .run(discordId, channelId, entityId);
  }

  getSessionsForEntity(entityId: number): { discord_id: string; channel_id: string }[] {
    return this.db
      .query("SELECT discord_id, channel_id FROM active_sessions WHERE entity_id = ?")
      .all(entityId) as { discord_id: string; channel_id: string }[];
  }
}
