import { pluginManager, scheduler, startServer } from "@viwo/core";
import { FsPlugin } from "@viwo/plugin-fs";
import { resolve } from "node:path";
import { seedFileBrowser } from "./seed";

async function main() {
  // Get root path from CLI arg or use current directory
  const rootPath = process.argv[2] ?? process.cwd();
  const resolvedRoot = resolve(rootPath);
  const writable = process.argv.includes("--writable");
  const port = parseInt(process.env["PORT"] ?? "8080", 10);

  console.log("Starting Viwo File Browser Server...");
  console.log(`Root path: ${resolvedRoot}`);
  console.log(`Writable: ${writable}`);

  // Load FS plugin (required for file operations)
  await pluginManager.loadPlugin(new FsPlugin());

  // Start scheduler
  scheduler.start(100);

  // Seed file browser world
  seedFileBrowser({
    rootPath: resolvedRoot,
    writable,
  });

  // Start server
  startServer(port);
  console.log(`Server listening on port ${port}`);
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
