import { Plugin, PluginContext, CommandContext } from "@viwo/core";
import { generateText } from "ai";

export interface GenerationTemplate {
  name: string;
  description: string;
  prompt: (context: CommandContext, instruction?: string) => string;
}

const providerMap: Record<string, string> = {
  "amazon-bedrock": "@ai-sdk/amazon-bedrock",
  anthropic: "@ai-sdk/anthropic",
  assemblyai: "@ai-sdk/assemblyai",
  azure: "@ai-sdk/azure",
  baseten: "@ai-sdk/baseten",
  "black-forest-labs": "@ai-sdk/black-forest-labs",
  cerebras: "@ai-sdk/cerebras",
  cohere: "@ai-sdk/cohere",
  deepgram: "@ai-sdk/deepgram",
  deepinfra: "@ai-sdk/deepinfra",
  deepseek: "@ai-sdk/deepseek",
  elevenlabs: "@ai-sdk/elevenlabs",
  fal: "@ai-sdk/fal",
  fireworks: "@ai-sdk/fireworks",
  gateway: "@ai-sdk/gateway",
  gladia: "@ai-sdk/gladia",
  google: "@ai-sdk/google",
  "google-vertex": "@ai-sdk/google-vertex",
  groq: "@ai-sdk/groq",
  huggingface: "@ai-sdk/huggingface",
  hume: "@ai-sdk/hume",
  langchain: "@ai-sdk/langchain",
  llamaindex: "@ai-sdk/llamaindex",
  lmnt: "@ai-sdk/lmnt",
  luma: "@ai-sdk/luma",
  mistral: "@ai-sdk/mistral",
  openai: "@ai-sdk/openai",
  "openai-compatible": "@ai-sdk/openai-compatible",
  perplexity: "@ai-sdk/perplexity",
  replicate: "@ai-sdk/replicate",
  revai: "@ai-sdk/revai",
  togetherai: "@ai-sdk/togetherai",
  vercel: "@ai-sdk/vercel",
  xai: "@ai-sdk/xai",
};

async function getModel(modelSpec?: string) {
  const defaultProvider = process.env["AI_PROVIDER"] ?? "openai";
  const defaultModel = process.env["AI_MODEL"] ?? "gpt-4o";

  let providerName = defaultProvider;
  let modelName = defaultModel;

  if (modelSpec) {
    const matches = modelSpec.match(/^([^:]+):(.+)$/);
    if (matches) {
      [providerName = "", modelName = ""] = matches.slice(1);
    } else {
      modelName = modelSpec;
    }
  }

  const pkgName = providerMap[providerName];
  if (!pkgName) {
    throw new Error(`Unknown provider: ${providerName}`);
  }

  try {
    const mod = await import(pkgName);
    // Try to find the provider function (default, named export, or camelCase fallback).

    // Special cases mapping
    let exportName = providerName;
    if (providerName === "amazon-bedrock") exportName = "bedrock";
    if (providerName === "google-vertex") exportName = "vertex";
    if (providerName === "openai-compatible") exportName = "openaiCompatible";
    if (providerName === "black-forest-labs") exportName = "bfl";

    let providerFn = mod[exportName] || mod[providerName] || mod.default;

    if (!providerFn) {
      // Try camelCase for hyphenated names
      const camel = providerName.replace(
        /-([a-z])/g,
        (g) => g[1]?.toUpperCase() ?? "",
      );
      providerFn = mod[camel];
    }

    if (!providerFn) {
      throw new Error(
        `Could not find export for provider '${providerName}' in package '${pkgName}'`,
      );
    }

    return providerFn(modelName);
  } catch (e: any) {
    throw new Error(`Failed to load provider '${providerName}': ${e.message}`);
  }
}

export class AiPlugin implements Plugin {
  name = "ai";
  version = "0.1.0";
  private templates: Map<string, GenerationTemplate> = new Map();

  onLoad(ctx: PluginContext) {
    ctx.registerCommand("talk", this.handleTalk.bind(this));
    ctx.registerCommand("gen", this.handleGen.bind(this));
    ctx.registerCommand("image", this.handleImage.bind(this));

    // TODO: Remove unsafe type assertions (`as number`) etc because,
    // well, they're unsafe and will crash at runtime.
    // TODO: Switch `handleGen` to use `generateObject`.
    // This means switching templates to use JSON Schema to specify the shape.
    // Register default templates
    this.registerTemplate({
      name: "item",
      description: "Generate an item",
      prompt: (_ctx, instruction) => `
        You are a creative game master. Create a JSON object for an item based on the description: "${instruction}".
        The JSON should have: name, description, adjectives (array of strings).
        Example: {"name": "Rusty Sword", "description": "An old sword.", "adjectives": ["rusty", "sharp"]}
        Return ONLY the JSON.
      `,
    });

    this.registerTemplate({
      name: "room",
      description: "Generate a room",
      prompt: (_ctx, instruction) => `
        You are a creative game master. Create a JSON object for a room based on the description: "${instruction}".
        The JSON should have: name, description, adjectives (array of strings).
        Example: {"name": "Dark Cave", "description": "A dark and damp cave.", "adjectives": ["dark", "damp"]}
        Return ONLY the JSON.
      `,
    });
  }

  registerTemplate(template: GenerationTemplate) {
    this.templates.set(template.name, template);
  }

  async handleTalk(ctx: CommandContext) {
    const targetName = ctx.args[0];
    const message = ctx.args.slice(1).join(" ");

    if (!targetName || !message) {
      ctx.send({ type: "message", text: "Usage: talk <npc> <message>" });
      return;
    }

    // Check room contents.
    const playerEntity = ctx.core.getEntity(ctx.player.id);
    if (!playerEntity || !playerEntity["location"]) {
      ctx.send({ type: "message", text: "You are nowhere." });
      return;
    }

    const roomItems = ctx.core.getContents(playerEntity["location"] as number);
    const target = roomItems.find(
      (e: any) => e.name.toLowerCase() === targetName.toLowerCase(),
    );

    if (!target) {
      ctx.send({
        type: "message",
        text: `You don't see '${targetName}' here.`,
      });
      return;
    }

    // Check if it's an actor? Or just anything?
    // Let's allow talking to anything for now, but maybe prioritize ACTOR.

    try {
      const model = await getModel();
      const { text } = await generateText({
        model,
        system: `You are roleplaying as ${target["name"]}.\
${target["description"] ? `\nDescription: ${target["description"]}` : ""}
${
  target["adjectives"]
    ? `\nAdjectives: ${(target["adjectives"] as string[]).join(", ")}`
    : ""
}
Keep your response short and in character.`,
        prompt: message,
      });

      ctx.send({
        type: "message",
        text: `${target["name"]} says: "${text}"`,
      });
    } catch (error: any) {
      console.error("AI Error:", error);
      ctx.send({ type: "error", text: `AI Error: ${error.message}` });
    }
  }

  async handleGen(ctx: CommandContext) {
    const templateName = ctx.args[0];
    const instruction = ctx.args.slice(1).join(" ");

    if (!templateName) {
      ctx.send({
        type: "message",
        text: `Usage: gen <template> [instruction]. Available templates: ${Array.from(
          this.templates.keys(),
        ).join(", ")}`,
      });
      return;
    }

    const template = this.templates.get(templateName);
    if (!template) {
      ctx.send({
        type: "error",
        text: `Template '${templateName}' not found.`,
      });
      return;
    }

    ctx.send({ type: "message", text: "Generating..." });

    try {
      const prompt = template.prompt(ctx, instruction);
      const model = await getModel();
      // TODO: Actually the AI SDK supports JSON output
      const { text } = await generateText({
        model,
        system: "You are a JSON generator. Output valid JSON only.",
        prompt: prompt,
      });

      // Extract JSON from code block if present
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) ||
        text.match(/```\n([\s\S]*?)\n```/) || [null, text];
      const jsonStr = jsonMatch[1] || text;

      const data = JSON.parse(jsonStr);

      const playerEntity = ctx.core.getEntity(ctx.player.id);
      if (!playerEntity || !playerEntity["location"]) return;

      if (templateName === "room") {
        // Create room and exit
        // This logic is similar to 'dig' but AI generated
        // For now, just create a room and move player there?
        // Or create an item that IS a room?
        // Let's just create a room and connect it via a portal or just teleport?
        // Simpler: Create a room and move player there.
        const newRoomId = ctx.core.createEntity({
          name: data.name,
          kind: "ROOM",
          props: {
            description: data.description,
            adjectives: data.adjectives,
            custom_css: data.custom_css,
          },
        });
        ctx.core.moveEntity(ctx.player.id, newRoomId);
        const room = this.getResolvedRoom(ctx, newRoomId);
        if (room) {
          ctx.send(room);
          ctx.send({
            type: "message",
            text: `You are transported to ${data.name}.`,
          });
        }
      } else {
        // Default: Create item in current room
        ctx.core.createEntity({
          name: data.name,
          kind: "ITEM",
          location_id: playerEntity["location"],
          props: {
            description: data.description,
            adjectives: data.adjectives,
            custom_css: data.custom_css,
          },
        });
        const room = this.getResolvedRoom(
          ctx,
          playerEntity["location"] as number,
        );
        if (room) {
          ctx.send(room);
          ctx.send({ type: "message", text: `Created ${data.name}.` });
        }
      }
    } catch (error: any) {
      console.error("AI Error:", error);
      ctx.send({ type: "error", text: `AI Error: ${error.message}` });
    }
  }

  async handleImage(ctx: CommandContext) {
    const instruction = ctx.args.join(" ");

    if (!instruction) {
      ctx.send({
        type: "message",
        text: "Usage: image <description>",
      });
      return;
    }

    ctx.send({ type: "message", text: "Generating image..." });

    try {
      const model = await getModel("openai:dall-e-3");
      const { image } = await import("ai").then((m) =>
        m.experimental_generateImage({
          model,
          prompt: instruction,
          n: 1,
        }),
      );

      const base64Data = image.base64;
      const buffer = Buffer.from(base64Data, "base64");
      const filename = `${Date.now()}-${Math.random()
        .toString(36)
        .substring(7)}.png`;
      const filepath = `apps/web/public/images/${filename}`;
      const publicUrl = `/images/${filename}`;

      await Bun.write(filepath, buffer);

      // Update current room or item?
      // For now, let's update the current room's image if no target specified?
      // Or maybe just return the URL?
      // The user wants to "expose some way to generate images".
      // Let's assume we want to set it on the current room or a target.
      // Let's try to find a target like 'look' does, or default to room.

      const playerEntity = ctx.core.getEntity(ctx.player.id);
      if (!playerEntity || !playerEntity["location"]) return;

      // Simple logic: If args start with "room", update room. If "item <name>", update item.
      // But the instruction is the prompt.
      // Let's just update the current room for now as a demo, or maybe add a flag?
      // Actually, let's make it: image <target> <prompt>
      // If target is "room" or "here", update room.
      // If target matches an item, update item.

      // Re-parsing args for target
      const targetName = ctx.args[0];
      const prompt = ctx.args.slice(1).join(" ");

      if (!targetName || !prompt) {
        ctx.send({ type: "message", text: "Usage: image <target> <prompt>" });
        return;
      }

      let targetId: number | null = null;
      if (targetName === "room" || targetName === "here") {
        targetId = playerEntity["location"] as number;
      } else {
        // Find item
        const roomItems = ctx.core.getContents(
          playerEntity["location"] as number,
        );
        const item = roomItems.find(
          (i) =>
            (i["name"] as string).toLowerCase() === targetName.toLowerCase(),
        );
        if (item) targetId = item.id;
      }

      if (targetId) {
        const entity = ctx.core.getEntity(targetId);
        if (entity) {
          ctx.core.updateEntity({ ...entity, image: publicUrl });
          const room = {
            ...ctx.core.getEntity(playerEntity["location"] as number),
          };
          if (room) {
            ctx.send(room);
            ctx.send({
              type: "message",
              text: `Image generated for ${entity["name"]}.`,
            });
          }
          return;
        }
      }

      ctx.send({
        type: "message",
        text: `Could not find target '${targetName}'.`,
      });
    } catch (error: any) {
      console.error("AI Image Error:", error);
      ctx.send({ type: "error", text: `AI Image Error: ${error.message}` });
    }
  }

  async getResolvedRoom(ctx: CommandContext, roomId: number) {
    const room = ctx.core.getEntity(roomId);
    if (!room) {
      return;
    }
    const resolved = await ctx.core.resolveProps(room);
    const withContents = {
      ...resolved,
      contents: await Promise.all(
        ctx.core
          .getContents(room.id)
          .map((item) => ctx.core.resolveProps(item)),
      ),
    };
    return withContents;
  }
}
