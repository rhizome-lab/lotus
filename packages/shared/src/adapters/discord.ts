/**
 * Discord adapter - converts game messages to Discord embed format.
 *
 * This produces plain objects that can be used with discord.js EmbedBuilder
 * or sent directly as embed data in API calls.
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
import { type MessageAdapter, MessageColors, MessageIcons, truncate, formatList } from "./types";

/** Discord embed field */
export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

/** Discord embed footer */
export interface DiscordEmbedFooter {
  text: string;
  icon_url?: string;
}

/** Discord embed output format (matches Discord API structure) */
export interface DiscordEmbed {
  title?: string | undefined;
  description?: string | undefined;
  color?: number | undefined;
  fields?: DiscordEmbedField[] | undefined;
  footer?: DiscordEmbedFooter | undefined;
  timestamp?: string | undefined;
}

/** Discord message output (can contain multiple embeds or plain content) */
export interface DiscordOutput {
  content?: string | undefined;
  embeds?: DiscordEmbed[] | undefined;
}

/** Discord platform limits */
const DISCORD_LIMITS = {
  titleLength: 256,
  descriptionLength: 4096,
  fieldNameLength: 256,
  fieldValueLength: 1024,
  fieldsPerEmbed: 25,
  embedsPerMessage: 10,
  totalEmbedLength: 6000,
};

/**
 * Discord message adapter implementation.
 */
export class DiscordAdapter implements MessageAdapter<DiscordOutput> {
  formatRoom(msg: RoomMessage): DiscordOutput {
    const fields: DiscordEmbedField[] = [];

    // Add exits
    if (msg.exits.length > 0) {
      const exitList = msg.exits
        .map((exit) => {
          const icon = exit.locked ? MessageIcons.locked : "";
          return `${icon}${exit.direction}${exit.destination ? ` \u2192 ${exit.destination}` : ""}`;
        })
        .join(", ");
      fields.push({
        name: `${MessageIcons.exits} Exits`,
        value: truncate(exitList, DISCORD_LIMITS.fieldValueLength),
        inline: true,
      });
    }

    // Add contents
    if (msg.contents.length > 0) {
      fields.push({
        name: `${MessageIcons.contents} Here`,
        value: truncate(formatList(msg.contents), DISCORD_LIMITS.fieldValueLength),
        inline: true,
      });
    }

    return {
      embeds: [
        {
          title: truncate(msg.name, DISCORD_LIMITS.titleLength),
          description: truncate(msg.description, DISCORD_LIMITS.descriptionLength),
          color: MessageColors.room,
          fields: fields.length > 0 ? fields : undefined,
        },
      ],
    };
  }

  formatInventory(msg: InventoryMessage): DiscordOutput {
    let description = formatList(msg.items, "*Your inventory is empty*", "\n");

    // Add capacity info if available
    if (msg.capacity) {
      description += `\n\n*Capacity: ${msg.capacity.used}/${msg.capacity.max}*`;
    }

    return {
      embeds: [
        {
          title: `${MessageIcons.inventory} Inventory`,
          description: truncate(description, DISCORD_LIMITS.descriptionLength),
          color: MessageColors.inventory,
        },
      ],
    };
  }

  formatItem(msg: ItemMessage): DiscordOutput {
    const fields: DiscordEmbedField[] = [];

    // Add contents if present
    if (msg.contents && msg.contents.length > 0) {
      fields.push({
        name: "Contains",
        value: truncate(formatList(msg.contents), DISCORD_LIMITS.fieldValueLength),
        inline: false,
      });
    }

    // Add properties if present
    if (msg.properties) {
      const propList = Object.entries(msg.properties)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => `**${key}**: ${String(value)}`)
        .join("\n");
      if (propList) {
        fields.push({
          name: "Properties",
          value: truncate(propList, DISCORD_LIMITS.fieldValueLength),
          inline: false,
        });
      }
    }

    return {
      embeds: [
        {
          title: truncate(msg.name, DISCORD_LIMITS.titleLength),
          description: truncate(msg.description, DISCORD_LIMITS.descriptionLength),
          color: MessageColors.item,
          fields: fields.length > 0 ? fields : undefined,
        },
      ],
    };
  }

  formatStatus(msg: StatusMessage): DiscordOutput {
    const fields: DiscordEmbedField[] = [];

    if (msg.health) {
      const bar = this.progressBar(msg.health.current, msg.health.max);
      fields.push({
        name: `${MessageIcons.health} Health`,
        value: `${bar} ${msg.health.current}/${msg.health.max}`,
        inline: true,
      });
    }

    if (msg.mana) {
      const bar = this.progressBar(msg.mana.current, msg.mana.max);
      fields.push({
        name: `${MessageIcons.mana} Mana`,
        value: `${bar} ${msg.mana.current}/${msg.mana.max}`,
        inline: true,
      });
    }

    if (msg.level !== undefined) {
      fields.push({
        name: `${MessageIcons.level} Level`,
        value: String(msg.level),
        inline: true,
      });
    }

    if (msg.experience) {
      const bar = this.progressBar(msg.experience.current, msg.experience.next);
      fields.push({
        name: "Experience",
        value: `${bar} ${msg.experience.current}/${msg.experience.next}`,
        inline: false,
      });
    }

    return {
      embeds: [
        {
          title: "Status",
          color: MessageColors.status,
          fields,
        },
      ],
    };
  }

  formatText(msg: TextMessage): DiscordOutput {
    const colorMap = {
      info: MessageColors.info,
      success: MessageColors.success,
      warning: MessageColors.warning,
      error: MessageColors.error,
    };

    const color = msg.style ? colorMap[msg.style] : undefined;

    // For short messages without styling, just use content
    if (!msg.style && msg.text.length <= 2000) {
      return { content: msg.text };
    }

    return {
      embeds: [
        {
          description: truncate(msg.text, DISCORD_LIMITS.descriptionLength),
          color,
        },
      ],
    };
  }

  formatError(msg: ErrorMessage): DiscordOutput {
    return {
      embeds: [
        {
          title: msg.title ?? `${MessageIcons.error} Error`,
          description: truncate(msg.text, DISCORD_LIMITS.descriptionLength),
          color: MessageColors.error,
          footer: msg.code ? { text: `Code: ${msg.code}` } : undefined,
        },
      ],
    };
  }

  formatAction(msg: ActionMessage): DiscordOutput {
    let description = `**${msg.actor}** ${msg.action}`;
    if (msg.target) {
      description += ` **${msg.target}**`;
    }
    if (msg.result) {
      description += `\n${msg.result}`;
    }
    if (msg.damage !== undefined) {
      description += `\n${MessageIcons.attack} **${msg.damage}** damage`;
    }

    return {
      embeds: [
        {
          description: truncate(description, DISCORD_LIMITS.descriptionLength),
          color: MessageColors.action,
        },
      ],
    };
  }

  formatDialogue(msg: DialogueMessage): DiscordOutput {
    const fields: DiscordEmbedField[] = [];

    if (msg.options && msg.options.length > 0) {
      const optionList = msg.options.map((opt, idx) => `${idx + 1}. ${opt}`).join("\n");
      fields.push({
        name: "Options",
        value: truncate(optionList, DISCORD_LIMITS.fieldValueLength),
        inline: false,
      });
    }

    return {
      embeds: [
        {
          title: `${MessageIcons.speaker} ${msg.speaker}`,
          description: truncate(msg.text, DISCORD_LIMITS.descriptionLength),
          color: MessageColors.dialogue,
          fields: fields.length > 0 ? fields : undefined,
        },
      ],
    };
  }

  format(msg: GameMessage): DiscordOutput {
    switch (msg.type) {
      case "room": {
        return this.formatRoom(msg);
      }
      case "inventory": {
        return this.formatInventory(msg);
      }
      case "item": {
        return this.formatItem(msg);
      }
      case "status": {
        return this.formatStatus(msg);
      }
      case "text": {
        return this.formatText(msg);
      }
      case "error": {
        return this.formatError(msg);
      }
      case "action": {
        return this.formatAction(msg);
      }
      case "dialogue": {
        return this.formatDialogue(msg);
      }
    }
  }

  /** Generate a text-based progress bar */
  private progressBar(current: number, max: number, length = 10): string {
    const filled = Math.round((current / max) * length);
    const empty = length - filled;
    return `[${"=".repeat(filled)}${"-".repeat(empty)}]`;
  }
}

/** Singleton instance */
export const discordAdapter = new DiscordAdapter();
