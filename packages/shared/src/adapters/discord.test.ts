import { describe, expect, it } from "bun:test";
import { discordAdapter } from "./discord";
import type {
  RoomMessage,
  InventoryMessage,
  ItemMessage,
  TextMessage,
  ErrorMessage,
  ActionMessage,
  DialogueMessage,
  StatusMessage,
} from "../messages";
import { MessageColors } from "./types";

describe("DiscordAdapter", () => {
  describe("formatRoom", () => {
    it("formats a basic room", () => {
      const msg: RoomMessage = {
        type: "room",
        id: 1,
        name: "Town Square",
        description: "A bustling town square with a fountain.",
        exits: [{ direction: "north", destination: "Market" }],
        contents: [{ id: 2, name: "Old Man" }],
      };

      const output = discordAdapter.formatRoom(msg);

      expect(output.embeds).toHaveLength(1);
      expect(output.embeds![0].title).toBe("Town Square");
      expect(output.embeds![0].description).toBe("A bustling town square with a fountain.");
      expect(output.embeds![0].color).toBe(MessageColors.room);
      expect(output.embeds![0].fields).toHaveLength(2);
    });

    it("handles locked exits", () => {
      const msg: RoomMessage = {
        type: "room",
        id: 1,
        name: "Dungeon",
        description: "A dark dungeon.",
        exits: [{ direction: "east", locked: true }],
        contents: [],
      };

      const output = discordAdapter.formatRoom(msg);
      const exitField = output.embeds![0].fields![0];
      expect(exitField.value).toContain("\u{1F512}"); // lock emoji
    });
  });

  describe("formatInventory", () => {
    it("formats inventory with items", () => {
      const msg: InventoryMessage = {
        type: "inventory",
        playerId: 1,
        items: [{ id: 1, name: "Sword" }, { id: 2, name: "Shield" }],
      };

      const output = discordAdapter.formatInventory(msg);

      expect(output.embeds).toHaveLength(1);
      expect(output.embeds![0].description).toBe("Sword\nShield");
      expect(output.embeds![0].color).toBe(MessageColors.inventory);
    });

    it("shows empty message when no items", () => {
      const msg: InventoryMessage = {
        type: "inventory",
        playerId: 1,
        items: [],
      };

      const output = discordAdapter.formatInventory(msg);
      expect(output.embeds![0].description).toBe("*Your inventory is empty*");
    });
  });

  describe("formatItem", () => {
    it("formats item inspection", () => {
      const msg: ItemMessage = {
        type: "item",
        id: 1,
        name: "Magic Sword",
        description: "A sword that glows with magical energy.",
        properties: { damage: 10, enchanted: true },
      };

      const output = discordAdapter.formatItem(msg);

      expect(output.embeds![0].title).toBe("Magic Sword");
      expect(output.embeds![0].color).toBe(MessageColors.item);
      expect(output.embeds![0].fields).toBeDefined();
    });
  });

  describe("formatText", () => {
    it("returns plain content for short unstyled text", () => {
      const msg: TextMessage = {
        type: "text",
        text: "You picked up the key.",
      };

      const output = discordAdapter.formatText(msg);
      expect(output.content).toBe("You picked up the key.");
      expect(output.embeds).toBeUndefined();
    });

    it("uses embed for styled text", () => {
      const msg: TextMessage = {
        type: "text",
        text: "Quest completed!",
        style: "success",
      };

      const output = discordAdapter.formatText(msg);
      expect(output.embeds).toHaveLength(1);
      expect(output.embeds![0].color).toBe(MessageColors.success);
    });
  });

  describe("formatError", () => {
    it("formats error with code", () => {
      const msg: ErrorMessage = {
        type: "error",
        text: "You cannot do that.",
        code: "ERR_PERMISSION",
      };

      const output = discordAdapter.formatError(msg);

      expect(output.embeds![0].color).toBe(MessageColors.error);
      expect(output.embeds![0].footer?.text).toBe("Code: ERR_PERMISSION");
    });
  });

  describe("formatAction", () => {
    it("formats combat action with damage", () => {
      const msg: ActionMessage = {
        type: "action",
        actor: "Hero",
        action: "attacks",
        target: "Goblin",
        damage: 15,
      };

      const output = discordAdapter.formatAction(msg);

      expect(output.embeds![0].description).toContain("**Hero** attacks **Goblin**");
      expect(output.embeds![0].description).toContain("**15** damage");
    });
  });

  describe("formatDialogue", () => {
    it("formats NPC dialogue with options", () => {
      const msg: DialogueMessage = {
        type: "dialogue",
        speaker: "Merchant",
        text: "Welcome to my shop!",
        options: ["Buy", "Sell", "Leave"],
      };

      const output = discordAdapter.formatDialogue(msg);

      expect(output.embeds![0].title).toContain("Merchant");
      expect(output.embeds![0].description).toBe("Welcome to my shop!");
      expect(output.embeds![0].fields![0].value).toContain("1. Buy");
    });
  });

  describe("formatStatus", () => {
    it("formats health and mana bars", () => {
      const msg: StatusMessage = {
        type: "status",
        health: { current: 75, max: 100 },
        mana: { current: 30, max: 50 },
        level: 5,
      };

      const output = discordAdapter.formatStatus(msg);

      expect(output.embeds![0].fields).toHaveLength(3);
      expect(output.embeds![0].fields![0].value).toContain("75/100");
      expect(output.embeds![0].fields![1].value).toContain("30/50");
    });
  });

  describe("format", () => {
    it("routes to correct formatter based on type", () => {
      const room: RoomMessage = {
        type: "room",
        id: 1,
        name: "Test",
        description: "Test room",
        exits: [],
        contents: [],
      };

      const output = discordAdapter.format(room);
      expect(output.embeds![0].color).toBe(MessageColors.room);
    });
  });
});
