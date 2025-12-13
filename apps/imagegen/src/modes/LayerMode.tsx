import { For, Show, createEffect, createSignal, onMount } from "solid-js";
import { exportAsViwoScript } from "../engine/canvas/actionRecorder";
import { useCanvas } from "../engine/canvas/useCanvas";
import { useGeneration } from "../utils/useGeneration";
import { useViwoConnection } from "../utils/viwo-connection";

function LayerMode() {
  const canvas = useCanvas(1024, 1024);
  const { sendRpc } = useViwoConnection();
  const generation = useGeneration(sendRpc);

  const [prompt, setPrompt] = createSignal("");
  const [negativePrompt, setNegativePrompt] = createSignal("");
  const [controlTypes, setControlTypes] = createSignal<
    { type: string; label: string; description: string }[]
  >([]);

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
      const imageUrl = await generation.generate({
        height: Math.max(64, Math.round(box.height / 8) * 8),
        negativePrompt: negativePrompt(),
        prompt: prompt(),
        width: Math.max(64, Math.round(box.width / 8) * 8),
        x: box.x,
        y: box.y,
      });

      const layerId = canvas.addLayer("Generated");
      canvas.loadImageToLayer(layerId, imageUrl, box.x, box.y);

      // Record generation action
      canvas.setActions([
        ...canvas.actions(),
        {
          bbox: box,
          layerId,
          negativePrompt: negativePrompt(),
          prompt: prompt(),
          type: "generate",
        },
      ]);
    } catch (error) {
      console.error("Generation error:", error);
      alert(`Generation failed: ${error}`);
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
            <button
              class="glass-button glass-button--primary"
              disabled={!prompt() || generation.generating()}
              onClick={handleGenerate}
            >
              {generation.generating() ? "Generating..." : "Generate"}
            </button>
          </div>
        </Show>
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

        <button
          class="glass-button"
          onClick={() => exportAsViwoScript(canvas.actions())}
          disabled={canvas.actions().length === 0}
        >
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
