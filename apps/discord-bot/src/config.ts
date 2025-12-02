import dotenv from "dotenv";

dotenv.config();

export const CONFIG = {
  DISCORD_TOKEN: process.env["DISCORD_TOKEN"] ?? "",
  CORE_URL: process.env["CORE_URL"] ?? "ws://localhost:8080",
  DB_PATH: process.env["DB_PATH"] ?? "bot.sqlite",
  BOT_ENTITY_ID: 4,
};

if (!CONFIG.DISCORD_TOKEN) {
  console.warn("WARNING: DISCORD_TOKEN is not set.");
}
