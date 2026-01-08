import { type CommandArgument, LotusClient } from "@lotus/client";
import { CONFIG } from "./config";
import { EventEmitter } from "node:events";

// oxlint-disable-next-line prefer-event-target
export class GameSocket extends EventEmitter {
  private client: LotusClient;
  private entityId: number | null = null;
  private connected = false;

  constructor(entityId?: number) {
    super();
    this.entityId = entityId ?? null;
    this.client = new LotusClient(CONFIG.CORE_URL);

    this.client.subscribe((state) => {
      if (state.isConnected && !this.connected) {
        this.connected = true;
        console.log(`Socket connected (Entity: ${this.entityId})`);

        if (this.entityId) {
          // Note: 'login' command is currently a placeholder for future auth implementation.
          // The server currently assigns a new player ID on connection.
          this.client.sendRequest("login", { entityId: this.entityId });
        }
      } else if (!state.isConnected && this.connected) {
        this.connected = false;
        console.log(`Socket disconnected (Entity: ${this.entityId})`);
      }
    });

    this.client.onMessage((msg) => {
      // Emit message for external listeners (like the bot)
      this.emit("message", {
        method: "message",
        params: {
          text: msg.text,
          type: msg.type === "message" ? "info" : "error",
        },
      });
    });
  }

  connect() {
    this.client.connect();
  }

  execute(command: string, args: readonly CommandArgument[]) {
    return this.client.execute(command, args);
  }

  close() {
    this.client.disconnect();
  }
}

// oxlint-disable-next-line prefer-event-target
export class SocketManager extends EventEmitter {
  private socket: GameSocket;

  constructor() {
    super();
    // Connect as the Bot Entity
    this.socket = new GameSocket(CONFIG.BOT_ENTITY_ID);
  }

  connect() {
    this.socket.connect();

    this.socket.on("message", (data) => {
      if (data.method === "forward") {
        // Forwarded message from Core
        // Params: { target: entityId, type: string, payload: any }
        const { target, type, payload } = data.params;
        this.emit("message", target, { type, ...payload });
      } else {
        // Direct message to Bot (e.g. login response)
        // We might want to handle this, but for now ignore or log
        console.log("Bot received direct message:", data);
      }
    });
  }

  getSocket() {
    return this.socket;
  }
}

export const socketManager = new SocketManager();
