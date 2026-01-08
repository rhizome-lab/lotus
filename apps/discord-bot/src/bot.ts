import {
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  type TextChannel,
} from "discord.js";
import { discordAdapter, parseGameMessage } from "@lotus/shared/adapters";
import { CONFIG } from "./config";
import { db } from "./instances";
import { sessionManager } from "./session";
import { socketManager } from "./socket";

class DiscordBot {
  private client: Client;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });

    this.setupListeners();
  }

  start() {
    this.client.login(CONFIG.DISCORD_TOKEN);
  }

  private setupListeners() {
    this.client.once(Events.ClientReady, (client) => {
      console.log(`Ready! Logged in as ${client.user.tag}`);
    });

    // Listen for messages from Core (via SocketManager)
    socketManager.on("message", (entityId: number, data: any) => {
      this.handleCoreMessage(entityId, data);
    });

    this.client.on(Events.MessageCreate, async (message) => {
      if (message.author.bot) {
        return;
      }

      // Handle Slash Commands (mocked for now via !cmd)
      if (message.content.startsWith("!")) {
        await this.handleCommand(message);
        return;
      }

      try {
        // 1. Resolve Channel -> Room (DMs rely on player location)
        let roomId;
        if (message.channel.type !== ChannelType.DM) {
          roomId = db.getRoomForChannel(message.channelId);
          if (!roomId) {
            // Channel not linked
            return;
          }
        }

        // 2. Resolve Session
        const entityId = await sessionManager.ensureSession(
          message.author.id,
          message.channelId,
          message.author.displayName,
        );

        // 3. Get Socket (Single Bot Socket)
        const socket = socketManager.getSocket();

        // 4. Send Message to Core via sudo
        const parts = message.content.split(" ");
        if (parts[0]) {
          // Execute("sudo", [targetId, verb, ...args])
          socket.execute("sudo", [
            entityId, // Target ID
            parts[0], // Verb
            parts.slice(1), // Args
          ]);
        }
      } catch (error) {
        console.error("Error handling message:", error);
        // Message.reply("Something went wrong.");
      }
    });
  }

  private async handleCommand(message: any) {
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === "link") {
      // !link <room_id>
      if (!args[0]) {
        message.reply("Usage: !link <room_id>");
        return;
      }
      const roomId = parseInt(args[0], 10);
      if (isNaN(roomId)) {
        message.reply("Invalid Room ID.");
        return;
      }
      db.setRoomForChannel(message.channelId, roomId);
      message.reply(`Channel linked to Room ${roomId}.`);
    } else if (command === "ping") {
      message.reply("Pong!");
    } else if (command === "help") {
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("Lotus Bot Commands")
        .setDescription("Available commands:")
        .addFields(
          { name: "!link <room_id>", value: "Link this channel to a room", inline: true },
          { name: "!unlink", value: "Unlink this channel from its room", inline: true },
          { name: "!room", value: "Show current room info", inline: true },
          { name: "!inventory", value: "Show your inventory", inline: true },
          { name: "!inspect <item>", value: "Inspect an item", inline: true },
          { name: "!help", value: "Show this help message", inline: true },
        )
        .setFooter({ text: "Regular messages are sent as game commands" });
      message.reply({ embeds: [embed] });
    } else if (command === "unlink") {
      db.setRoomForChannel(message.channelId, null);
      message.reply("Channel unlinked from room.");
    } else if (command === "room" || command === "look") {
      // Execute 'look' command for the user
      try {
        const entityId = await sessionManager.ensureSession(
          message.author.id,
          message.channelId,
          message.author.displayName,
        );
        const socket = socketManager.getSocket();
        socket.execute("sudo", [entityId, "look", []]);
      } catch {
        message.reply("Failed to get room info.");
      }
    } else if (command === "inventory" || command === "inv" || command === "i") {
      // Execute 'inventory' command for the user
      try {
        const entityId = await sessionManager.ensureSession(
          message.author.id,
          message.channelId,
          message.author.displayName,
        );
        const socket = socketManager.getSocket();
        socket.execute("sudo", [entityId, "inventory", []]);
      } catch {
        message.reply("Failed to get inventory.");
      }
    } else if (command === "inspect") {
      // Execute 'look <item>' command for the user
      if (!args[0]) {
        message.reply("Usage: !inspect <item_name>");
        return;
      }
      try {
        const entityId = await sessionManager.ensureSession(
          message.author.id,
          message.channelId,
          message.author.displayName,
        );
        const socket = socketManager.getSocket();
        socket.execute("sudo", [entityId, "look", [args.join(" ")]]);
      } catch {
        message.reply("Failed to inspect item.");
      }
    }
  }

  private async handleCoreMessage(entityId: number, data: unknown) {
    // Find all active sessions for this entity
    const sessions = db.getSessionsForEntity(entityId);

    // Parse into typed GameMessage
    const msg = parseGameMessage(data);

    await Promise.all(
      sessions.map((session) => async () => {
        try {
          const channel = await this.client.channels.fetch(session.channel_id);
          if (channel && channel.isTextBased()) {
            if (msg) {
              // Use adapter to format the message
              const output = discordAdapter.format(msg);
              // Type assertion needed: discord.js uses exactOptionalPropertyTypes differently
              await (channel as TextChannel).send(output as Parameters<TextChannel["send"]>[0]);
            } else {
              // Unknown type - show as JSON code block
              const content = `\`\`\`json\n${JSON.stringify(data, undefined, 2)}\n\`\`\``;
              await (channel as TextChannel).send(content);
            }
          }
        } catch (error) {
          console.error(`Failed to send to channel ${session.channel_id}`, error);
        }
      }),
    );
  }
}

export const bot = new DiscordBot();
