/**
 * Adapter types for platform-specific message rendering.
 */

import type {
  GameMessage,
  RoomMessage,
  InventoryMessage,
  ItemMessage,
  StatusMessage,
  TextMessage,
  ErrorMessage,
  ActionMessage,
  DialogueMessage,
} from "../messages";

/** Color palette for consistent theming across platforms */
export const MessageColors = {
  /** Room/location - calm green */
  room: 0x2ecc71,
  /** Inventory - warm orange */
  inventory: 0xe67e22,
  /** Item inspection - purple */
  item: 0x9b59b6,
  /** Status/stats - blue */
  status: 0x3498db,
  /** Success - bright green */
  success: 0x57f287,
  /** Info - blurple */
  info: 0x5865f2,
  /** Warning - yellow */
  warning: 0xfee75c,
  /** Error - red */
  error: 0xe74c3c,
  /** Action/combat - orange-red */
  action: 0xed4245,
  /** Dialogue - teal */
  dialogue: 0x1abc9c,
} as const;

/** Emoji/icon mapping for consistent visual language */
export const MessageIcons = {
  exits: "\u{1F6AA}", // door
  contents: "\u{1F4E6}", // package
  inventory: "\u{1F392}", // backpack
  health: "\u{2764}\u{FE0F}", // red heart
  mana: "\u{1F535}", // blue circle
  level: "\u{2B50}", // star
  locked: "\u{1F512}", // locked
  unlocked: "\u{1F513}", // unlocked
  speaker: "\u{1F4AC}", // speech bubble
  attack: "\u{2694}\u{FE0F}", // crossed swords
  error: "\u{26A0}\u{FE0F}", // warning
} as const;

/**
 * Platform adapter interface.
 * Each platform (Discord, Slack, etc.) implements this to convert
 * structured game messages to platform-specific formats.
 */
export interface MessageAdapter<TOutput> {
  /** Convert a room message to platform output */
  formatRoom(msg: RoomMessage): TOutput;

  /** Convert an inventory message to platform output */
  formatInventory(msg: InventoryMessage): TOutput;

  /** Convert an item message to platform output */
  formatItem(msg: ItemMessage): TOutput;

  /** Convert a status message to platform output */
  formatStatus(msg: StatusMessage): TOutput;

  /** Convert a text message to platform output */
  formatText(msg: TextMessage): TOutput;

  /** Convert an error message to platform output */
  formatError(msg: ErrorMessage): TOutput;

  /** Convert an action message to platform output */
  formatAction(msg: ActionMessage): TOutput;

  /** Convert a dialogue message to platform output */
  formatDialogue(msg: DialogueMessage): TOutput;

  /** Convert any game message to platform output */
  format(msg: GameMessage): TOutput;
}

/**
 * Truncate text to fit platform limits.
 * @param text - Text to truncate
 * @param maxLength - Maximum allowed length
 * @param suffix - Suffix to add when truncated (default: "...")
 */
export function truncate(text: string, maxLength: number, suffix = "..."): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Format a list of items as a string.
 * @param items - Items with name property
 * @param emptyText - Text to show when list is empty
 * @param separator - Separator between items
 */
export function formatList(
  items: Array<{ name: string }>,
  emptyText = "*Empty*",
  separator = ", ",
): string {
  if (items.length === 0) {
    return emptyText;
  }
  return items.map((item) => item.name).join(separator);
}
