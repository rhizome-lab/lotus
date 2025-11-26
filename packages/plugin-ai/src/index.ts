import { Plugin, PluginContext, CommandContext } from "@viwo/core";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

export interface GenerationTemplate {
  name: string;
  description: string;
  prompt: (context: CommandContext, instruction?: string) => string;
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

    if (!process.env.OPENAI_API_KEY) {
      ctx.send({
        type: "message",
        text: "AI is not configured (missing OPENAI_API_KEY).",
      });
      return;
    }

    try {
      const { text } = await generateText({
        model: openai("gpt-4o"),
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
    } catch (error) {
      console.error("AI Error:", error);
      ctx.send({ type: "error", text: "Failed to generate dialogue." });
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

    if (!process.env.OPENAI_API_KEY) {
      ctx.send({
        type: "message",
        text: "AI is not configured (missing OPENAI_API_KEY).",
      });
      return;
    }

    ctx.send({ type: "message", text: "Generating..." });

    try {
      const prompt = template.prompt(ctx, instruction);
      const { text } = await generateText({
        model: openai("gpt-4o"),
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
    } catch (error) {
      console.error("AI Error:", error);
      ctx.send({ type: "error", text: "Failed to generate entity." });
    }
  }
}
