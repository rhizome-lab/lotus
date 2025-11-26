import { startServer, pluginManager } from "@viwo/core";
import { AiPlugin } from "@viwo/plugin-ai";

async function main() {
  console.log("Starting Viwo Server...");

  // Load plugins
  await pluginManager.loadPlugin(new AiPlugin());

  // Start server
  startServer(8080);
}

main().catch(console.error);
