# Image Generation Frontend

A comprehensive image generation frontend for lotus that combines visual canvas editing with capability-based AI image generation.

## Overview

The Image Generation app provides two complementary interfaces for working with AI-generated images:

1. **Layer Mode** - InvokeAI-style canvas interface for visual editing and generation
2. **Blocks Mode** - Visual script editor that auto-generates blocks from server capabilities

The app connects to the lotus server via WebSocket and leverages the diffusers plugin for Stable Diffusion image generation.

## Architecture

### Two-Mode System

**Layer Mode** (`src/modes/LayerMode.tsx`):

- Multi-layer canvas system
- Drawing tools (brush, eraser, selection)
- Image generation with visual prompting
- ControlNet support for guided generation
- Inpainting and mask editing
- Entity integration for saving/loading images
- Reed state tracking

**Blocks Mode** (`src/modes/BlocksMode.tsx`):

- Wraps `@lotus/web-editor` ScriptEditor
- Auto-generates blocks from capability metadata
- Supports all lotus capabilities
- "Visualize as Layers" button for canvas preview

### Capability-Based Generation

The app uses lotus's capability system for secure, controlled access to AI features:

```typescript
// Get generation capability
const genCap = await sendRpc("get_capability", { type: "diffusers.generate" });

// Generate image
const result = await sendRpc("std.call_method", {
  object: genCap,
  method: "textToImage",
  args: ["a beautiful landscape", { width: 512, height: 512 }],
});
```

### Shared Script State

Both modes share the same Reed state, enabling seamless transitions:

```typescript
const [sharedScript, setSharedScript] = createSignal(StdLib.seq());

// Layer Mode records actions as Reed operations
setSharedScript(
  StdLib.seq(
    CanvasOps.layerCreate(id, name),
    CanvasOps.drawStroke(layerId, points, color, size),
    // ... generation calls
  ),
);

// Blocks Mode can visualize and edit the same script
```

## Key Features

### Canvas System

- **Multi-layer support**: Raster, control, and mask layers
- **Drawing tools**: Brush, eraser, bounding box selection
- **Layer operations**: Add, remove, reorder, opacity, visibility
- **Image composition**: Load generated images to layers

### Image Generation

- **Text-to-image**: Generate images from text prompts
- **ControlNet**: Guided generation using edge maps, depth maps, poses
- **Inpainting**: Selective regeneration with mask painting
- **Outpainting**: Extend canvas bounds in any direction
- **Batch generation**: Generate multiple variations with seed control
- **Advanced parameters**: Model selection, steps, CFG, SDXL dual prompts

### Entity Integration

Save generated images as lotus entities:

```typescript
// Save image with metadata
await saveImageAsEntity(imageBlob, {
  prompt: "beautiful landscape",
  model: "stable-diffusion-xl-base-1.0",
  steps: 50,
  seed: 12345,
});

// Load entity image to canvas
const entityData = await loadEntityImage(entityId);
canvas.loadImageToLayer(layerId, entityData.image_url, 0, 0);
```

### Workflow Templates

- **Save workflows**: Export canvas state as reusable templates
- **Template library**: Manage templates with localStorage
- **Import/Export**: Share templates as JSON files
- **Metadata**: Name, description, thumbnail, tags

## Usage Examples

### Basic Generation in Layer Mode

1. Start the app and ensure Layer Mode is active
2. Enter a prompt in the generation panel
3. Adjust parameters (size, steps, model)
4. Click "Generate" to create an image
5. Image automatically loads to a new layer

### ControlNet Workflow

1. Load or generate a base image
2. Add a control layer (e.g., "Canny Edge")
3. Draw or load a control image
4. Click "Preprocess" to see edge detection
5. Generate with ControlNet guidance

### Inpainting

1. Load an image to a layer
2. Add a mask layer
3. Paint the area to regenerate (white = inpaint)
4. Enter a new prompt
5. Click "Inpaint" to regenerate only the masked area

### Script Editing in Blocks Mode

1. Switch to Blocks Mode
2. Visual blocks represent canvas operations and generation calls
3. Edit parameters, add new operations
4. Click "Visualize as Layers" to see canvas preview
5. Switch back to Layer Mode to continue editing

## Configuration

### Environment

- **Lotus server**: `ws://localhost:8080` (configurable in `lotus-connection.ts`)
- **Dev server port**: 3002 (configurable in `vite.config.ts`)

### Required Services

- Lotus server with diffusers plugin
- Python inference server for image generation (see `docs/plugins/diffusers.md`)

## Development

### Project Structure

```
apps/imagegen/
├── src/
│   ├── App.tsx                  # Root component
│   ├── modes/
│   │   ├── LayerMode.tsx        # Canvas interface
│   │   └── BlocksMode.tsx       # Script editor
│   ├── engine/
│   │   └── canvas/
│   │       ├── useCanvas.ts     # Canvas engine
│   │       ├── operations.ts    # Reed operations
│   │       └── scriptToLayers.ts # Script parser
│   └── utils/
│       ├── lotus-connection.ts   # WebSocket client
│       ├── useGeneration.ts     # Generation queue
│       ├── batchGeneration.ts   # Batch utilities
│       ├── templates.ts         # Template management
│       └── useEntityImages.ts   # Entity integration
├── public/
│   └── sw.js                    # Service worker
└── vite.config.ts
```

### Key Technologies

- **SolidJS**: Reactive UI framework
- **Vite**: Build tool and dev server
- **@lotus/scripting**: Reed integration
- **@lotus/web-editor**: Block editor component
- **sharp** (server-side): Image processing via `@lotus/image-io`

## See Also

- [Diffusers Plugin](../plugins/diffusers.md) - Image generation backend
- [Image I/O Package](../packages/image-io.md) - Server-side image processing
