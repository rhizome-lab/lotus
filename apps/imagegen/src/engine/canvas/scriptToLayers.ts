// NOTE: This file is not currently used. It was part of Phase 4 implementation
// for script-to-layer visualization. When ready to integrate, export the functions below.

import type { Layer } from "./useCanvas";
import type { Point } from "./operations";
import type { ScriptValue } from "@viwo/scripting";

/** Extended layer interface for script-visualized layers */
interface ScriptLayer extends Layer {
  source?: "script" | "user";
  scriptNode?: ScriptValue<unknown>; // Original S-expression for re-export
  editable: boolean;
}

/**
 * Parse a ViwoScript (S-expression sequence) and convert to visual layers.
 *
 * This enables bidirectional conversion: Layer Mode → Script → Layer Mode
 *
 * Recognized operations become editable layers, unknown operations become
 * opaque (locked) layers.
 */
export function scriptToLayers(
  script: ScriptValue<unknown>,
  width: number,
  height: number,
): ScriptLayer[] {
  const layers: ScriptLayer[] = [];

  // Handle seq wrapper
  if (!Array.isArray(script)) {
    return layers;
  }

  const [opcode, ...expressions] = script;

  // If it's a seq, process each expression
  const exprs = opcode === "seq" || opcode === "std.seq" ? expressions : [script];

  for (const expr of exprs) {
    if (!Array.isArray(expr)) {
      continue;
    }

    const [op, ...args] = expr;

    switch (op) {
      case "canvas.layer.create": {
        // [opcode, id, name, type?]
        const [id, name, type = "raster"] = args;

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        layers.push({
          canvas,
          editable: true,
          id: id as string,
          locked: false,
          name: name as string,
          opacity: 1,
          scriptNode: expr as unknown as ScriptValue<unknown>,
          source: "script",
          type: type as "raster" | "control" | "mask",
          visible: true,
        });
        break;
      }

      case "canvas.layer.load_image": {
        // Find the layer and mark that it has an image
        // In full implementation, we'd actually load the image
        // For now, just record that this operation exists
        break;
      }

      case "canvas.draw_stroke": {
        // [opcode, layerId, points, color, size, tool]
        const [layerId, points, color, size, tool] = args;

        // Find the layer and replay the stroke
        const layer = layers.find((l) => l.id === layerId);
        if (layer && Array.isArray(points)) {
          const ctx = layer.canvas.getContext("2d");
          if (ctx) {
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.lineWidth = size as number;

            if (tool === "eraser") {
              ctx.globalCompositeOperation = "destination-out";
            } else {
              ctx.globalCompositeOperation = "source-over";
              ctx.strokeStyle = color as string;
            }

            // Draw the stroke
            const stroke = points as Point[];
            if (stroke[0] && stroke[1]) {
              const [firstPoint] = stroke;
              ctx.beginPath();
              ctx.moveTo(firstPoint.x, firstPoint.y);
              for (let idx = 1; idx < stroke.length; idx += 1) {
                const point = stroke[idx];
                if (point) {
                  ctx.lineTo(point.x, point.y);
                }
              }
              ctx.stroke();
            }
          }
        }
        break;
      }

      // Diffusers operations create generated layers
      case "diffusers.generate":
      case "diffusers.textToImage":
      case "diffusers.imageToImage": {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        // Extract prompt if available
        let promptText = "generated";
        if (args[0] && typeof args[0] === "object" && "prompt" in args[0]) {
          promptText = String(args[0].prompt).slice(0, 30);
        }

        layers.push({
          canvas,
          editable: false,
          id: crypto.randomUUID(),
          locked: true,
          name: `Generated: ${promptText}`,
          opacity: 1,
          scriptNode: expr as unknown as ScriptValue<unknown>,
          source: "script",
          type: "raster",
          visible: true,
        });
        break;
      }

      // ControlNet or Inpaint operations
      case "controlnet.apply":
      case "diffusers.inpaint":
      case "diffusers.outpaint": {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        layers.push({
          canvas,
          editable: false,
          id: crypto.randomUUID(),
          locked: true,
          name: `Opaque: ${op}`,
          opacity: 1,
          scriptNode: expr as unknown as ScriptValue<unknown>,
          source: "script",
          type: "opaque" as any,
          visible: true,
        });
        break;
      }

      // Unrecognized operations → opaque layers
      default: {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        layers.push({
          canvas,
          editable: false,
          id: crypto.randomUUID(),
          locked: true,
          name: `Opaque: ${op}`,
          opacity: 1,
          scriptNode: expr as unknown as ScriptValue<unknown>,
          source: "script",
          type: "opaque" as any,
          visible: true,
        });
      }
    }
  }

  return layers;
}

/**
 * Replay a script to rebuild canvas state.
 * This is used when importing a script to restore the exact canvas state.
 */
export function replayScript(
  script: ScriptValue<unknown>,
  onLayerCreate: (layer: ScriptLayer) => void,
  onProgress?: (current: number, total: number) => void,
): void {
  const layers = scriptToLayers(script, 1024, 1024);

  for (let idx = 0; idx < layers.length; idx += 1) {
    const layer = layers[idx];
    if (!layer) {
      continue;
    }
    onLayerCreate(layer);
    onProgress?.(idx + 1, layers.length);
  }
}
