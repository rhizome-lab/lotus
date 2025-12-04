import { Plugin, PluginContext, CommandContext } from "@viwo/core";
import { generateText, generateObject } from "ai";
import { z } from "zod";

export interface GenerationTemplate<T = any> {
  name: string;
  description: string;
  schema: z.ZodType<T>;
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
  private templates: Map<string, GenerationTemplate<any>> = new Map();

  onLoad(ctx: PluginContext) {
    ctx.registerCommand("talk", this.handleTalk.bind(this));
    ctx.registerCommand("gen", this.handleGen.bind(this));
    ctx.registerCommand("image", this.handleImage.bind(this));

    // Register default templates
    this.registerTemplate({
      name: "item",
      description: "Generate an item",
      schema: z.object({
        name: z.string(),
        description: z.string(),
        adjectives: z.array(z.string()),
        custom_css: z.string().optional(),
      }),
      prompt: (_ctx, instruction) => `
        You are a creative game master. Create an item based on the description: "${instruction}".
      `,
    });

    this.registerTemplate({
      name: "room",
      description: "Generate a room",
      schema: z.object({
        name: z.string(),
        description: z.string(),
        adjectives: z.array(z.string()),
        custom_css: z.string().optional(),
      }),
      prompt: (_ctx, instruction) => `
        You are a creative game master. Create a room based on the description: "${instruction}".
      `,
    });
    ctx.registerRpcMethod("ai_completion", this.handleCompletion.bind(this));
  }

  registerTemplate(template: GenerationTemplate) {
    this.templates.set(template.name, template);
  }

  async handleCompletion(params: any, ctx: CommandContext) {
    const { code, position } = params; // position is { lineNumber, column }

    // Get opcode metadata to provide context about available functions
    const opcodes = ctx.core.getOpcodeMetadata();
    const functionSignatures = opcodes
      .map((op) => {
        const params = op.parameters
          ? op.parameters.map((p) => `${p.name}: ${p.type}`).join(", ")
          : "";
        return `${op.opcode}(${params}): ${op.returnType || "any"}`;
      })
      .join("\n");

    try {
      const model = await getModel();

      // Construct a prompt that asks for completion
      const prompt = `
        You are an expert ViwoScript developer. ViwoScript is a TypeScript-like scripting language.
        Provide code completion suggestions for the following code at the cursor position.
        
        Available Functions:
        ${functionSignatures}
        
        Code:
        ${code}
        
        Cursor Position: Line ${position.lineNumber}, Column ${position.column}
        
        Return a single string containing the code to complete at the cursor.
        Do NOT use placeholders like $0 or $1.
        Do NOT include markdown formatting or backticks.
        Just return the raw code to insert.
      `;

      const { object: data } = await generateObject({
        model,
        schema: z.object({
          completion: z.string(),
        }),
        prompt: prompt,
      });

      return (data as any).completion;
    } catch (error: any) {
      console.error("AI Completion Error:", error);
      return null;
    }
  }

  async handleTalk(ctx: CommandContext) {
    const targetName = ctx.args[0];
    const message = ctx.args.slice(1).join(" ");

    if (!targetName || !message) {
      ctx.send("message", "Usage: talk <npc> <message>");
      return;
    }

    // Check room contents.
    const playerEntity = ctx.core.getEntity(ctx.player.id);
    if (!playerEntity || !playerEntity["location"]) {
      ctx.send("message", "You are nowhere.");
      return;
    }

    const roomItems = this.getResolvedRoom(
      ctx,
      playerEntity["location"] as number,
    )?.contents;
    const target = roomItems?.find(
      (e: any) => e.name.toLowerCase() === targetName.toLowerCase(),
    );

    if (!target) {
      ctx.send("message", `You don't see '${targetName}' here.`);
      return;
    }

    try {
      const model = await getModel();
      const { text } = await generateText({
        model,
        system: `You are roleplaying as ${target["name"]}.\
${target["description"] ? `\nDescription: ${target["description"]}` : ""}
${target["adjectives"] ? `\nAdjectives: ${(target["adjectives"] as string[]).join(", ")}` : ""}
Keep your response short and in character.`,
        prompt: message,
      });

      ctx.send("message", `${target["name"]} says: "${text}"`);
    } catch (error: any) {
      console.error("AI Error:", error);
      ctx.send("error", `AI Error: ${error.message}`);
    }
  }

  async handleGen(ctx: CommandContext) {
    const templateName = ctx.args[0];
    const instruction = ctx.args.slice(1).join(" ");

    if (!templateName) {
      ctx.send(
        "message",
        `Usage: gen <template> [instruction]. Available templates: ${Array.from(
          this.templates.keys(),
        ).join(", ")}`,
      );
      return;
    }

    const template = this.templates.get(templateName);
    if (!template) {
      ctx.send("error", `Template '${templateName}' not found.`);
      return;
    }

    ctx.send("message", "Generating...");

    try {
      const prompt = template.prompt(ctx, instruction);
      const model = await getModel();

      const { object: data } = await generateObject({
        model,
        schema: template.schema,
        prompt: prompt,
      });

      const playerEntity = ctx.core.getEntity(ctx.player.id);
      if (!playerEntity || !playerEntity["location"]) return;

      if (templateName === "room") {
        // Create room and exit
        const newRoomId = ctx.core.createEntity({
          name: data.name,
          description: data.description,
          adjectives: data.adjectives,
          custom_css: data.custom_css,
        });
        const room = this.getResolvedRoom(ctx, newRoomId);
        if (room) {
          ctx.send("room_id", { roomId: room.id });
          ctx.send("message", `You are transported to ${data.name}.`);
        }
      } else {
        // Default: Create item in current room
        ctx.core.createEntity({
          name: data.name,
          location: playerEntity["location"],
          description: data.description,
          adjectives: data.adjectives,
          custom_css: data.custom_css,
        });
        const room = this.getResolvedRoom(
          ctx,
          playerEntity["location"] as number,
        );
        if (room) {
          ctx.send("room_id", { roomId: room.id });
          ctx.send("message", `Created ${data.name}.`);
        }
      }
    } catch (error: any) {
      console.error("AI Error:", error);
      ctx.send("error", `AI Error: ${error.message}`);
    }
  }

  async handleImage(ctx: CommandContext) {
    const instruction = ctx.args.join(" ");

    if (!instruction) {
      ctx.send("message", "Usage: image <description>");
      return;
    }

    ctx.send("message", "Generating image...");

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
      const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
      const filepath = `apps/web/public/images/${filename}`;
      const publicUrl = `/images/${filename}`;

      await Bun.write(filepath, buffer);

      // Update current room or item

      // Re-parsing args for target
      const targetName = ctx.args[0];
      const prompt = ctx.args.slice(1).join(" ");

      if (!targetName || !prompt) {
        ctx.send("message", "Usage: image <target> <prompt>");
        return;
      }

      const playerEntity = ctx.core.getEntity(ctx.player.id);
      if (!playerEntity) {
        ctx.send("message", "You are nowhere.");
        return;
      }
      let targetId: number | null = null;
      if (targetName === "room" || targetName === "here") {
        targetId = playerEntity["location"] as number;
      } else {
        // Find item
        const roomItems = this.getResolvedRoom(
          ctx,
          playerEntity["location"] as number,
        )?.contents;
        const item = roomItems?.find(
          (item) =>
            (item["name"] as string).toLowerCase() === targetName.toLowerCase(),
        );
        if (item) {
          targetId = item.id;
        }
      }

      if (targetId) {
        const entity = ctx.core.getEntity(targetId);
        if (entity) {
          ctx.core.updateEntity({ ...entity, image: publicUrl });
          const room = {
            ...ctx.core.getEntity(playerEntity["location"] as number),
          };
          if (room) {
            ctx.send("room_id", { roomId: room.id });
            ctx.send("message", `Image generated for ${entity["name"]}.`);
          }
          return;
        }
      }

      ctx.send("message", `Could not find target '${targetName}'.`);
    } catch (error: any) {
      console.error("AI Image Error:", error);
      ctx.send("error", `AI Image Error: ${error.message}`);
    }
  }

  getResolvedRoom(ctx: CommandContext, roomId: number) {
    const room = ctx.core.getEntity(roomId);
    if (!room) {
      return;
    }
    const resolved = ctx.core.resolveProps(room);
    const withContents = {
      ...resolved,
      contents: ((room["contents"] as number[]) ?? []).map((id) =>
        ctx.core.resolveProps(ctx.core.getEntity(id)!),
      ),
    };
    return withContents;
  }
}
