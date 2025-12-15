import { createSignal } from "solid-js";

interface GenerationRequest {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  seed?: number;
  steps?: number;
  cfg?: number;
  [key: string]: unknown;
}

interface GenerationResult {
  image_url: string;
  seed?: number;
  request: GenerationRequest;
}

interface BatchOptions {
  onProgress?: (current: number, total: number) => void;
  onComplete?: (results: GenerationResult[]) => void;
  onError?: (error: Error, request: GenerationRequest, idx: number) => void;
  continueOnError?: boolean;
  signal?: AbortSignal;
}

/** Create prompt variations from an array of prompts */
function createPromptVariations(
  prompts: string[],
  baseParams: Partial<GenerationRequest>,
): GenerationRequest[] {
  return prompts.map((prompt) => ({
    height: 512,
    prompt,
    width: 512,
    ...baseParams,
  }));
}

/** Create seed variations of a base request */
function createSeedVariations(
  baseRequest: GenerationRequest,
  count: number,
  startSeed = 1,
): GenerationRequest[] {
  return Array.from({ length: count }, (_, idx) => ({ ...baseRequest, seed: startSeed + idx }));
}

/** Batch generation hook for generating multiple images with progress tracking */
export function useBatch(
  sendRpc: (method: string, params: any, signal?: AbortSignal) => Promise<any>,
) {
  const [isRunning, setIsRunning] = createSignal(false);
  const [progress, setProgress] = createSignal({ current: 0, total: 0 });
  const [results, setResults] = createSignal<GenerationResult[]>([]);
  const [errors, setErrors] = createSignal<
    { error: Error; request: GenerationRequest; idx: number }[]
  >([]);

  /** Generate multiple images in sequence */
  async function generateBatch(
    requests: GenerationRequest[],
    options: BatchOptions = {},
  ): Promise<GenerationResult[]> {
    setIsRunning(true);
    setProgress({ current: 0, total: requests.length });
    setResults([]);
    setErrors([]);

    const batchResults: GenerationResult[] = [];
    const batchErrors: { error: Error; request: GenerationRequest; idx: number }[] = [];

    for (let idx = 0; idx < requests.length; idx += 1) {
      // Check cancellation
      if (options.signal?.aborted) {
        break;
      }

      const request = requests[idx];
      if (!request) {
        throw new Error(`Invalid request at index ${idx}`);
      }

      try {
        // Call the diffusers.generate capability
        // oxlint-disable-next-line no-await-in-loop
        const capability = await sendRpc(
          "get_capability",
          { type: "diffusers.generate" },
          options.signal,
        );
        // oxlint-disable-next-line no-await-in-loop
        const result = await sendRpc(
          "std.call_method",
          {
            args: [
              request.prompt,
              {
                height: request.height,
                model_id: "runwayml/stable-diffusion-v1-5",
                negative_prompt: request.negativePrompt,
                num_inference_steps: request.steps ?? 50,
                seed: request.seed,
                width: request.width,
              },
            ],
            method: "generate",
            object: capability,
          },
          options.signal,
        );

        const generationResult: GenerationResult = {
          image_url: `data:image/png;base64,${result.image}`,
          request,
          seed: result.seed,
        };

        batchResults.push(generationResult);
        setResults([...batchResults]);

        setProgress({ current: idx + 1, total: requests.length });
        options.onProgress?.(idx + 1, requests.length);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        batchErrors.push({ error: err, idx, request });
        setErrors([...batchErrors]);

        options.onError?.(err, request, idx);

        if (!options.continueOnError) {
          break;
        }
      }
    }

    setIsRunning(false);
    options.onComplete?.(batchResults);

    return batchResults;
  }

  return {
    createPromptVariations,
    createSeedVariations,
    errors,
    generateBatch,
    isRunning,
    progress,
    results,
  };
}
