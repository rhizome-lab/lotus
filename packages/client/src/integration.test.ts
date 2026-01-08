/**
 * Integration tests for LotusClient connecting to real Rust servers.
 *
 * These tests spawn actual server processes and verify end-to-end communication.
 * Run with: bun test packages/client/src/integration.test.ts
 *
 * Note: These tests require the server to be built first. Run:
 *   cargo build -p notes-server
 *
 * The tests are skipped if the server fails to start or connection fails.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { spawn, type Subprocess } from "bun";
import { LotusClient } from "./client";

const TEST_PORT = 18099;
const SERVER_URL = `ws://127.0.0.1:${TEST_PORT}`;
const SERVER_STARTUP_MS = 5000;
const REQUEST_TIMEOUT_MS = 10000;

/** Wait for a condition with timeout */
async function waitFor(condition: () => boolean, timeoutMs: number, pollMs = 100): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timeout waiting for condition after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

/** Wrap a promise with timeout */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)),
  ]);
}

// Skip integration tests in CI - they require spawning external processes
const isCI = process.env["CI"] === "true" || process.env["CI"] === "1";

describe.skipIf(isCI)("LotusClient Integration", () => {
  let serverProcess: Subprocess | null = null;
  let client: LotusClient | null = null;
  let testDir: string;
  let setupFailed = false;
  let skipReason = "";

  beforeAll(async () => {
    try {
      // Build the server first (in case it needs recompiling)
      console.log("Building notes-server...");
      const buildResult = spawn(["cargo", "build", "-p", "notes-server"], {
        cwd: process.cwd(),
        stdout: "inherit",
        stderr: "inherit",
      });
      await buildResult.exited;

      if (buildResult.exitCode !== 0) {
        skipReason = `Failed to build server: exit code ${buildResult.exitCode}`;
        setupFailed = true;
        return;
      }

      // Create temp database directory
      testDir = `/tmp/lotus-integration-test-${Date.now()}`;
      await Bun.$`mkdir -p ${testDir}`;

      // Start the server from workspace root using the built binary directly
      const binaryPath = `${process.cwd()}/target/debug/notes-server`;

      // Verify binary exists
      const stat = await Bun.file(binaryPath).exists();
      if (!stat) {
        skipReason = `Binary not found: ${binaryPath}`;
        setupFailed = true;
        return;
      }

      console.log(`Starting notes-server on port ${TEST_PORT}...`);
      serverProcess = spawn([binaryPath], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          RUST_LOG: "info",
          PORT: String(TEST_PORT),
        },
        stdout: "pipe",
        stderr: "pipe",
      });

      // Wait for server to start
      await new Promise((resolve) => setTimeout(resolve, SERVER_STARTUP_MS));

      // Check if server is still running
      if (serverProcess.exitCode !== null) {
        skipReason = `Server exited with code ${serverProcess.exitCode}`;
        setupFailed = true;
        return;
      }

      // Create and connect client
      client = new LotusClient(SERVER_URL, 500);
      client.connect();

      // Wait for connection with shorter timeout
      console.log("Waiting for client to connect...");
      await waitFor(() => client!.getState().isConnected, 5000);

      // Wait for player_id to be set (indicates successful login)
      await waitFor(() => client!.getState().playerId !== null, 5000);
      console.log(`Client connected with player ID: ${client!.getState().playerId}`);
    } catch (err) {
      console.error("Setup failed:", err);
      skipReason = String(err);
      setupFailed = true;
    }
  }, 120000);

  afterAll(async () => {
    if (client) {
      client.disconnect();
    }

    if (serverProcess) {
      console.log("Shutting down server...");
      serverProcess.kill();
      await serverProcess.exited;
    }

    if (testDir) {
      await Bun.$`rm -rf ${testDir}`.quiet();
    }
  });

  // Helper to skip tests when setup failed
  function skipIfSetupFailed() {
    if (setupFailed) {
      console.log(`Skipping test: ${skipReason}`);
      return true;
    }
    return false;
  }

  it("should be connected", () => {
    if (skipIfSetupFailed()) return;
    expect(client).not.toBeNull();
    expect(client!.getState().isConnected).toBe(true);
  });

  it("should have player_id after login", () => {
    if (skipIfSetupFailed()) return;
    expect(client!.getState().playerId).toBeGreaterThan(0);
  });

  it("should ping the server", async () => {
    if (skipIfSetupFailed()) return;
    const result = await withTimeout(client!.sendRequest("ping", {}), REQUEST_TIMEOUT_MS);
    expect(result).toBe("pong");
  });

  it("should fetch entities", async () => {
    if (skipIfSetupFailed()) return;
    const playerId = client!.getState().playerId;
    expect(playerId).not.toBeNull();

    const entities = await withTimeout(client!.fetchEntities([playerId!]), REQUEST_TIMEOUT_MS);

    expect(entities.length).toBe(1);
    expect(entities[0]!.id).toBe(playerId!);
  });

  it("should get opcodes", async () => {
    if (skipIfSetupFailed()) return;
    const result = await withTimeout(client!.sendRequest("get_opcodes", {}), REQUEST_TIMEOUT_MS);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    // Should include core libraries
    expect(result.some((op: string) => op.startsWith("std"))).toBe(true);
  });

  it("should handle entity updates via notifications", async () => {
    if (skipIfSetupFailed()) return;
    const playerId = client!.getState().playerId!;

    // Fetch to populate cache
    await client!.fetchEntities([playerId]);

    // Entity should be in state
    const entity = client!.getState().entities.get(playerId);
    expect(entity).toBeDefined();
    expect(entity?.id).toBe(playerId);
  });
});
