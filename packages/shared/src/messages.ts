/**
 * Game message types for platform-agnostic rendering.
 * These structured types are converted to platform-specific formats
 * (Discord Embeds, Slack Blocks, HTML, etc.) by adapters.
 */

/** Reference to an entity (used in lists) */
export interface EntityReference {
  id: number;
  name: string;
  description?: string;
}

/** Exit/direction in a room */
export interface Exit {
  direction: string;
  destination?: string;
  locked?: boolean;
}

/** Room view message */
export interface RoomMessage {
  type: "room";
  id: number;
  name: string;
  description: string;
  exits: Exit[];
  contents: EntityReference[];
  mood?: string;
}

/** Inventory view message */
export interface InventoryMessage {
  type: "inventory";
  playerId: number;
  items: EntityReference[];
  capacity?: { used: number; max: number };
}

/** Item inspection message */
export interface ItemMessage {
  type: "item";
  id: number;
  name: string;
  description: string;
  properties?: Record<string, unknown>;
  contents?: EntityReference[];
}

/** Status/stats message */
export interface StatusMessage {
  type: "status";
  health?: { current: number; max: number };
  mana?: { current: number; max: number };
  level?: number;
  experience?: { current: number; next: number };
}

/** Simple text message */
export interface TextMessage {
  type: "text";
  text: string;
  style?: "info" | "success" | "warning" | "error";
}

/** Error message */
export interface ErrorMessage {
  type: "error";
  title?: string;
  text: string;
  code?: string;
}

/** Combat/action result message */
export interface ActionMessage {
  type: "action";
  actor: string;
  action: string;
  target?: string;
  result?: string;
  damage?: number;
}

/** Dialogue message (for NPCs) */
export interface DialogueMessage {
  type: "dialogue";
  speaker: string;
  text: string;
  options?: string[];
}

/** Union of all game message types */
export type GameMessage =
  | RoomMessage
  | InventoryMessage
  | ItemMessage
  | StatusMessage
  | TextMessage
  | ErrorMessage
  | ActionMessage
  | DialogueMessage;

/** Type guard for RoomMessage */
export function isRoomMessage(msg: GameMessage): msg is RoomMessage {
  return msg.type === "room";
}

/** Type guard for InventoryMessage */
export function isInventoryMessage(msg: GameMessage): msg is InventoryMessage {
  return msg.type === "inventory";
}

/** Type guard for ItemMessage */
export function isItemMessage(msg: GameMessage): msg is ItemMessage {
  return msg.type === "item";
}

/** Type guard for StatusMessage */
export function isStatusMessage(msg: GameMessage): msg is StatusMessage {
  return msg.type === "status";
}

/** Type guard for TextMessage */
export function isTextMessage(msg: GameMessage): msg is TextMessage {
  return msg.type === "text";
}

/** Type guard for ErrorMessage */
export function isErrorMessage(msg: GameMessage): msg is ErrorMessage {
  return msg.type === "error";
}

/** Type guard for ActionMessage */
export function isActionMessage(msg: GameMessage): msg is ActionMessage {
  return msg.type === "action";
}

/** Type guard for DialogueMessage */
export function isDialogueMessage(msg: GameMessage): msg is DialogueMessage {
  return msg.type === "dialogue";
}

/**
 * Parse a raw message object into a typed GameMessage.
 * Returns null if the message type is unknown.
 */
export function parseGameMessage(data: unknown): GameMessage | null {
  if (!data || typeof data !== "object" || !("type" in data)) {
    return null;
  }

  const msg = data as { type: string };

  switch (msg.type) {
    case "room":
    case "inventory":
    case "item":
    case "status":
    case "text":
    case "error":
    case "action":
    case "dialogue": {
      return data as GameMessage;
    }
    case "message": {
      // Legacy format: convert to TextMessage
      return {
        type: "text",
        text: (data as { text?: string }).text ?? "",
      };
    }
    default: {
      return null;
    }
  }
}
