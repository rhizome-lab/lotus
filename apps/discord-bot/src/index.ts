import { bot } from "./bot";
import { socketManager } from "./socket";

console.log("Starting Discord Bot...");

// Start Socket Manager
socketManager.connect();

// Start Discord Bot
bot.start();

// Listen for messages from Core via System Socket (for global broadcasts if any)
// Individual player sockets handle their own messages in socket.ts (which emits events)
// We need to bridge those events back to Discord.

// This part is tricky: socket.ts emits 'message' on the GameSocket instance.
// We need to listen to those instances.
// But socketManager creates them dynamically.

// Let's modify SocketManager to emit events globally or have a callback?
// Or better, let the Bot subscribe to the socket when it gets it.

// Actually, we need a way to route Core -> Discord messages.
// When Core sends a message to Player X, Player X's socket receives it.
// We need to find which Discord Channel(s) Player X is active in?
// Or just send to the channel that initiated the session?

// In `session.ts`, we map (DiscordUser, Channel) -> Entity.
// But we don't easily map Entity -> (DiscordUser, Channel).
// We should add that reverse lookup or just store it in memory.

// For MVP, let's just log incoming messages in socket.ts for now,
// and maybe implement a basic "Reply to last channel" logic if we can.
