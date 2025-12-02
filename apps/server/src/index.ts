import { startServer, pluginManager, seed, scheduler } from "@viwo/core";
import { AiPlugin } from "@viwo/plugin-ai";

async function main() {
  console.log("Starting Viwo Server...");

  // Load plugins
  await pluginManager.loadPlugin(new AiPlugin());

  // Start scheduler
  scheduler.start(100);

  // Start server
  seed();
  startServer(8080);
}

main().catch(console.error);
