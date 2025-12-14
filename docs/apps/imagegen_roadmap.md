# Image Generation Frontend - Roadmap

A comprehensive image generation frontend for viwo, combining **Layer Mode** (InvokeAI-style canvas) with **Enhanced Block Editor** (extending `@viwo/web-editor`).

## Quick Start

**Location:** `apps/imagegen/`  
**Entry point:** `apps/imagegen/src/main.tsx`  
**Run dev server:** `cd apps/imagegen && bun dev` (port 3002)  
**Dependencies:** Requires viwo server running on `ws://localhost:8080`

---

## Architecture Overview

### Core Concepts

**Capability-Based Architecture:**

- Capabilities are server-side features (e.g., `diffusers.generate`, `fs.read`)
- Each capability exposes methods (e.g., `textToImage`, `imageToImage`)
- Frontend auto-generates blocks from capability metadata
- Generic opcodes: `get_capability(type)` and `std.call_method(obj, method, ...args)`

**Two-Mode System:**

1. **Layer Mode** - Visual canvas interface

   - File: `apps/imagegen/src/modes/LayerMode.tsx`
   - Engine: `apps/imagegen/src/engine/canvas/useCanvas.ts`
   - Records actions, exports to ViwoScript

2. **Blocks Mode** - Script editor wrapper
   - File: `apps/imagegen/src/modes/BlocksMode.tsx`
   - Wraps `@viwo/web-editor` ScriptEditor
   - Auto-generates blocks from server metadata

**Communication:**

- WebSocket JSON-RPC to viwo server
- RPC methods: `get_capability_metadata`, `get_opcodes`, `execute_script`
- Hook: `apps/imagegen/src/utils/viwo-connection.ts`

---

## Phase 1: MVP ✅ **COMPLETE**

### What Was Built

**Layer Mode Canvas:**

```typescript
// apps/imagegen/src/engine/canvas/useCanvas.ts
export function useCanvas(width: number, height: number) {
  // Multi-layer system
  const [layers, setLayers] = createSignal<Layer[]>([]);
  const [activeLayerId, setActiveLayerId] = createSignal<string | null>(null);

  // Tools
  const [tool, setTool] = createSignal<"brush" | "eraser" | "bbox">("brush");
  const [brushSize, setBrushSize] = createSignal(10);

  // Action recording
  const [actions, setActions] = createSignal<CanvasAction[]>([]);

  return {
    layers,
    addLayer,
    removeLayer,
    updateLayer,
    startDrawing,
    draw,
    stopDrawing,
    loadImageToLayer, // Composite generated images
    actions,
    setActions, // For export
  };
}
```

**Generation Integration:**

```typescript
// apps/imagegen/src/utils/useGeneration.ts
export function useGeneration(sendRpc) {
  async function generate(request: GenerationRequest) {
    const result = await sendRpc("plugin_rpc", {
      method: "diffusers.generate",
      params: { prompt, width, height, seed },
    });
    return result.image_url;
  }
  return { generate, generating, queue };
}
```

**Auto-Generated Blocks:**

```typescript
// apps/imagegen/src/modes/BlocksMode.tsx
onMount(async () => {
  // Fetch core opcodes
  const coreOpcodes = await sendRpc("get_opcodes", {});

  // Fetch capability metadata
  const capabilities = await sendRpc("get_capability_metadata", {});

  // Auto-generate blocks
  for (const cap of capabilities) {
    for (const method of cap.methods) {
      blocks.push({
        opcode: `${cap.type}.${method.name}`,
        label: method.label,
        category: cap.label,
        slots: method.parameters.map((p) => ({
          name: p.name,
          type: p.type,
        })),
      });
    }
  }
});
```

### Files Created

- `apps/imagegen/package.json` - Vite + SolidJS config
- `apps/imagegen/src/App.tsx` - Mode toggle
- `apps/imagegen/src/modes/LayerMode.tsx` - Canvas UI
- `apps/imagegen/src/modes/BlocksMode.tsx` - Script editor wrapper
- `apps/imagegen/src/engine/canvas/useCanvas.ts` - Canvas engine
- `apps/imagegen/src/engine/canvas/actionRecorder.ts` - ViwoScript export
- `apps/imagegen/src/utils/viwo-connection.ts` - WebSocket client
- `apps/imagegen/src/utils/useGeneration.ts` - Generation queue
- `packages/shared/src/index.css` - Glassmorphism styles (lines 1089-1323)

### Server-Side Changes

- `packages/core/src/runtime/lib/kernel.ts` - Capability opcodes (`get_capability`, `mint`, `delegate`)
- `packages/core/src/plugin.ts` - `getCapabilityMetadata()` method
- `packages/core/src/index.ts` - `get_capability_metadata` RPC endpoint
- `packages/core/src/repo.ts` - `getCapabilitiesByType()` helper

---

## Phase 2: ControlNet & Regional Prompting ✅ **COMPLETE**

### Goal

Add ControlNet support for guided image generation using edge maps, depth maps, poses, etc.

### Backend Requirements

**1. Add ControlNet Capability**

Create `plugins/diffusers/src/controlnet.ts`:

```python
# Python server: plugins/diffusers/src/server/controlnet.py
from diffusers import StableDiffusionControlNetPipeline, ControlNetModel

class ControlNetManager:
    def __init__(self):
        self.models = {}

    async def load_controlnet(self, type: str):
        """Load ControlNet model (canny, depth, pose, etc.)"""
        model_id = f"lllyasviel/sd-controlnet-{type}"
        self.models[type] = ControlNetModel.from_pretrained(model_id)

    async def generate(self, prompt: str, control_image, type: str, **kwargs):
        """Generate with ControlNet guidance"""
        pipe = StableDiffusionControlNetPipeline.from_pretrained(
            "runwayml/stable-diffusion-v1-5",
            controlnet=self.models[type]
        )
        return pipe(prompt=prompt, image=control_image, **kwargs)
```

**TypeScript Capability:**

```typescript
// plugins/diffusers/src/controlnet.ts
export class ControlNetCapability extends BaseCapability {
  static type = "controlnet.generate";

  async apply(
    ctx: ScriptContext,
    image: Buffer,
    prompt: string,
    type: "canny" | "depth" | "pose" | "scribble",
    strength: number = 1.0,
  ): Promise<Buffer> {
    const result = await this.callPython("controlnet_generate", {
      image,
      prompt,
      type,
      strength,
    });
    return result.image;
  }

  async preprocess(ctx: ScriptContext, image: Buffer, type: "canny" | "depth"): Promise<Buffer> {
    // Run preprocessor (e.g., Canny edge detection)
    return await this.callPython("controlnet_preprocess", { image, type });
  }
}
```

**Register Capability:**

```typescript
// plugins/diffusers/src/index.ts
export function initialize(repo: Repository, pm: PluginManager) {
  pm.registerCapability(ControlNetCapability);
}
```

### Frontend Changes

**1. Layer Mode - Control Layers**

Add control layer type:

```typescript
// apps/imagegen/src/engine/canvas/useCanvas.ts
interface Layer {
  id: string;
  name: string;
  type: "raster" | "control"; // NEW
  controlType?: "canny" | "depth" | "pose"; // NEW
  visible: boolean;
  opacity: number;
  canvas: HTMLCanvasElement;
  locked: boolean;
}

function addControlLayer(name: string, type: string) {
  const layer = createLayer(name);
  layer.type = "control";
  layer.controlType = type;
  // Render with special overlay (blue tint, etc.)
  setLayers([...layers(), layer]);
}
```

**UI Updates:**

```tsx
// apps/imagegen/src/modes/LayerMode.tsx
<div class="layer-mode__tools">
  <button onClick={() => canvas.setTool("brush")}>Brush</button>
  <button onClick={() => canvas.setTool("eraser")}>Eraser</button>
  <button onClick={() => canvas.setTool("bbox")}>Select</button>

  {/* NEW: ControlNet tools */}
  <select onChange={(e) => addControlLayer("Control", e.target.value)}>
    <option>Add Control Layer</option>
    <option value="canny">Canny Edge</option>
    <option value="depth">Depth Map</option>
    <option value="pose">OpenPose</option>
    <option value="scribble">Scribble</option>
  </select>
</div>
```

**Preprocessor Visualization:**

```typescript
async function preprocessControlLayer(layerId: string) {
  const layer = layers().find((l) => l.id === layerId);
  if (!layer || layer.type !== "control") return;

  // Convert canvas to blob
  const blob = await canvasToBlob(layer.canvas);

  // Call preprocessor
  const cap = await sendRpc("get_capability", { type: "controlnet.generate" });
  const processed = await sendRpc("std.call_method", {
    object: cap,
    method: "preprocess",
    args: [blob, layer.controlType],
  });

  // Update canvas with processed image
  const img = new Image();
  img.src = URL.createObjectURL(processed);
  img.onload = () => {
    const ctx = layer.canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    composite();
  };
}
```

**2. Blocks Mode - Auto-Generated**

No changes needed! Blocks auto-generate from capability metadata:

```
┌─────────────────────────┐
│ ControlNet: Apply       │
│ image: [slot]           │
│ prompt: [___]           │
│ type: [Canny ▼]         │
│ strength: [━━━━○━━] 1.0 │
└─────────────────────────┘

┌─────────────────────────┐
│ ControlNet: Preprocess  │
│ image: [slot]           │
│ type: [Depth ▼]         │
└─────────────────────────┘
```

### Acceptance Criteria

- [ ] Load ControlNet models (canny, depth, pose, scribble)
- [ ] Apply ControlNet in generation with strength control
- [ ] Preprocessor visualization in Layer Mode
- [ ] Control layers render with visual distinction
- [ ] Multiple control layers in single generation
- [ ] Auto-generated ControlNet blocks in Blocks Mode

### Testing

```bash
# Start servers
cd plugins/diffusers && bun run python-server
cd apps/server && bun dev
cd apps/imagegen && bun dev

# Manual test:
# 1. Load image in Layer Mode
# 2. Add Canny control layer
# 3. Draw edges
# 4. Select generation area
# 5. Set prompt + ControlNet strength
# 6. Generate - should respect edges
```

---

## Phase 3: Inpainting & Upscaling ✅ **COMPLETE**

### Goal

Enable selective regeneration (inpainting/outpainting) and image upscaling.

### Backend Requirements

**1. Inpainting Capability**

```typescript
// plugins/diffusers/src/inpaint.ts
export class InpaintCapability extends BaseCapability {
  static type = "diffusers.inpaint";

  async inpaint(
    ctx: ScriptContext,
    image: Buffer,
    mask: Buffer, // White = inpaint, black = keep
    prompt: string,
    strength: number = 0.8,
  ): Promise<Buffer> {
    return await this.callPython("inpaint", {
      image,
      mask,
      prompt,
      strength,
    });
  }

  async outpaint(
    ctx: ScriptContext,
    image: Buffer,
    direction: "left" | "right" | "top" | "bottom",
    pixels: number,
    prompt: string,
  ): Promise<Buffer> {
    // Extend canvas in direction, generate for new area
    return await this.callPython("outpaint", {
      image,
      direction,
      pixels,
      prompt,
    });
  }
}
```

**2. Upscaling Capability**

```typescript
// plugins/diffusers/src/upscale.ts
export class UpscaleCapability extends BaseCapability {
  static type = "diffusers.upscale";

  async upscale(
    ctx: ScriptContext,
    image: Buffer,
    model: "esrgan" | "realesrgan" = "realesrgan",
    factor: 2 | 4 = 2,
  ): Promise<Buffer> {
    return await this.callPython("upscale", { image, model, factor });
  }

  async faceRestore(ctx: ScriptContext, image: Buffer, strength: number = 1.0): Promise<Buffer> {
    return await this.callPython("face_restore", { image, strength });
  }
}
```

### Frontend Changes

**1. Layer Mode - Mask Editor**

```typescript
// Add mask layer type
interface Layer {
  id: string;
  type: "raster" | "control" | "mask"; // NEW
  // ...
}

// Mask editing tool
function enableMaskMode(layerId: string) {
  const layer = layers().find((l) => l.id === layerId);
  layer.type = "mask";

  // Render with alpha overlay (red = masked)
  setTool("mask-brush");
}

// Inpaint with mask
async function inpaintMasked(layerId: string, maskLayerId: string) {
  const layer = layers().find((l) => l.id === layerId);
  const maskLayer = layers().find((l) => l.id === maskLayerId);

  const imageBlob = await canvasToBlob(layer.canvas);
  const maskBlob = await canvasToBlob(maskLayer.canvas);

  const result = await generation.inpaint({
    image: imageBlob,
    mask: maskBlob,
    prompt: prompt(),
    strength: 0.8,
  });

  // Composite result
  loadImageToLayer(layerId, result);
}
```

**UI:**

```tsx
<div class="layer-mode__tools">
  {/* Existing tools */}

  {/* NEW: Mask tools */}
  <button onClick={() => addMaskLayer("Mask")}>Add Mask</button>
  <button onClick={() => canvas.setTool("mask-brush")}>Paint Mask</button>

  <Show when={hasMaskLayer()}>
    <button onClick={() => inpaintSelected()}>Inpaint Masked</button>
  </Show>
</div>;

{
  /* Outpaint controls */
}
<div class="layer-mode__outpaint">
  <select>
    <option value="left">Extend Left</option>
    <option value="right">Extend Right</option>
    <option value="top">Extend Top</option>
    <option value="bottom">Extend Bottom</option>
  </select>
  <input type="number" value="256" step="64" />
  <button onClick={handleOutpaint}>Outpaint</button>
</div>;
```

**2. Upscaling UI**

```tsx
// In gallery or layer context menu
<button onClick={() => upscaleImage(imageId, 2)}>
  Upscale 2x
</button>
<button onClick={() => upscaleImage(imageId, 4)}>
  Upscale 4x
</button>
<button onClick={() => restoreFaces(imageId)}>
  Restore Faces
</button>
```

### Acceptance Criteria

- [ ] Paint mask on layer
- [ ] Inpaint masked area with prompt
- [ ] Outpaint (extend canvas bounds)
- [ ] Upscale 2x/4x with ESRGAN/RealESRGAN
- [ ] Face restoration
- [ ] Mask visualization (red overlay)
- [ ] Auto-generated inpaint/upscale blocks

### Testing

1. Load image, add mask layer, paint mask
2. Click "Inpaint" → regenerates masked area
3. Select image → Upscale 2x → verify quality
4. Portrait → Restore Faces → verify improvement

---

## Phase 4: Advanced Features ✅ **COMPLETE**

### What Was Built

**1. ViwoScript State Refactor**

Eliminated the `CanvasAction` translation layer and adopted full ViwoScript S-expressions as canvas state:

```typescript
// apps/imagegen/src/engine/canvas/operations.ts
export const CanvasOps = {
  layerCreate: (id: string, name: string, type = "raster"): ScriptValue<void> =>
    ["canvas.layer.create", id, name, type] as ScriptValue<void>,

  drawStroke: (
    layerId: string,
    points: Point[],
    color: string,
    size: number,
    tool = "brush",
  ): ScriptValue<void> =>
    ["canvas.draw_stroke", layerId, points, color, size, tool] as ScriptValue<void>,

  layerLoadImage: (layerId: string, imageUrl: string, x: number, y: number): ScriptValue<void> =>
    ["canvas.layer.load_image", layerId, imageUrl, x, y] as ScriptValue<void>,
};

// apps/imagegen/src/engine/canvas/useCanvas.ts
const [script, setScript] = createSignal(StdLib.seq());

// Record operations
setScript(
  StdLib.seq(
    ...exprs,
    CanvasOps.layerCreate(id, name),
    CanvasOps.drawStroke(layerId, points, color, size, tool),
  ),
);
```

**2. Script → Layer Visualization**

Bidirectional conversion between ViwoScript and visual layers:

```typescript
// apps/imagegen/src/engine/canvas/scriptToLayers.ts
export function scriptToLayers(
  script: ScriptValue<unknown>,
  width: number,
  height: number,
): ScriptLayer[] {
  // Parse S-expressions
  const [opcode, ...expressions] = script;

  for (const expr of expressions) {
    const [op, ...args] = expr;

    switch (op) {
      case "canvas.layer.create":
        layers.push({ id, name, type, source: "script", editable: true });
        break;
      case "canvas.draw_stroke":
        // Replay stroke on layer canvas
        replayStroke(layer, points, color, size, tool);
        break;
      case "diffusers.generate":
        // Locked generated layer
        layers.push({ name: "Generated", type: "raster", editable: false });
        break;
      default:
        // Opaque layer for unknown opcodes
        layers.push({ name: `Opaque: ${op}`, type: "opaque", locked: true });
    }
  }
}

// Blocks Mode visualization button
<button
  onClick={() => {
    setSharedScript(script());
    setMode("layer"); // Switch to Layer Mode
  }}
>
  🎨 Visualize as Layers
</button>;
```

**3. Batch Generation**

Complete utility hook for generating multiple images with progress tracking:

```typescript
// apps/imagegen/src/utils/batchGeneration.ts
export function useBatch(sendRpc) {
  const [isRunning, setIsRunning] = createSignal(false);
  const [progress, setProgress] = createSignal({ current: 0, total: 0 });
  const [results, setResults] = createSignal<GenerationResult[]>([]);

  async function generateBatch(requests: GenerationRequest[], options: BatchOptions) {
    for (let idx = 0; idx < requests.length; idx += 1) {
      const result = await callDiffusersGenerate(requests[idx]);
      batchResults.push(result);
      setProgress({ current: idx + 1, total: requests.length });
      options.onProgress?.(idx + 1, requests.length);
    }
    return batchResults;
  }

  function createSeedVariations(baseRequest, count, startSeed = 1) {
    return Array.from({ length: count }, (_, i) => ({
      ...baseRequest,
      seed: startSeed + i,
    }));
  }

  return { generateBatch, createSeedVariations, isRunning, progress, results };
}
```

**UI Integration:**

```tsx
// apps/imagegen/src/modes/LayerMode.tsx
<div class="layer-mode__batch glass-panel">
  <h4>Batch Generation</h4>
  <input type="number" value={4} min="1" max="20" />
  <button
    onClick={async () => {
      const requests = batch.createSeedVariations(baseParams, 4);
      await batch.generateBatch(requests, { continueOnError: true });
    }}
  >
    Generate Batch
  </button>

  <Show when={batch.isRunning()}>
    <progress value={batch.progress().current} max={batch.progress().total} />
  </Show>

  <Show when={batch.results().length > 0}>
    <div class="layer-mode__batch-results">
      <For each={batch.results()}>
        {(result) => (
          <img
            src={result.image_url}
            onClick={() => canvas.loadImageToLayer(layerId, result.image_url, 0, 0)}
          />
        )}
      </For>
    </div>
  </Show>
</div>
```

**4. Workflow Templates**

localStorage-based template system with import/export:

```typescript
// apps/imagegen/src/utils/templates.ts
export function useTemplates() {
  const [templates, setTemplates] = createSignal<WorkflowTemplate[]>([]);

  function saveTemplate(name: string, description: string, script: ScriptValue<unknown>) {
    const template: WorkflowTemplate = {
      id: crypto.randomUUID(),
      name,
      description,
      script,
      created: Date.now(),
      metadata: { version: "1.0", tags: [] },
    };
    localStorage.setItem(`viwo:template:${template.id}`, JSON.stringify(template));
    setTemplates([...templates(), template]);
  }

  function exportTemplate(id: string) {
    const template = loadTemplate(id);
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
    downloadFile(blob, `${template.name}.viwo-template.json`);
  }

  async function importTemplate(file: File) {
    const template = JSON.parse(await file.text());
    saveTemplate(template.name, template.description, template.script);
  }

  return { templates, saveTemplate, loadTemplate, exportTemplate, importTemplate };
}
```

**UI Integration:**

```tsx
// apps/imagegen/src/App.tsx
<aside class={`imagegen__templates ${showTemplates() ? "imagegen__templates--visible" : ""}`}>
  <header>
    <h2>Templates</h2>
    <button onClick={() => setShowTemplates(false)}>✕</button>
  </header>

  <div class="imagegen__templates-actions">
    <button
      onClick={() => {
        const name = prompt("Template name:");
        templates.saveTemplate(name, "", sharedScript());
      }}
    >
      💾 Save Current
    </button>
    <button onClick={handleImport}>📥 Import</button>
  </div>

  <div class="imagegen__templates-list">
    <For each={templates.templates()}>
      {(template) => (
        <div class="imagegen__template-card">
          <h3>{template.name}</h3>
          <p>{template.description}</p>
          <button onClick={() => setSharedScript(template.script)}>Load</button>
          <button onClick={() => templates.exportTemplate(template.id)}>Export</button>
          <button onClick={() => templates.deleteTemplate(template.id)}>Delete</button>
        </div>
      )}
    </For>
  </div>
</aside>
```

### Architecture

**Shared Script State:**

```tsx
// apps/imagegen/src/App.tsx
function App() {
  const [sharedScript, setSharedScript] = createSignal(StdLib.seq());
  const templates = useTemplates();

  return (
    <>
      {mode() === "layer" ? (
        <LayerMode initialScript={sharedScript()} onScriptChange={setSharedScript} />
      ) : (
        <BlocksMode
          script={sharedScript()}
          onScriptChange={setSharedScript}
          onVisualize={() => setMode("layer")}
        />
      )}
    </>
  );
}
```

### Acceptance Criteria

- [x] ViwoScript S-expressions as canvas state
- [x] Full stroke recording with point arrays
- [x] Script export using `decompile()`
- [x] `scriptToLayers()` parser with stroke replay
- [x] Opaque layers for unrecognized opcodes
- [x] Batch generation with progress tracking
- [x] Seed variations utility
- [x] Template save/load with localStorage
- [x] Template import/export as JSON
- [x] Shared script state between modes
- [x] "Visualize as Layers" button in Blocks Mode

### Testing

```bash
# Start servers
cd plugins/diffusers && bun run python-server
cd apps/server && bun dev
cd apps/imagegen && bun dev

# Manual tests:
# 1. Draw in Layer Mode → Export script
# 2. Copy script to Blocks Mode → Visualize as Layers
# 3. Generate batch (4 seed variations)
# 4. Save workflow as template → Load template
# 5. Export template → Import in new session
```

---

## Phase 5: Viwo Integration

### Entity Storage

```typescript
// Save generated image as entity
async function saveAsEntity(imageBlob: Blob, metadata: any) {
  // Create entity with image property
  const entityId = await sendRpc("sys.create", {
    props: {
      name: metadata.prompt,
      image: await blobToBase64(imageBlob),
      metadata: JSON.stringify(metadata),
    },
  });

  // Attach to current room
  if (currentRoom) {
    await sendRpc("entity.verb", {
      entity: currentRoom,
      verb: "addItem",
      args: [entityId],
    });
  }
}
```

### Image Verbs

```typescript
// Define image manipulation verbs
export const imageVerbs = {
  async transform(ctx, rotation: number, scale: number) {
    // Transform image
  },

  async filter(ctx, type: "blur" | "sharpen" | "grayscale") {
    // Apply filter
  },

  async composite(ctx, overlayImage: Buffer, x: number, y: number) {
    // Composite images
  },
};
```

---

## Phase 6: Performance & Polish

### Service Worker

```typescript
// apps/imagegen/public/sw.js
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("imagegen-v1").then((cache) => {
      return cache.addAll([
        "/",
        "/index.html",
        "/src/main.tsx",
        // ... assets
      ]);
    }),
  );
});

self.addEventListener("fetch", (event) => {
  // Cache-first for assets
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    }),
  );
});
```

### Multi-Format Metadata

```typescript
// packages/image-io/src/index.ts
export async function embedMetadata(
  image: Buffer,
  format: "png" | "jpeg" | "webp",
  metadata: object,
): Promise<Buffer> {
  if (format === "png") {
    return embedPngMetadata(image, metadata);
  } else if (format === "jpeg") {
    return embedExif(image, metadata);
  } else {
    return embedWebpExif(image, metadata);
  }
}

export async function convertImage(
  image: Buffer,
  from: string,
  to: string,
  options: { quality?: number; preserveMetadata?: boolean },
): Promise<Buffer> {
  // Use sharp or similar
  const metadata = options.preserveMetadata ? await readMetadata(image, from) : null;

  const converted = await sharp(image).toFormat(to, { quality: options.quality }).toBuffer();

  if (metadata) {
    return await embedMetadata(converted, to, metadata);
  }
  return converted;
}
```

---

## Technical Reference

### Key Files

- **Canvas Engine:** `apps/imagegen/src/engine/canvas/useCanvas.ts`
- **WebSocket Client:** `apps/imagegen/src/utils/viwo-connection.ts`
- **Capability Opcodes:** `packages/core/src/runtime/lib/kernel.ts`
- **Capability Registry:** `packages/core/src/runtime/capabilities.ts`
- **Diffusers Plugin:** `plugins/diffusers/src/lib.ts`

### RPC Methods

- `get_capability_metadata` - Fetch capability types/methods
- `get_opcodes` - Fetch core opcode definitions
- `execute_script` - Run ViwoScript
- `plugin_rpc` - Call plugin method directly

### Environment

- **Dev server:** `bun dev` in `apps/imagegen`
- **Build:** `bun run build`
- **Viwo server:** `ws://localhost:8080`
- **Python server:** `http://localhost:8001` (for diffusers)

---

## Phase 3.5: Advanced Parameters & ComfyUI-Level Features ✅ COMPLETE

### Overview

Enhanced Phase 3 with runtime parameter passing, SDXL multi-prompt support, compute limits, traditional upscaling methods, and hybrid img2img upscaling to achieve ComfyUI-level flexibility.

### Features Implemented

#### Runtime Parameter Passing ✅

- **No capability minting required** - All parameters passed via method args
- Params object as 4th argument to capability methods
- Dynamic model selection, steps, CFG, strength, etc.

#### SDXL Multi-Prompt Support ✅

- `prompt_2` and `negative_prompt_2` for dual text encoders
- Auto-detection based on model ID (checks for "xl")
- Smart UI with optional toggle (hidden by default)
- Auto-fills from primary prompt when enabled
- Applies to both positive and negative conditioning

#### Compute Budget System ✅

- Formula: `(width × height × steps) / 1,000,000`
- Validation before generation
- Display in UI with real-time cost calculation
- Prevents excessive resource usage

#### Traditional Upscaling Methods ✅

- **5 interpolation methods:**
  - `lanczos` - High quality (default)
  - `bicubic` - Better quality
  - `bilinear` - Basic smoothing
  - `nearest` - Fast, pixelated
  - `area` - CV2 INTER_AREA
- Fast, no diffusion required
- 2x and 4x factor support

#### Hybrid Img2Img Upscaling ✅

- **ComfyUI-equivalent quality**
- Step 1: Traditional upscale (fast)
- Step 2: img2img refinement with low denoise (0.2-0.4)
- Configurable denoise strength
- Uses existing SD models

#### Advanced UI Controls ✅

- Model selection dropdown (SD 1.5, SDXL, Inpaint variants)
- Collapsible advanced parameters panel
- Strength, steps, CFG sliders
- Upscale mode selector (Fast/Hybrid/ESRGAN)
- Method selector for traditional upscaling
- Factor selector (2x/4x)
- Compute cost display

### Backend Changes

**Python Files:**

- `plugins/diffusers/server/inpaint.py` - Multi-prompts, compute validation
- `plugins/diffusers/server/upscale_traditional.py` - NEW: 5 traditional methods + hybrid upscaler
- `plugins/diffusers/server/main.py` - Updated request models, 2 new endpoints

**TypeScript Files:**

- `plugins/diffusers/src/inpaint.ts` - Runtime params via params object
- `plugins/diffusers/src/upscale.ts` - Added `upscaleTraditional()` and `upscaleImg2Img()`

**Frontend Files:**

- `apps/imagegen/src/modes/LayerMode.tsx` - Full UI with smart multi-prompts

### API Enhancements

**New Endpoints:**

- `POST /upscale/traditional` - Fast interpolation upscaling
- `POST /upscale/img2img` - Hybrid upscale with refinement

**Updated Endpoints:**

- `/inpaint` - Now accepts `prompt_2`, `negative_prompt_2`, `max_compute`
- `/outpaint` - Same additions

### Usage Examples

```typescript
// Inpaint with SDXL multi-prompts
await sendRpc("std.call_method", {
  object: inpaintCap,
  method: "inpaint",
  args: [
    imageB64,
    maskB64,
    "beautiful landscape",
    {
      model_id: "stabilityai/stable-diffusion-xl-inpainting",
      prompt_2: "masterpiece, ultra detailed",
      negative_prompt_2: "low quality, artifacts",
      num_inference_steps: 50,
      guidance_scale: 7.5,
      max_compute: 100,
    },
  ],
});

// Hybrid upscaling (ComfyUI quality)
await sendRpc("std.call_method", {
  object: upscaleCap,
  method: "upscaleImg2Img",
  args: [
    imageB64,
    "high resolution, sharp",
    {
      factor: 2,
      denoise_strength: 0.3,
      upscale_method: "lanczos",
    },
  ],
});
```

### Key Achievements

✅ **ComfyUI Feature Parity** - Matches quality and flexibility  
✅ **Smart Defaults** - Multi-prompts auto-fill, minimize clutter  
✅ **Runtime Flexibility** - No capability minting required  
✅ **Performance** - Traditional upscale = instant  
✅ **Quality** - Hybrid upscale = best of both worlds

---
