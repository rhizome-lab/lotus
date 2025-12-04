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

  test("Register and Handle RPC Method", async () => {
    const manager = new PluginManager();
    const handler = mock(async (params: any) => {
      return { result: params.value * 2 };
    });

    const testPlugin: Plugin = {
      name: "RpcPlugin",
      version: "1.0.0",
      onLoad: (ctx) => {
        ctx.registerRpcMethod("double", handler);
      },
    };

    await manager.loadPlugin(testPlugin);

    const cmdCtx: CommandContext = {
      command: "rpc",
      args: [],
      player: { id: 1, ws: {} as any },
      send: () => {},
      core: {} as any,
    };

    const result = await manager.handleRpcMethod(
      "double",
      { value: 21 },
      cmdCtx,
    );
    expect(result).toEqual({ result: 42 });
    expect(handler).toHaveBeenCalledWith({ value: 21 }, cmdCtx);
  });
});
