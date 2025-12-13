import type { CanvasAction } from "./actionRecorder";
import { createSignal } from "solid-js";

export interface Layer {
  id: string;
  name: string;
  type: "raster" | "control";
  controlType?: string;
  visible: boolean;
  opacity: number;
  canvas: HTMLCanvasElement;
  locked: boolean;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function useCanvas(width: number, height: number) {
  const [layers, setLayers] = createSignal<Layer[]>([]);
  const [activeLayerId, setActiveLayerId] = createSignal<string | null>(null);
  const [tool, setTool] = createSignal<"brush" | "eraser" | "pan" | "bbox">("brush");
  const [brushSize, setBrushSize] = createSignal(10);
  const [color, setColor] = createSignal("#ffffff");
  const [bbox, setBbox] = createSignal<BoundingBox | null>(null);
  const [bboxDraft, setBboxDraft] = createSignal<BoundingBox | null>(null);
  const [actions, setActions] = createSignal<CanvasAction[]>([]);

  let compositeCanvas: HTMLCanvasElement | null = null;
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;

  function createLayer(name: string, type: "raster" | "control" = "raster"): Layer {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const layer: Layer = {
      canvas,
      id: crypto.randomUUID(),
      locked: false,
      name,
      opacity: 1,
      type,
      visible: true,
    };

    return layer;
  }

  function addLayer(name: string) {
    const layer = createLayer(name);
    setLayers([...layers(), layer]);
    setActiveLayerId(layer.id);
    setActions([...actions(), { layerId: layer.id, name, type: "layer.create" }]);
    return layer.id;
  }

  function addControlLayer(name: string, controlType: string) {
    const layer = createLayer(name, "control");
    layer.controlType = controlType;
    setLayers([...layers(), layer]);
    setActiveLayerId(layer.id);
    setActions([
      ...actions(),
      { controlType, layerId: layer.id, name, type: "layer.create_control" },
    ]);
    return layer.id;
  }

  function removeLayer(id: string) {
    setLayers(layers().filter((l) => l.id !== id));
    if (activeLayerId() === id) {
      const firstRemaining = layers().find((l) => l.id !== id);
      setActiveLayerId(firstRemaining?.id ?? null);
    }
  }

  function updateLayer(id: string, updates: Partial<Layer>) {
    setLayers(layers().map((l) => (l.id === id ? { ...l, ...updates } : l)));
  }

  function getActiveLayer(): Layer | null {
    const id = activeLayerId();
    return layers().find((l) => l.id === id) ?? null;
  }

  function composite(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    // Clear composite canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Composite all visible layers
    for (const layer of layers()) {
      if (!layer.visible) {
        continue;
      }

      ctx.globalAlpha = layer.opacity;

      // Apply blue tint to control layers for visual distinction
      if (layer.type === "control") {
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(layer.canvas, 0, 0);
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = "rgba(100, 150, 255, 0.2)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      } else {
        ctx.drawImage(layer.canvas, 0, 0);
      }
    }

    ctx.globalAlpha = 1;
  }

  function startDrawing(x: number, y: number) {
    const layer = getActiveLayer();
    if (!layer || layer.locked) {
      return;
    }

    isDrawing = true;
    lastX = x;
    lastY = y;
  }

  function draw(x: number, y: number) {
    if (!isDrawing) {
      return;
    }

    const layer = getActiveLayer();
    if (!layer || layer.locked) {
      return;
    }

    const ctx = layer.canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = brushSize();

    if (tool() === "brush") {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = color();
    } else if (tool() === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
    }

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();

    lastX = x;
    lastY = y;

    // Update composite
    if (compositeCanvas) {
      composite(compositeCanvas);
    }
  }

  function stopDrawing() {
    isDrawing = false;
  }

  function clear() {
    const layer = getActiveLayer();
    if (!layer || layer.locked) {
      return;
    }

    const ctx = layer.canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);

    if (compositeCanvas) {
      composite(compositeCanvas);
    }
  }

  function setCompositeCanvas(canvas: HTMLCanvasElement) {
    compositeCanvas = canvas;
    composite(canvas);
  }

  function loadImageToLayer(layerId: string, imageUrl: string, x = 0, y = 0) {
    const layer = layers().find((l) => l.id === layerId);
    if (!layer) {
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.addEventListener("load", () => {
      const ctx = layer.canvas.getContext("2d");
      if (!ctx) {
        return;
      }

      ctx.drawImage(img, x, y);

      if (compositeCanvas) {
        composite(compositeCanvas);
      }
    });
    img.src = imageUrl;
  }

  return {
    actions,
    activeLayerId,
    addControlLayer,
    addLayer,
    bbox,
    bboxDraft,
    brushSize,
    clear,
    color,
    composite: () => compositeCanvas && composite(compositeCanvas),
    draw,
    layers,
    loadImageToLayer,
    removeLayer,
    setActions,
    setActiveLayerId,
    setBbox,
    setBboxDraft,
    setBrushSize,
    setColor,
    setCompositeCanvas,
    setTool,
    startDrawing,
    stopDrawing,
    tool,
    updateLayer,
  };
}
