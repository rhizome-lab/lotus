import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";
import { AiPlugin } from "./index";
import { PluginContext, CommandContext } from "@viwo/core";

// Mock dependencies

const mockMemoryManager = {
  search: mock(async () => [
    { content: "Memory 1", distance: 0.1 },
    { content: "Memory 2", distance: 0.2 },
  ]),
};

const mockMemoryPlugin = {
  name: "memory",
  memoryManager: mockMemoryManager,
};

const mockContext = {
  registerCommand: () => {},
  registerRpcMethod: () => {},
  getPlugin: (name: string) => {
    if (name === "memory") return mockMemoryPlugin;
    return undefined;
  },
  core: {
    registerLibrary: () => {},
    getEntity: () => ({ id: 1, location: 2 }),
  } as never,
} as PluginContext;

// Mock 'ai' module
mock.module("ai", () => ({
  generateText: mock(async ({ system, prompt }: any) => {
    return { text: `Response to: ${prompt} with system: ${system}` };
  }),
  generateObject: mock(async () => ({ object: { completion: "mock" } })),
  embed: mock(async () => ({ embedding: [] })),
}));

describe("AiPlugin", () => {
  let aiPlugin: AiPlugin;

  beforeEach(() => {
    aiPlugin = new AiPlugin();
    aiPlugin.onLoad(mockContext);
  });

  it("should inject memories into system prompt", async () => {
    const ctx: CommandContext = {
      player: { id: 1, ws: null! },
      command: "talk",
      args: ["NPC", "Hello"],
      send: () => {},
    };

    // Mock room resolution
    spyOn(aiPlugin, "getResolvedRoom").mockReturnValue({
      id: 2,
      contents: [
        {
          id: 3,
          name: "NPC",
          description: "A friendly NPC",
          adjectives: ["friendly"],
        },
      ],
    } as any);

    await aiPlugin.handleTalk(ctx);

    // Verify memory search was called
    expect(mockMemoryManager.search).toHaveBeenCalledWith("Hello", {
      limit: 3,
    });

    // Verify generateText was called with memories in system prompt
    const generateText = (await import("ai")).generateText;
    expect(generateText).toHaveBeenCalled();
    const callArgs = (generateText as any).mock.calls[0][0];
    expect(callArgs.system).toContain("Relevant Memories:");
    expect(callArgs.system).toContain("- Memory 1");
    expect(callArgs.system).toContain("- Memory 2");
  });

  it("should stream response using stream_talk", async () => {
    const send = mock(() => {});
    const ctx: CommandContext = {
      player: { id: 1, ws: null! },
      command: "talk",
      args: [],
      send,
    };

    // Mock room resolution
    spyOn(aiPlugin, "getResolvedRoom").mockReturnValue({
      id: 2,
      contents: [
        {
          id: 3,
          name: "NPC",
          description: "A friendly NPC",
          adjectives: ["friendly"],
        },
      ],
    } as any);

    // Mock streamText
    const mockStreamText = mock(async () => ({
      textStream: (async function* () {
        yield "Hello";
        yield " world";
      })(),
    }));
    mock.module("ai", () => ({
      generateText: mock(async () => ({ text: "mock" })),
      generateObject: mock(async () => ({ object: { completion: "mock" } })),
      embed: mock(async () => ({ embedding: [] })),
      streamText: mockStreamText,
    }));

    await aiPlugin.handleStreamTalk({ targetName: "NPC", message: "Hi" }, ctx);

    // Verify streamText was called
    expect(mockStreamText).toHaveBeenCalled();

    // Verify notifications
    expect(send).toHaveBeenCalledWith("stream_start", expect.any(Object));
    expect(send).toHaveBeenCalledWith(
      "stream_chunk",
      expect.objectContaining({ chunk: 'NPC says: "' }),
    );
    expect(send).toHaveBeenCalledWith("stream_chunk", expect.objectContaining({ chunk: "Hello" }));
    expect(send).toHaveBeenCalledWith("stream_chunk", expect.objectContaining({ chunk: " world" }));
    expect(send).toHaveBeenCalledWith("stream_chunk", expect.objectContaining({ chunk: '"' }));
    expect(send).toHaveBeenCalledWith("stream_end", expect.any(Object));
  });
});
