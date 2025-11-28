import WebSocket from "ws";
import { CONFIG } from "./config";
import { EventEmitter } from "events";

export class GameSocket extends EventEmitter {
  private ws: WebSocket | null = null;
  private entityId: number | null = null;
  private queue: (readonly string[])[] = [];
  private connected = false;

  constructor(entityId?: number) {
    super();
    this.entityId = entityId || null;
  }

  connect() {
    if (this.ws) return;

    this.ws = new WebSocket(CONFIG.CORE_URL);

    this.ws.on("open", () => {
      this.connected = true;
      console.log(`Socket connected (Entity: ${this.entityId})`);

      if (this.entityId) {
        this.send(["login", this.entityId.toString()]);
      }

      // Flush queue
      while (this.queue.length > 0) {
        const msg = this.queue.shift();
        if (msg) this.ws?.send(msg);
      }
    });

    this.ws.on("message", (data) => {
      try {
        const json = JSON.parse(data.toString());
        this.handleMessage(json);
        this.emit("message", json); // Keep original emit for external listeners
      } catch (e) {
        console.error("Failed to parse message", e);
      }
    });

    this.ws.on("close", () => {
      this.connected = false;
      this.ws = null;
      console.log(`Socket disconnected (Entity: ${this.entityId})`);
      // Reconnect logic could go here
      setTimeout(() => this.connect(), 5000);
    });

    this.ws.on("error", (err) => {
      console.error("Socket error:", err);
    });
  }

  send(command: readonly string[]) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "execute",
          params: command,
          id: Date.now(),
        }),
      );
    } else {
      this.queue.push(command);
    }
  }

  private handleMessage(data: any) {
    // Handle JSON-RPC Notification
    if (data.method === "message" && data.params && data.params.text) {
      console.log("[Core Message]:", data.params.text);
    }

    // Handle JSON-RPC Response (Result)
    if (data.result && data.result.message) {
      console.log("[Core Result]:", data.result.message);
    }
  }

  close() {
    this.ws?.close();
  }
}

export class SocketManager extends EventEmitter {
  private sockets: Map<number, GameSocket> = new Map();
  private systemSocket: GameSocket;

  constructor() {
    super();
    // System socket for creating players, etc. (acting as Guest or Admin)
    this.systemSocket = new GameSocket();
  }

  connect() {
    this.systemSocket.connect();
  }

  getSystemSocket() {
    return this.systemSocket;
  }

  getSocket(entityId: number): GameSocket {
    if (!this.sockets.has(entityId)) {
      const socket = new GameSocket(entityId);
      socket.connect();

      // Forward messages to the manager
      socket.on("message", (data) => {
        this.emit("message", entityId, data);
      });

      this.sockets.set(entityId, socket);
    }
    return this.sockets.get(entityId)!;
  }
}

export const socketManager = new SocketManager();
