import { For, Show, createEffect, createSignal, onMount } from "solid-js";
import type { ScriptValue } from "@viwo/scripting";
import { exportAsViwoScript } from "../engine/canvas/scriptExporter";
import { useCanvas } from "../engine/canvas/useCanvas";
import { useGeneration } from "../utils/useGeneration";
import { useViwoConnection } from "../utils/viwo-connection";
import { useBatch } from "../utils/batchGeneration";

// Helper functions for blob/base64 conversion
function canvasToBlob(canvasElement: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvasElement.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Failed to convert canvas to blob"));
      }
    });
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("loadend", () => {
      resolve((reader.result as string).replace(/^[^,+],/, ""));
    });
    reader.addEventListener("error", () => {
      reject(reader.error);
    });
    reader.readAsDataURL(blob);
  });
}

interface LayerModeProps {
  initialScript?: ScriptValue<unknown>;
  onScriptChange?: (script: ScriptValue<unknown>) => void;
}

function LayerMode(props: LayerModeProps = {}) {
  const canvas = useCanvas(1024, 1024);
  const { sendRpc } = useViwoConnection();
  const generation = useGeneration(sendRpc);
  const batch = useBatch(sendRpc);

  // Sync script changes with parent
  createEffect(() => {
    props.onScriptChange?.(canvas.script());
  });

  const [prompt, setPrompt] = createSignal("");
  const [negativePrompt, setNegativePrompt] = createSignal("");
  const [controlTypes, setControlTypes] = createSignal<
    { type: string; label: string; description: string }[]
  >([]);
  const [outpaintDir, setOutpaintDir] = createSignal<"left" | "right" | "top" | "bottom">("right");
  const [outpaintPixels, setOutpaintPixels] = createSignal(256);

  // Model selection and advanced parameters
  const [currentModel, setCurrentModel] = createSignal("runwayml/stable-diffusion-v1-5");
  const isSDXL = () => currentModel().toLowerCase().includes("xl");

  // Multi-prompts (with smart defaults)
  const [useMultiPrompts, setUseMultiPrompts] = createSignal(false);
  const [prompt2, setPrompt2] = createSignal("");
  const [negativePrompt2, setNegativePrompt2] = createSignal("");

  // Auto-fill prompt_2 when enabled
  createEffect(() => {
    if (useMultiPrompts() && !prompt2()) {
      setPrompt2(prompt());
    }
  });
  createEffect(() => {
    if (useMultiPrompts() && !negativePrompt2()) {
      setNegativePrompt2(negativePrompt());
    }
  });

  // Advanced parameters
  const [showAdvanced, setShowAdvanced] = createSignal(false);
  const [strength, setStrength] = createSignal(0.8);
  const [steps, setSteps] = createSignal(50);
  const [cfg, setCfg] = createSignal(7.5);

  // Upscale mode
  const [upscaleMode, setUpscaleMode] = createSignal<"esrgan" | "traditional" | "img2img">(
    "traditional",
  );
  const [upscaleMethod, setUpscaleMethod] = createSignal<
    "nearest" | "bilinear" | "bicubic" | "lanczos" | "area"
  >("lanczos");
  const [upscaleFactor, setUpscaleFactor] = createSignal<2 | 4>(2);

  // Compute tracking
  const [maxCompute, setMaxCompute] = createSignal(100);
  const computeCost = () => {
    const box = canvas.bbox();
    if (!box) {
      return 0;
    }
    return (box.width * box.height * steps()) / 1_000_000;
  };

  // ControlNet state
  const [controlNetStrength, setControlNetStrength] = createSignal(1);
  const [preprocessingLayerId, setPreprocessingLayerId] = createSignal<string | null>(null);

  // oxlint-disable-next-line no-unassigned-vars
  let canvasRef: HTMLCanvasElement | undefined;
  // oxlint-disable-next-line no-unassigned-vars
  let overlayRef: HTMLCanvasElement | undefined;

  onMount(async () => {
    canvas.addLayer("Background");
    if (canvasRef) {
      canvas.setCompositeCanvas(canvasRef);
    }

    // Fetch available ControlNet types
    try {
      const capability = await sendRpc("get_capability", { type: "controlnet.generate" });
      const types = await sendRpc("std.call_method", {
        args: [],
        method: "getAvailableTypes",
        object: capability,
      });
      setControlTypes(types);
    } catch (error) {
      console.error("Failed to fetch ControlNet types:", error);
    }
  });

  createEffect(() => {
    canvas.composite();
  });

  createEffect(() => {
    if (!overlayRef) {
      return;
    }

    const ctx = overlayRef.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, 1024, 1024);

    const box = canvas.bboxDraft() ?? canvas.bbox();
    if (box && canvas.tool() === "bbox") {
      ctx.strokeStyle = "#00ffff";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(box.x, box.y, box.width, box.height);
    }
  });

  let startPos = { x: 0, y: 0 };

  function handleMouseDown(e: MouseEvent) {
    const rect = canvasRef?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (canvas.tool() === "bbox") {
      startPos = { x, y };
      canvas.setBboxDraft({ height: 0, width: 0, x, y });
    } else {
      canvas.startDrawing(x, y);
    }
  }

  function handleMouseMove(e: MouseEvent) {
    const rect = canvasRef?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (canvas.tool() === "bbox" && canvas.bboxDraft()) {
      canvas.setBboxDraft({
        height: Math.abs(y - startPos.y),
        width: Math.abs(x - startPos.x),
        x: Math.min(startPos.x, x),
        y: Math.min(startPos.y, y),
      });
    } else {
      canvas.draw(x, y);
    }
  }

  function handleMouseUp() {
    if (canvas.tool() === "bbox" && canvas.bboxDraft()) {
      canvas.setBbox(canvas.bboxDraft());
      canvas.setBboxDraft(null);
    }
    canvas.stopDrawing();
  }

  async function handleGenerate() {
    const box = canvas.bbox();
    if (!box || !prompt()) {
      return;
    }

    try {
      // Check for visible control layers
      const controlLayers = canvas.layers().filter((l) => l.type === "control" && l.visible);

      if (controlLayers.length > 0) {
        // ControlNet generation
        // For now, use the first control layer (TODO: support multiple)
        const [controlLayer] = controlLayers;

        if (!controlLayer.controlType) {
          alert("Control layer missing type information");
          return;
        }

        // Convert control layer canvas to blob and base64
        const controlBlob = await canvasToBlob(controlLayer.canvas);
        const controlB64 = await blobToBase64(controlBlob);

        // Get ControlNet capability
        const capability = await sendRpc("get_capability", { type: "controlnet.generate" });

        // Build params object for ControlNet
        const params: any = {
          guidance_scale: cfg(),
          num_inference_steps: steps(),
          strength: controlNetStrength(),
        };

        if (negativePrompt()) {
          params.negative_prompt = negativePrompt();
        }

        // Call apply method with control image and params
        const result = await sendRpc("std.call_method", {
          args: [controlB64, prompt(), controlLayer.controlType, params],
          method: "apply",
          object: capability,
        });

        // Load result to new layer
        const layerId = canvas.addLayer("ControlNet Generated");
        const resultImg = `data:image/png;base64,${result.image}`;
        canvas.loadImageToLayer(layerId, resultImg, box.x, box.y);
      } else {
        // Standard generation (no ControlNet)
        const imageUrl = await generation.generate({
          cfg: cfg(),
          height: Math.max(64, Math.round(box.height / 8) * 8),
          negativePrompt: negativePrompt(),
          prompt: prompt(),
          width: Math.max(64, Math.round(box.width / 8) * 8),
          x: box.x,
          y: box.y,
        });

        const layerId = canvas.addLayer("Generated");
        canvas.loadImageToLayer(layerId, imageUrl, box.x, box.y);
      }
    } catch (error) {
      console.error("Generation error:", error);
      alert(`Generation failed: ${error}`);
    }
  }

  function hasMaskLayer() {
    return canvas.layers().some((l) => l.type === "mask");
  }

  async function handleInpaint() {
    const maskLayer = canvas.layers().find((l) => l.type === "mask");
    const targetLayer = maskLayer?.maskFor
      ? canvas.layers().find((l) => l.id === maskLayer.maskFor)
      : canvas.layers().find((l) => l.type === "raster");

    if (!maskLayer || !targetLayer || !prompt()) {
      alert("Need a mask layer, target layer, and prompt to inpaint");
      return;
    }

    try {
      const imageBlob = await canvasToBlob(targetLayer.canvas);
      const maskBlob = await canvasToBlob(maskLayer.canvas);
      const imageB64 = await blobToBase64(imageBlob);
      const maskB64 = await blobToBase64(maskBlob);

      // Build params object
      const params: any = {
        guidance_scale: cfg(),
        model_id: currentModel(),
        num_inference_steps: steps(),
        strength: strength(),
      };

      if (negativePrompt()) {
        params.negative_prompt = negativePrompt();
      }

      // Add SDXL multi-prompts if enabled
      if (isSDXL() && useMultiPrompts()) {
        if (prompt2()) {
          params.prompt_2 = prompt2();
        }
        if (negativePrompt2()) {
          params.negative_prompt_2 = negativePrompt2();
        }
      }

      params.max_compute = maxCompute();

      const capability = await sendRpc("get_capability", { type: "diffusers.inpaint" });
      const result = await sendRpc("std.call_method", {
        args: [imageB64, maskB64, prompt(), params],
        method: "inpaint",
        object: capability,
      });

      // Load result back to target layer
      const resultImg = `data:image/png;base64,${result.image}`;
      canvas.loadImageToLayer(targetLayer.id, resultImg, 0, 0);
    } catch (error) {
      console.error("Inpaint error:", error);
      alert(`Inpaint failed: ${error}`);
    }
  }

  async function handleOutpaint() {
    const activeLayer = canvas.layers().find((l) => l.id === canvas.activeLayerId());
    if (!activeLayer || !prompt()) {
      alert("Need an active layer and prompt to outpaint");
      return;
    }

    try {
      const imageBlob = await canvasToBlob(activeLayer.canvas);
      const imageB64 = await blobToBase64(imageBlob);

      // Build params object
      const params: any = {
        guidance_scale: cfg(),
        model_id: currentModel(),
        num_inference_steps: steps(),
        strength: strength(),
      };

      if (negativePrompt()) {
        params.negative_prompt = negativePrompt();
      }

      // Add SDXL multi-prompts if enabled
      if (isSDXL() && useMultiPrompts()) {
        if (prompt2()) {
          params.prompt_2 = prompt2();
        }
        if (negativePrompt2()) {
          params.negative_prompt_2 = negativePrompt2();
        }
      }

      params.max_compute = maxCompute();

      const capability = await sendRpc("get_capability", { type: "diffusers.inpaint" });
      const result = await sendRpc("std.call_method", {
        args: [imageB64, outpaintDir(), outpaintPixels(), prompt(), params],
        method: "outpaint",
        object: capability,
      });

      // Create new layer with outpainted result
      const newLayerId = canvas.addLayer(`Outpainted (${outpaintDir()})`);
      const resultImg = `data:image/png;base64,${result.image}`;
      canvas.loadImageToLayer(newLayerId, resultImg, 0, 0);
    } catch (error) {
      console.error("Outpaint error:", error);
      alert(`Outpaint failed: ${error}`);
    }
  }

  async function handleUpscale(layerId: string, factor: 2 | 4) {
    const layer = canvas.layers().find((l) => l.id === layerId);
    if (!layer) {
      return;
    }

    try {
      const imageBlob = await canvasToBlob(layer.canvas);
      const imageB64 = await blobToBase64(imageBlob);

      const capability = await sendRpc("get_capability", { type: "diffusers.upscale" });
      let result;
      let methodLabel = "";

      if (upscaleMode() === "traditional") {
        // Traditional upscaling (fast)
        result = await sendRpc("std.call_method", {
          args: [
            imageB64,
            {
              factor: upscaleFactor(),
              method: upscaleMethod(),
            },
          ],
          method: "upscaleTraditional",
          object: capability,
        });
        methodLabel = `${upscaleMethod()} ${upscaleFactor()}x`;
      } else if (upscaleMode() === "img2img") {
        // Hybrid img2img upscaling
        if (!prompt()) {
          alert("Img2img upscaling requires a prompt");
          return;
        }
        result = await sendRpc("std.call_method", {
          args: [
            imageB64,
            prompt(),
            {
              denoise_strength: 0.3,
              factor: upscaleFactor(),
              guidance_scale: cfg(),
              model_id: currentModel(),
              negative_prompt: negativePrompt(),
              num_inference_steps: 20,
              upscale_method: upscaleMethod(),
            },
          ],
          method: "upscaleImg2Img",
          object: capability,
        });
        methodLabel = `Hybrid ${upscaleFactor()}x`;
      } else {
        // ESRGAN (diffusion-based)
        result = await sendRpc("std.call_method", {
          args: [imageB64, "realesrgan", factor],
          method: "upscale",
          object: capability,
        });
        methodLabel = `${upscaleMode().toUpperCase()} ${factor}x`;
      }

      // Create new layer with upscaled result
      const newLayerId = canvas.addLayer(`${layer.name} (${methodLabel})`);
      const resultImg = `data:image/png;base64,${result.image}`;
      canvas.loadImageToLayer(newLayerId, resultImg, 0, 0);
    } catch (error) {
      console.error("Upscale error:", error);
      alert(`Upscale failed: ${error}`);
    }
  }

  async function handlePreprocess(layerId: string) {
    const layer = canvas.layers().find((l) => l.id === layerId);
    if (!layer || layer.type !== "control" || !layer.controlType) {
      return;
    }

    // Scribble layers don't need preprocessing
    if (layer.controlType === "scribble") {
      alert("Scribble layers don't require preprocessing - draw directly!");
      return;
    }

    try {
      setPreprocessingLayerId(layerId);

      // Convert canvas to blob and base64
      const imageBlob = await canvasToBlob(layer.canvas);
      const imageB64 = await blobToBase64(imageBlob);

      // Get ControlNet capability
      const capability = await sendRpc("get_capability", { type: "controlnet.generate" });

      // Call preprocess method
      const result = await sendRpc("std.call_method", {
        args: [imageB64, layer.controlType],
        method: "preprocess",
        object: capability,
      });

      // Load preprocessed image back to layer
      const resultImg = `data:image/png;base64,${result.image}`;
      canvas.loadImageToLayer(layerId, resultImg, 0, 0);
    } catch (error) {
      console.error("Preprocess error:", error);
      alert(`Preprocessing failed: ${error}`);
    } finally {
      setPreprocessingLayerId(null);
    }
  }

  return (
    <div class="layer-mode">
      <div class="layer-mode__sidebar">
        <h3>Tools</h3>
        <div class="layer-mode__tools">
          <button
            class={`glass-button ${canvas.tool() === "brush" ? "glass-button--primary" : ""}`}
            onClick={() => canvas.setTool("brush")}
          >
            🖌️ Brush
          </button>
          <button
            class={`glass-button ${canvas.tool() === "eraser" ? "glass-button--primary" : ""}`}
            onClick={() => canvas.setTool("eraser")}
          >
            🧹 Eraser
          </button>
          <button
            class={`glass-button ${canvas.tool() === "bbox" ? "glass-button--primary" : ""}`}
            onClick={() => canvas.setTool("bbox")}
          >
            ⬜ Select
          </button>
          <button
            class="glass-button"
            onClick={() => {
              canvas.addMaskLayer("Mask", canvas.activeLayerId() ?? undefined);
            }}
          >
            🎭 Add Mask
          </button>
        </div>

        <Show when={canvas.tool() !== "bbox"}>
          <div class="layer-mode__tool-options">
            <label>
              Size: {canvas.brushSize()}
              <input
                type="range"
                min="1"
                max="50"
                value={canvas.brushSize()}
                onInput={(e) => canvas.setBrushSize(Number(e.currentTarget.value))}
              />
            </label>

            <Show when={canvas.tool() === "brush"}>
              <label>
                Color:
                <input
                  type="color"
                  value={canvas.color()}
                  onInput={(e) => canvas.setColor(e.currentTarget.value)}
                />
              </label>
            </Show>
          </div>
        </Show>

        <Show when={canvas.tool() === "bbox" && canvas.bbox()}>
          <div class="layer-mode__generation glass-panel">
            <h4>Generate</h4>
            <textarea
              class="layer-mode__prompt"
              placeholder="Enter your prompt..."
              value={prompt()}
              onInput={(e) => setPrompt(e.currentTarget.value)}
            />
            <textarea
              class="layer-mode__prompt"
              placeholder="Negative prompt (optional)..."
              value={negativePrompt()}
              onInput={(e) => setNegativePrompt(e.currentTarget.value)}
            />
            {/* ControlNet indicator and strength */}
            <Show when={canvas.layers().some((l) => l.type === "control" && l.visible)}>
              <div class="layer-mode__controlnet-info">
                <span>🎛️ ControlNet Active</span>
                <label>
                  Strength: {controlNetStrength()}
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={controlNetStrength()}
                    onInput={(e) => setControlNetStrength(Number(e.currentTarget.value))}
                  />
                </label>
              </div>
            </Show>
            <button
              class="glass-button glass-button--primary"
              disabled={!prompt() || generation.generating()}
              onClick={handleGenerate}
            >
              {generation.generating() ? "Generating..." : "Generate"}
            </button>
          </div>
        </Show>

        <Show when={hasMaskLayer()}>
          <div class="layer-mode__generation glass-panel">
            <h4>Inpaint</h4>

            {/* Model selection */}
            <select
              class="glass-select"
              value={currentModel()}
              onChange={(e) => setCurrentModel(e.currentTarget.value)}
            >
              <option value="runwayml/stable-diffusion-v1-5">SD 1.5</option>
              <option value="runwayml/stable-diffusion-inpainting">SD 1.5 Inpaint</option>
              <option value="stabilityai/stable-diffusion-xl-base-1.0">SDXL</option>
              <option value="stabilityai/stable-diffusion-xl-inpainting">SDXL Inpaint</option>
            </select>

            <textarea
              class="layer-mode__prompt"
              placeholder="Prompt..."
              value={prompt()}
              onInput={(e) => setPrompt(e.currentTarget.value)}
            />
            <textarea
              class="layer-mode__prompt"
              placeholder="Negative prompt (optional)..."
              value={negativePrompt()}
              onInput={(e) => setNegativePrompt(e.currentTarget.value)}
            />

            {/* SDXL Multi-prompt toggle */}
            <Show when={isSDXL()}>
              <label class="layer-mode__checkbox">
                <input
                  type="checkbox"
                  checked={useMultiPrompts()}
                  onChange={(e) => setUseMultiPrompts(e.currentTarget.checked)}
                />
                Use 2nd prompts (SDXL)
              </label>

              <Show when={useMultiPrompts()}>
                <textarea
                  class="layer-mode__prompt"
                  placeholder="Prompt 2 (defaults to primary)..."
                  value={prompt2()}
                  onInput={(e) => setPrompt2(e.currentTarget.value)}
                />
                <textarea
                  class="layer-mode__prompt"
                  placeholder="Negative 2 (defaults to primary)..."
                  value={negativePrompt2()}
                  onInput={(e) => setNegativePrompt2(e.currentTarget.value)}
                />
              </Show>
            </Show>

            {/* Advanced parameters toggle */}
            <button class="glass-button" onClick={() => setShowAdvanced(!showAdvanced())}>
              {showAdvanced() ? "▼" : "▶"} Advanced (Compute: {computeCost().toFixed(2)} /{" "}
              {maxCompute()})
            </button>

            <Show when={showAdvanced()}>
              <div class="layer-mode__advanced">
                <label>
                  Strength: {strength().toFixed(2)}
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={strength()}
                    onInput={(e) => setStrength(Number(e.currentTarget.value))}
                  />
                </label>
                <label>
                  Steps: {steps()}
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="5"
                    value={steps()}
                    onInput={(e) => setSteps(Number(e.currentTarget.value))}
                  />
                </label>
                <label>
                  CFG Scale: {cfg().toFixed(1)}
                  <input
                    type="range"
                    min="1"
                    max="20"
                    step="0.5"
                    value={cfg()}
                    onInput={(e) => setCfg(Number(e.currentTarget.value))}
                  />
                </label>
              </div>
            </Show>

            <button
              class="glass-button glass-button--primary"
              disabled={!prompt() || generation.generating() || computeCost() > maxCompute()}
              onClick={handleInpaint}
            >
              {generation.generating() ? "Inpainting..." : "Inpaint"}
            </button>
          </div>
        </Show>

        <div class="layer-mode__outpaint glass-panel">
          <h4>Outpaint</h4>
          <select
            class="glass-select"
            value={outpaintDir()}
            onChange={(e) => setOutpaintDir(e.currentTarget.value as any)}
          >
            <option value="left">← Extend Left</option>
            <option value="right">→ Extend Right</option>
            <option value="top">↑ Extend Top</option>
            <option value="bottom">↓ Extend Bottom</option>
          </select>
          <input
            type="number"
            value={outpaintPixels()}
            onInput={(e) => setOutpaintPixels(Number(e.currentTarget.value))}
            min="64"
            max="512"
            step="64"
            class="glass-input"
          />
          <button
            class="glass-button"
            onClick={handleOutpaint}
            disabled={generation.generating() || !prompt()}
          >
            Outpaint
          </button>
        </div>

        {/* Batch Generation Panel */}
        <div class="layer-mode__batch glass-panel">
          <h4>Batch Generation</h4>
          <label>
            Seed Count:
            <input
              type="number"
              value={4}
              min="1"
              max="20"
              class="glass-input"
              onInput={(e) => {
                const count = Number(e.currentTarget.value);
                // Store in local state if needed
              }}
            />
          </label>

          <button
            class="glass-button glass-button--primary"
            disabled={!prompt() || batch.isRunning()}
            onClick={async () => {
              if (!prompt()) {
                return;
              }

              const requests = batch.createSeedVariations(
                {
                  prompt: prompt(),
                  negativePrompt: negativePrompt(),
                  width: 1024,
                  height: 1024,
                  steps: steps(),
                  cfg: cfg(),
                },
                4, // seed count
              );

              await batch.generateBatch(requests, {
                continueOnError: true,
              });
            }}
          >
            {batch.isRunning() ? "Generating..." : "Generate Batch"}
          </button>

          <Show when={batch.isRunning()}>
            <div class="layer-mode__batch-progress">
              <progress value={batch.progress().current} max={batch.progress().total} />
              <span>
                {batch.progress().current} / {batch.progress().total}
              </span>
            </div>
          </Show>

          <Show when={batch.results().length > 0}>
            <div class="layer-mode__batch-results">
              <For each={batch.results()}>
                {(result) => (
                  <img
                    src={result.image_url}
                    alt={`Batch result seed ${result.seed}`}
                    onClick={() => {
                      const layerId = canvas.addLayer(`Batch ${result.seed}`);
                      canvas.loadImageToLayer(layerId, result.image_url, 0, 0);
                    }}
                    title="Click to add to canvas"
                  />
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>

      <div class="layer-mode__canvas">
        <div class="layer-mode__canvas-wrapper">
          <canvas
            ref={canvasRef}
            width={1024}
            height={1024}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            class={`layer-mode__canvas-main layer-mode__canvas-main--${canvas.tool()}`}
          />
          <canvas ref={overlayRef} width={1024} height={1024} class="layer-mode__canvas-overlay" />
        </div>
      </div>

      <div class="layer-mode__panels">
        <h3>Layers</h3>
        <button
          class="glass-button"
          onClick={() => canvas.addLayer(`Layer ${canvas.layers().length + 1}`)}
        >
          + Add Layer
        </button>

        <Show when={controlTypes().length > 0}>
          <select
            class="glass-select"
            onChange={(e) => {
              const type = e.currentTarget.value;
              if (type) {
                const typeInfo = controlTypes().find((ct) => ct.type === type);
                canvas.addControlLayer(typeInfo?.label ?? "Control", type);
                e.currentTarget.value = ""; // Reset selection
              }
            }}
          >
            <option value="">+ Add Control Layer</option>
            <For each={controlTypes()}>
              {(ct) => (
                <option value={ct.type} title={ct.description}>
                  {ct.label}
                </option>
              )}
            </For>
          </select>
        </Show>

        <button class="glass-button" onClick={() => exportAsViwoScript(canvas.script())}>
          📥 Export Script
        </button>

        <div class="layer-mode__layer-list">
          <For each={canvas.layers()}>
            {(layer) => (
              <div
                class={`layer-mode__layer-item ${
                  canvas.activeLayerId() === layer.id ? "layer-mode__layer-item--active" : ""
                }`}
                onClick={() => canvas.setActiveLayerId(layer.id)}
              >
                <span>
                  {layer.type === "control" ? "🎛️ " : ""}
                  {layer.name}
                  {layer.controlType ? ` (${layer.controlType})` : ""}
                </span>
                <div class="layer-mode__layer-controls">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      canvas.updateLayer(layer.id, { visible: !layer.visible });
                    }}
                  >
                    {layer.visible ? "👁️" : "🚫"}
                  </button>
                  {/* Preprocess button for control layers */}
                  <Show when={layer.type === "control" && layer.controlType !== "scribble"}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePreprocess(layer.id);
                      }}
                      disabled={preprocessingLayerId() === layer.id}
                      title={`Preprocess ${layer.controlType} layer`}
                    >
                      {preprocessingLayerId() === layer.id ? "⏳" : "🎨"}
                    </button>
                  </Show>
                  {/* Upscale button with mode selector */}
                  <select
                    class="layer-mode__upscale-mode"
                    value={upscaleMode()}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      e.stopPropagation();
                      setUpscaleMode(e.currentTarget.value as any);
                    }}
                  >
                    <option value="traditional">Fast</option>
                    <option value="img2img">Hybrid</option>
                    <option value="esrgan">ESRGAN</option>
                  </select>
                  <Show when={upscaleMode() === "traditional"}>
                    <select
                      class="layer-mode__upscale-method"
                      value={upscaleMethod()}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation();
                        setUpscaleMethod(e.currentTarget.value as any);
                      }}
                    >
                      <option value="lanczos">Lanczos</option>
                      <option value="bicubic">Bicubic</option>
                      <option value="bilinear">Bilinear</option>
                      <option value="nearest">Nearest</option>
                      <option value="area">Area</option>
                    </select>
                  </Show>
                  <select
                    class="layer-mode__upscale-factor"
                    value={upscaleFactor()}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      e.stopPropagation();
                      setUpscaleFactor(Number(e.currentTarget.value) as 2 | 4);
                    }}
                  >
                    <option value="2">2x</option>
                    <option value="4">4x</option>
                  </select>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUpscale(layer.id, upscaleFactor());
                    }}
                    title={`Upscale ${upscaleFactor()}x (${upscaleMode()})`}
                  >
                    🔍
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      canvas.removeLayer(layer.id);
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}

export default LayerMode;
