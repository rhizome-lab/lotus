import {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  MessageNotification,
  UpdateNotification,
  RoomIdNotification,
  PlayerIdNotification,
  Entity,
} from "@viwo/shared/jsonrpc";

export type CommandArgument =
  | string
  | number
  | boolean
  | null
  | readonly CommandArgument[];

export type GameMessage =
  | { type: "message"; text: string }
  | { type: "error"; text: string };

export interface GameState {
  isConnected: boolean;
  messages: GameMessage[];
  entities: Map<number, Entity>;
  roomId: number | null;
  playerId: number | null;
  opcodes: any[] | null;
}

export type StateListener = (state: GameState) => void;
export type MessageListener = (message: GameMessage) => void;

/**
 * Client for interacting with the Viwo Core server via WebSocket and JSON-RPC.
 * Manages connection state, message handling, and entity synchronization.
 */
export class ViwoClient {
  private socket: WebSocket | null = null;
  private state: GameState = {
    isConnected: false,
    messages: [],
    entities: new Map(),
    roomId: null,
    playerId: null,
    opcodes: null,
  };
  private responseResolveFunctions = new Map<number, (value: any) => void>();
  private idCounter = 1;
  private stateListeners: Set<StateListener> = new Set();
  private messageListeners: Set<MessageListener> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectInterval: number;
  private url: string;

  constructor(
    url: string = "ws://localhost:8080",
    reconnectInterval: number = 2000,
  ) {
    this.url = url;
    this.reconnectInterval = reconnectInterval;
  }

  /**
   * Connects to the WebSocket server.
   * Automatically handles reconnection if the connection is lost.
   */
  public connect() {
    if (this.state.isConnected || this.socket) return;

    this.socket = new WebSocket(this.url);

    this.socket.onopen = () => {
      this.updateState({ isConnected: true });
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      // Initial fetch
      this.execute("whoami", []);
      this.execute("look", []);
      this.execute("inventory", []);

      // Fetch opcodes
      this.fetchOpcodes();
    };

    this.socket.onclose = () => {
      this.cleanupSocket();
      this.scheduleReconnect();
    };

    this.socket.onerror = (err) => {
      console.error("WebSocket error:", err);
      // onerror is usually followed by onclose, so we don't need to reconnect here explicitly
      // unless onclose isn't called, but standard WS behavior says it should be.
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data.toString());
        this.handleMessage(data);
      } catch (e) {
        console.error("Failed to parse message", e);
      }
    };
  }

  /**
   * Disconnects from the server and stops reconnection attempts.
   */
  public disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      // Prevent onclose from triggering reconnect
      this.socket.onclose = null;
      this.socket.close();
      this.cleanupSocket();
    }
  }

  private cleanupSocket() {
    this.updateState({ isConnected: false });
    this.socket = null;
  }

  private scheduleReconnect() {
    if (!this.reconnectTimer) {
      console.log(`Reconnecting in ${this.reconnectInterval}ms...`);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, this.reconnectInterval);
    }
  }

  /**
   * Executes a command on the server.
   * @param command The command name (verb).
   * @param args Arguments for the command.
   * @returns A promise that resolves with the result of the command.
   */
  public execute(
    command: string,
    args: readonly CommandArgument[],
  ): Promise<any> {
    return this.sendRequest("execute", [command, ...args]);
  }

  /**
   * Calls a plugin RPC method.
   * @param method The RPC method name.
   * @param params The parameters for the method.
   * @returns A promise that resolves with the result.
   */
  public callPluginMethod(method: string, params: any): Promise<any> {
    return this.sendRequest("plugin_rpc", { method, params });
  }

  /**
   * Sends a generic JSON-RPC request.
   * @param method The JSON-RPC method.
   * @param params The parameters for the method.
   * @returns A promise that resolves with the result.
   */
  public sendRequest(method: string, params: any): Promise<any> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Socket not connected"));
    }

    const id = this.idCounter++;
    const req: JsonRpcRequest = {
      jsonrpc: "2.0",
      method,
      params,
      id,
    };

    this.socket.send(JSON.stringify(req));

    return new Promise((resolve) => {
      this.responseResolveFunctions.set(id, resolve);
    });
  }

  /**
   * Fetches the list of available opcodes from the server.
   * @returns A promise that resolves with the opcode metadata.
   */
  public async fetchOpcodes() {
    const opcodes = await this.sendRequest("get_opcodes", []);
    this.updateState({ opcodes });
    return opcodes;
  }

  /**
   * Subscribes to game state updates.
   * @param listener The callback function.
   * @returns A function to unsubscribe.
   */
  public subscribe(listener: StateListener) {
    this.stateListeners.add(listener);
    // Send current state immediately
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  /**
   * Subscribes to game messages (chat, errors).
   * @param listener The callback function.
   * @returns A function to unsubscribe.
   */
  public onMessage(listener: MessageListener) {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  public getState(): GameState {
    return this.state;
  }

  private updateState(partial: Partial<GameState>) {
    this.state = { ...this.state, ...partial };
    this.notifyListeners();
  }

  private notifyListeners() {
    for (const listener of this.stateListeners) {
      listener(this.state);
    }
  }

  private addMessage(msg: GameMessage) {
    this.updateState({
      messages: [...this.state.messages, msg],
    });
    for (const listener of this.messageListeners) {
      listener(msg);
    }
  }

  private handleMessage(data: any) {
    // Basic JSON-RPC validation
    if (data.jsonrpc !== "2.0") {
      console.warn("Invalid JSON-RPC version", data);
      return;
    }

    if ("id" in data && data.id !== null && data.id !== undefined) {
      this.handleResponse(data as JsonRpcResponse);
    } else if ("method" in data) {
      this.handleNotification(data as JsonRpcNotification);
    }
  }

  private handleResponse(response: JsonRpcResponse) {
    const resolve = this.responseResolveFunctions.get(Number(response.id));
    if (resolve) {
      if ("result" in response) {
        resolve(response.result);

        // Note: We don't explicitly track which request was for opcodes here.
        // The state update for opcodes is handled in fetchOpcodes().
      } else {
        console.error("RPC Error:", response.error);
        this.addMessage({
          type: "error",
          text: `Error: ${response.error.message}`,
        });
        resolve(null);
      }
      this.responseResolveFunctions.delete(Number(response.id));
    }
  }

  private handleNotification(notification: JsonRpcNotification) {
    switch (notification.method) {
      case "message": {
        const params = (notification as MessageNotification).params;
        this.addMessage({
          type: params.type === "info" ? "message" : "error",
          text: params.text,
        });
        break;
      }
      case "update": {
        const params = (notification as UpdateNotification).params;
        const newEntities = new Map(this.state.entities);
        for (const entity of params.entities) {
          newEntities.set(entity.id, entity);
        }
        this.updateState({ entities: newEntities });
        break;
      }
      case "room_id": {
        const params = (notification as RoomIdNotification).params;
        this.updateState({ roomId: params.roomId });
        break;
      }
      case "player_id": {
        const params = (notification as PlayerIdNotification).params;
        this.updateState({ playerId: params.playerId });
        break;
      }
      default:
        console.warn("Unknown notification method:", notification.method);
    }
  }
}
