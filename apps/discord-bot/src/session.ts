import { db } from "./db";
import { socketManager } from "./socket";

export class SessionManager {
  async ensureSession(
    discordId: string,
    channelId: string,
    displayName: string,
  ): Promise<number> {
    // 1. Check active session
    let entityId = db.getActiveEntity(discordId, channelId);
    if (entityId) return entityId;

    // 2. Check default entity
    entityId = db.getDefaultEntity(discordId);

    // 3. If no default, create new player
    if (!entityId) {
      entityId = await this.createPlayer(displayName);
      if (entityId) {
        db.setDefaultEntity(discordId, entityId);
      }
    }

    // 4. Set active session
    if (entityId) {
      db.setActiveEntity(discordId, channelId, entityId);
      return entityId;
    }

    throw new Error("Failed to create session");
  }

  private async createPlayer(name: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const sys = socketManager.getSocket();

      // Temporary listener for the response
      const handler = (msg: any) => {
        if (msg.type === "player_created" && msg.name === name) {
          sys.off("message", handler);
          resolve(msg.id);
        }
      };

      sys.on("message", handler);
      sys.execute("create_player", [name]);

      // Timeout
      setTimeout(() => {
        sys.off("message", handler);
        reject(new Error("Timeout creating player"));
      }, 5000);
    });
  }
}

export const sessionManager = new SessionManager();
