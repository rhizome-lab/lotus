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
  const defaultProvider = process.env.AI_PROVIDER || "openai";
  const defaultModel = process.env.AI_MODEL || "gpt-4o";

  let providerName = defaultProvider;
  let modelName = defaultModel;

  if (modelSpec) {
    if (modelSpec.includes(":")) {
      [providerName, modelName] = modelSpec.split(":");
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
    // Try to find the provider function.
    // Usually it matches the provider name (e.g. import { openai } from ...)
    // Or it might be default?
    // Or we can try to find a function export that looks like the provider name.

    // Special cases mapping
    let exportName = providerName;
    if (providerName === "amazon-bedrock") exportName = "bedrock";
    if (providerName === "google-vertex") exportName = "vertex";
    if (providerName === "openai-compatible") exportName = "openaiCompatible";
    if (providerName === "black-forest-labs") exportName = "bfl"; // Guessing?

    // Fallback: Check if there is a named export matching the key
    let providerFn = mod[exportName] || mod[providerName] || mod.default;

    // If still not found, try to find the first function export? No that's risky.
    // Let's assume standard naming for now.

    if (!providerFn) {
      // Try camelCase for hyphenated names
      const camel = providerName.replace(/-([a-z])/g, (g) =>
        g[1].toUpperCase(),
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

    // Register default templates
    this.registerTemplate({
      name: "item",
      description: "Generate an item",
      prompt: (ctx, instruction) => `
        You are a creative game master. Create a JSON object for an item based on the description: "${instruction}".
        The JSON should have: name, description, adjectives (array of strings).
        Example: {"name": "Rusty Sword", "description": "An old sword.", "adjectives": ["rusty", "sharp"]}
        Return ONLY the JSON.
      `,
    });

    this.registerTemplate({
      name: "room",
      description: "Generate a room",
      prompt: (ctx, instruction) => `
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
    if (!playerEntity || !playerEntity.location_id) {
      ctx.send({ type: "message", text: "You are nowhere." });
      return;
    }

    const roomItems = ctx.core.getContents(playerEntity.location_id);
    const target = roomItems.find(
      (e) => e.name.toLowerCase() === targetName.toLowerCase(),
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
        system: `You are roleplaying as ${target.name}. 
        Description: ${target.props.description || "A mysterious entity."}
        Adjectives: ${target.props.adjectives?.join(", ") || "none"}
        Keep your response short and in character.`,
        prompt: message,
      });

      ctx.send({
        type: "message",
        text: `${target.name} says: "${text}"`,
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
      if (!playerEntity || !playerEntity.location_id) return;

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
        ctx.core.sendRoom(newRoomId);
        ctx.send({
          type: "message",
          text: `You are transported to ${data.name}.`,
        });
      } else {
        // Default: Create item in current room
        ctx.core.createEntity({
          name: data.name,
          kind: "ITEM",
          location_id: playerEntity.location_id,
          props: {
            description: data.description,
            adjectives: data.adjectives,
            custom_css: data.custom_css,
          },
        });
        ctx.core.sendRoom(playerEntity.location_id);
        ctx.send({ type: "message", text: `Created ${data.name}.` });
      }
    } catch (error: any) {
      console.error("AI Error:", error);
      ctx.send({ type: "error", text: `AI Error: ${error.message}` });
    }
  }
}
