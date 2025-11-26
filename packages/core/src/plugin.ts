import { WebSocket } from "ws";
import { Entity } from "./repo";

export interface PlayerContext {
  id: number;
  ws: WebSocket;
}

export interface CommandContext {
  player: PlayerContext;
  command: string;
  args: any[];
  send: (msg: any) => void;
  // Core methods exposed to plugins
  core: {
    getEntity: (id: number) => Entity | null;
    getContents: (id: number) => Entity[];
    moveEntity: (id: number, destId: number, detail?: string | null) => void;
    createEntity: (data: any) => number;
    updateEntity: (id: number, data: any) => void;
    sendRoom: (roomId: number) => void;
  };
}

export interface Plugin {
  name: string;
  version: string;
  onLoad: (ctx: PluginContext) => void | Promise<void>;
  onUnload?: () => void | Promise<void>;
}

export interface PluginContext {
  registerCommand: (
    command: string,
    handler: (ctx: CommandContext) => void | Promise<void>,
  ) => void;
}

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
