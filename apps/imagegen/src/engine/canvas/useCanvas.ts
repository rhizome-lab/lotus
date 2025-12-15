import { CanvasOps, type Point } from "./operations";
import { type ScriptValue, StdLib } from "@viwo/scripting";
import { createSignal } from "solid-js";

export interface Layer {
  id: string;
  name: string;
  type: "raster" | "control" | "mask" | "composite-op" | "opaque";
  controlType?: string;
  maskFor?: string; // ID of layer this is a mask for
  source?: "script" | "user"; // NEW: Track origin
  scriptNode?: unknown; // NEW: Original S-expression
  editable?: boolean; // NEW: Whether layer can be edited
  visible: boolean;
  opacity: number;
  canvas: HTMLCanvasElement;
  locked: boolean;
}

interface BoundingBox {
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
  const [script, setScript] = createSignal<ScriptValue<unknown>>(StdLib.seq());
  const [currentStroke, setCurrentStroke] = createSignal<Point[]>([]);

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

    // Record operation
    const [, ...exprs] = script() as any[];
    setScript(StdLib.seq(...exprs, CanvasOps.layerCreate(layer.id, name)));

    return layer.id;
  }

  function addControlLayer(name: string, controlType: string) {
    const layer = createLayer(name, "control");
    layer.controlType = controlType;
    setLayers([...layers(), layer]);
    setActiveLayerId(layer.id);

    // Record operation
    const [, ...exprs] = script() as any[];
    setScript(StdLib.seq(...exprs, CanvasOps.layerCreate(layer.id, name, "control")));

    return layer.id;
  }

  function addMaskLayer(name: string, targetLayerId?: string) {
    const layer = createLayer(name, "raster"); // Changed from "mask" to "raster"
    layer.type = "mask"; // Set type after creation
    if (targetLayerId) {
      layer.maskFor = targetLayerId;
    }
    setLayers([...layers(), layer]);
    setActiveLayerId(layer.id);

    // Record operation
    const [, ...exprs] = script() as any[];
    setScript(StdLib.seq(...exprs, CanvasOps.layerCreate(layer.id, name, "mask")));

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
      }
      // Apply red overlay to mask layers
      else if (layer.type === "mask") {
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(layer.canvas, 0, 0);
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = "rgba(255, 50, 50, 0.3)";
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

    // Start new stroke
    setCurrentStroke([{ x, y }]);
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

    // Add point to stroke
    setCurrentStroke([...currentStroke(), { x, y }]);

    // Update composite
    if (compositeCanvas) {
      composite(compositeCanvas);
    }
  }

  function stopDrawing() {
    if (!isDrawing) {
      return;
    }

    isDrawing = false;

    // Record complete stroke if it has points
    const layer = getActiveLayer();
    if (layer && currentStroke().length > 0) {
      const [, ...exprs] = script() as any[];
      setScript(
        StdLib.seq(
          ...exprs,
          CanvasOps.drawStroke(
            layer.id,
            currentStroke(),
            color(),
            brushSize(),
            tool() as "brush" | "eraser",
          ),
        ),
      );
    }

    setCurrentStroke([]);
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

    // Record operation
    const [, ...exprs] = script() as any[];
    setScript(StdLib.seq(...exprs, CanvasOps.layerLoadImage(layerId, imageUrl, x, y)));
  }

  return {
    activeLayerId,
    addControlLayer,
    addLayer,
    addMaskLayer,
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
    script, // NEW: Export script instead of actions
    setActiveLayerId,
    setBbox,
    setBboxDraft,
    setBrushSize,
    setColor,
    setCompositeCanvas,
    setScript, // NEW: For importing scripts
    setTool,
    startDrawing,
    stopDrawing,
    tool,
    updateLayer,
  };
}
