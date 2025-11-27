import { describe, test, expect, mock } from "bun:test";
import { PluginManager, Plugin, CommandContext } from "./plugin";

describe("PluginManager", () => {
  test("Load Plugin and Register Command", async () => {
    const manager = new PluginManager();
    const handler = mock(() => {});

    const testPlugin: Plugin = {
      name: "TestPlugin",
      version: "1.0.0",
      onLoad: (ctx) => {
        ctx.registerCommand("test", handler);
      },
    };

    await manager.loadPlugin(testPlugin);

    const cmdCtx: CommandContext = {
      command: "test",
      args: [],
      player: { id: 1, ws: {} as any },
      send: () => {},
      core: {} as any,
    };

    const handled = await manager.handleCommand(cmdCtx);
    expect(handled).toBe(true);
    expect(handler).toHaveBeenCalledWith(cmdCtx);
  });

  test("Handle Unknown Command", async () => {
    const manager = new PluginManager();
    const cmdCtx: CommandContext = {
      command: "unknown",
      args: [],
      player: { id: 1, ws: {} as any },
      send: () => {},
      core: {} as any,
    };

    const handled = await manager.handleCommand(cmdCtx);
    expect(handled).toBe(false);
  });
});
