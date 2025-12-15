import { createSignal } from "solid-js";

interface GenerationRequest {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  x: number;
  y: number;
  seed?: number;
}

export function useGeneration(
  sendRpc: (method: string, params: any, signal?: AbortSignal) => Promise<any>,
) {
  const [generating, setGenerating] = createSignal(false);
  const [queue, setQueue] = createSignal<GenerationRequest[]>([]);

  async function generate(request: GenerationRequest): Promise<string> {
    setGenerating(true);
    setQueue([...queue(), request]);

    try {
      // Call the diffusers capability through plugin_rpc
      const result = await sendRpc("plugin_rpc", {
        method: "diffusers.generate",
        params: {
          height: request.height,
          negative_prompt: request.negativePrompt,
          prompt: request.prompt,
          seed: request.seed,
          width: request.width,
        },
      });

      // Remove from queue
      setQueue(queue().filter((r) => r !== request));
      setGenerating(false);

      return result.image_url;
    } catch (error) {
      console.error("Generation failed:", error);
      setQueue(queue().filter((r) => r !== request));
      setGenerating(false);
      throw error;
    }
  }

  return {
    generate,
    generating,
    queue,
  };
}
