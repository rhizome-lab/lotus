import { WebSocket } from "ws";
import { Entity } from "./repo";

/**
 * Context representing a connected player.
 */
export interface PlayerContext {
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
  send: (msg: any) => void;
  /** Core methods exposed to plugins */
  core: {
    getEntity: (id: number) => Entity | null;
    getContents: (id: number) => Entity[];
    moveEntity: (id: number, destId: number, detail?: string | null) => void;
    createEntity: (data: any) => number;
    updateEntity: (id: number, data: any) => void;
    deleteEntity: (id: number) => void;
    sendRoom: (roomId: number) => void;
    canEdit: (playerId: number, entityId: number) => boolean;
  };
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
}

/**
 * Manages the lifecycle of plugins and delegates commands to them.
 */
export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private commands: Map<string, (ctx: CommandContext) => void | Promise<void>> =
    new Map();

  constructor() {}

  async loadPlugin(plugin: Plugin) {
    console.log(`Loading plugin: ${plugin.name} v${plugin.version}`);
    const context: PluginContext = {
      registerCommand: (cmd, handler) => {
        console.log(`Plugin '${plugin.name}' registered command: ${cmd}`);
        this.commands.set(cmd, handler);
      },
    };

    await plugin.onLoad(context);
    this.plugins.set(plugin.name, plugin);
  }

  async handleCommand(ctx: CommandContext): Promise<boolean> {
    const handler = this.commands.get(ctx.command);
    if (handler) {
      await handler(ctx);
      return true;
    }
    return false;
  }
}
