/**
 * Represents a JSON-RPC 2.0 Request object.
 * @template T The type of the params.
 */
export interface JsonRpcRequest<T = any> {
  jsonrpc: "2.0";
  /** The name of the method to be invoked. */
  method: string;
  /** A Structured value that holds the parameter values to be used during the invocation of the method. */
  params?: T;
  /** An identifier established by the Client that MUST contain a String, Number, or NULL value if included. */
  id: number | string;
}

/**
 * Represents a JSON-RPC 2.0 Notification object.
 * A Notification is a Request object without an "id" member.
 * @template T The type of the params.
 */
export interface JsonRpcNotification<T = any> {
  jsonrpc: "2.0";
  /** The name of the method to be invoked. */
  method: string;
  /** A Structured value that holds the parameter values to be used during the invocation of the method. */
  params?: T;
}

/**
 * Represents a JSON-RPC 2.0 Success Response object.
 * @template T The type of the result.
 */
export interface JsonRpcSuccess<T = any> {
  jsonrpc: "2.0";
  /** The value of this member is determined by the method invoked on the Server. */
  result: T;
  /** This member is REQUIRED. It MUST be the same as the value of the id member in the Request Object. */
  id: number | string;
}

/**
 * Represents a JSON-RPC 2.0 Error Response object.
 */
export interface JsonRpcError {
  jsonrpc: "2.0";
  /** The error object. */
  error: {
    /** A Number that indicates the error type that occurred. */
    code: number;
    /** A String providing a short description of the error. */
    message: string;
    /** A Primitive or Structured value that contains additional information about the error. */
    data?: any;
  };
  /** This member is REQUIRED. It MUST be the same as the value of the id member in the Request Object. */
  id: number | string | null;
}

/**
 * Represents a JSON-RPC 2.0 Response object (Success or Error).
 * @template T The type of the result.
 */
export type JsonRpcResponse<T = any> = JsonRpcSuccess<T> | JsonRpcError;

/**
 * Union type for any JSON-RPC message.
 */
export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcResponse;

// Specific Notification Types

/**
 * Parameters for a 'message' notification.
 */
export interface MessageNotificationParams {
  /** The type of message (info or error). */
  type: "info" | "error";
  /** The message text. */
  text: string;
}

/**
 * A notification sent by the server to display a message to the user.
 */
export interface MessageNotification extends JsonRpcNotification {
  method: "message";
  params: MessageNotificationParams;
}

/**
 * Represents a game entity.
 * Everything in the game is an Entity (Room, Player, Item, Exit, etc.).
 */
export interface Entity {
  /** Unique ID of the entity */
  id: number;
  /**
   * Resolved properties (merged from prototype and instance).
   * Contains arbitrary game data like description, adjectives, custom_css.
   */
  [key: string]: unknown;
}

/**
 * Parameters for an 'update' notification.
 */
export interface UpdateNotificationParams {
  /** The list of entities to update in the client's state. */
  entities: readonly Entity[];
}

/**
 * A notification sent by the server to update the client's entity state.
 */
export interface UpdateNotification extends JsonRpcNotification {
  method: "update";
  params: UpdateNotificationParams;
}

/**
 * Parameters for a 'room_id' notification.
 */
export interface RoomIdNotificationParams {
  /** The ID of the room the player is currently in. */
  roomId: number;
}

/**
 * A notification sent by the server to set the current room ID.
 */
export interface RoomIdNotification extends JsonRpcNotification {
  method: "room_id";
  params: RoomIdNotificationParams;
}

/**
 * Parameters for a 'player_id' notification.
 */
export interface PlayerIdNotificationParams {
  /** The ID of the player entity. */
  playerId: number;
}

/**
 * A notification sent by the server to set the player's entity ID.
 */
export interface PlayerIdNotification extends JsonRpcNotification {
  method: "player_id";
  params: PlayerIdNotificationParams;
}
