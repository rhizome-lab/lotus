import { spawn } from "child_process";

// Helper to spawn a process and pipe its output
function spawnProcess(command: string, args: string[], env: Record<string, string> = {}) {
  const proc = spawn(command, args, {
    env: { ...process.env, ...env },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  proc.stdout.on("data", (data) => {
    process.stdout.write(data);
  });

  proc.stderr.on("data", (data) => {
    process.stderr.write(data);
  });

  return proc;
}

function main() {
  console.log("Starting Playground...");

  // Start the playground
  const playground = spawn("bun", ["--filter", "@lotus/playground", "dev"], {
    stdio: ["ignore", "pipe", "inherit"],
  });

  let playgroundPort: string | null;

  // Listen for the port in stdout
  playground.stdout.on("data", (data) => {
    const output = data.toString();
    process.stdout.write(output); // Passthrough output

    if (!playgroundPort) {
      // Look for "Local: http://localhost:3001/" or similar
      const match = output.match(/Local:\s+http:\/\/localhost:(\d+)/);
      if (match) {
        [, playgroundPort] = match;
        console.log(`\nDetected Playground on port: ${playgroundPort}`);
        startDocs(playgroundPort!);
      }
    }
  });

  function startDocs(port: string) {
    console.log("Starting Docs...");
    const docs = spawnProcess("bun", ["--filter", "@lotus/docs", "dev"], {
      PLAYGROUND_PORT: port,
    });

    // Handle cleanup
    const cleanup = () => {
      console.log("\nStopping processes...");
      playground.kill();
      docs.kill();
      process.exit();
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);

    // If docs exit, we exit
    docs.on("exit", (code) => {
      playground.kill();
      process.exit(code ?? 0);
    });
  }
}

main();
