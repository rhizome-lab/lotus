import { CoreInterface } from "./types";

/** Context representing a connected player. */
interface PlayerContext {
  id: number;
  ws: WebSocket;
}

/**
 * Context passed to command handlers.
 * Provides access to the player, the command arguments, and core API methods.
 */
export interface CommandContext {
  player: PlayerContext;
  command: string;
  args: any[];
  send: (type: string, payload: unknown) => void;
}

/**
 * Interface that all plugins must implement.
 */
export interface Plugin {
  name: string;
  version: string;
  /** Called when the plugin is loaded. Use this to register commands. */
  onLoad: (ctx: PluginContext) => void | Promise<void>;
  /** Called when the plugin is unloaded. Clean up resources here. */
  onUnload?: () => void | Promise<void>;
}

/**
 * Context passed to the plugin's onLoad method.
 * Allows the plugin to interact with the core system.
 */
export interface PluginContext {
  /** Registers a new command handler */
  registerCommand: (
    command: string,
    handler: (ctx: CommandContext) => void | Promise<void>,
  ) => void;
  /** Registers a new RPC method */
  registerRpcMethod: (
    method: string,
    handler: (params: any, ctx: CommandContext) => Promise<any>,
  ) => void;
  /** Gets a currently active plugin by name. */
  getPlugin: (name: string) => Plugin | undefined;
  /** Core interface for accessing system functionality */
  core: CoreInterface;
}

/** Manages the lifecycle of plugins and delegates commands to them. */
export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private commands: Map<string, (ctx: CommandContext) => void | Promise<void>> = new Map();
  private rpcMethods: Map<string, (params: any, ctx: CommandContext) => Promise<any>> = new Map();
  private core: CoreInterface;

  constructor(core: CoreInterface) {
    this.core = core;
  }

  /**
   * Loads a plugin and registers its commands.
   *
   * @param plugin - The plugin to load.
   */
  async loadPlugin(plugin: Plugin) {
    console.log(`Loading plugin: ${plugin.name} v${plugin.version}`);
    const context: PluginContext = {
      registerCommand: (cmd, handler) => {
        console.log(`Plugin '${plugin.name}' registered command: ${cmd}`);
        this.commands.set(cmd, handler);
      },
      registerRpcMethod: (method, handler) => {
        console.log(`Plugin '${plugin.name}' registered RPC method: ${method}`);
        this.rpcMethods.set(method, handler);
      },
      getPlugin: (name) => this.plugins.get(name),
      core: this.core,
    };

    await plugin.onLoad(context);
    this.plugins.set(plugin.name, plugin);
  }

  /**
   * Delegates a command to the registered handler.
   *
   * @param ctx - The command context.
   * @returns True if the command was handled, false otherwise.
   */
  async handleCommand(ctx: CommandContext): Promise<boolean> {
    const handler = this.commands.get(ctx.command);
    if (handler) {
      await handler(ctx);
      return true;
    }
    return false;
  }

  /**
   * Delegates an RPC method call to the registered handler.
   *
   * @param method - The RPC method name.
   * @param params - The parameters for the method.
   * @param ctx - The command context (reused for RPC to provide player/core access).
   * @returns The result of the RPC call.
   */
  async handleRpcMethod(method: string, params: any, ctx: CommandContext): Promise<any> {
    const handler = this.rpcMethods.get(method);
    if (handler) {
      return await handler(params, ctx);
    }
    throw new Error(`RPC method '${method}' not found.`);
  }
}
