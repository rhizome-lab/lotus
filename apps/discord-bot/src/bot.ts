import {
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  type TextChannel,
} from "discord.js";
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
          // execute("sudo", [targetId, verb, ...args])
          socket.execute("sudo", [
            entityId, // Target ID
            parts[0], // Verb
            parts.slice(1), // Args
          ]);
        }
      } catch (error) {
        console.error("Error handling message:", error);
        // message.reply("Something went wrong.");
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
        .setTitle("Bloom Bot Commands")
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

  private async handleCoreMessage(entityId: number, data: any) {
    // Find all active sessions for this entity
    const sessions = db.getSessionsForEntity(entityId);

    await Promise.all(
      sessions.map((session) => async () => {
        try {
          const channel = await this.client.channels.fetch(session.channel_id);
          if (channel && channel.isTextBased()) {
            // Format message based on type
            if (data.type === "message") {
              // Simple text message
              await (channel as TextChannel).send(data.text);
            } else if (data.type === "room") {
              // Room info as embed
              const embed = new EmbedBuilder()
                .setColor(0x2ecc71)
                .setTitle(data.name || "Unknown Room")
                .setDescription(data.description || "");

              // Add exits
              const exits = data.exits?.map((exit: any) => exit.name).filter(Boolean) || [];
              if (exits.length > 0) {
                embed.addFields({
                  name: "🚪 Exits",
                  value: exits.join(", "),
                  inline: true,
                });
              }

              // Add contents
              const contents = data.contents?.map((item: any) => item.name).filter(Boolean) || [];
              if (contents.length > 0) {
                embed.addFields({
                  name: "📦 Contents",
                  value: contents.join(", "),
                  inline: true,
                });
              }

              await (channel as TextChannel).send({ embeds: [embed] });
            } else if (data.type === "inventory") {
              // Inventory as embed
              const items = data.items?.map((item: any) => item.name).filter(Boolean) || [];
              const embed = new EmbedBuilder()
                .setColor(0xe67e22)
                .setTitle("🎒 Inventory")
                .setDescription(items.length > 0 ? items.join("\n") : "*Empty*");

              await (channel as TextChannel).send({ embeds: [embed] });
            } else if (data.type === "item") {
              // Item inspection as embed
              const embed = new EmbedBuilder()
                .setColor(0x9b59b6)
                .setTitle(data.name || "Unknown Item")
                .setDescription(data.description || "");

              if (data.contents && data.contents.length > 0) {
                const contents = data.contents.map((item: any) => item.name).filter(Boolean);
                embed.addFields({
                  name: "Contains",
                  value: contents.join(", "),
                  inline: false,
                });
              }

              await (channel as TextChannel).send({ embeds: [embed] });
            } else if (data.type === "error") {
              // Error message as embed
              const embed = new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle("Error")
                .setDescription(data.text || "An error occurred");

              await (channel as TextChannel).send({ embeds: [embed] });
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
