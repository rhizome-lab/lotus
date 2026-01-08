# Diffusers Plugin

The Diffusers Plugin provides Stable Diffusion image generation capabilities for lotus through a capability-based access control system. It enables text-to-image generation using various Stable Diffusion models via a Python inference server.

## Architecture

The plugin consists of two components:

1. **Python Server** (`plugins/diffusers/server/`): FastAPI server that handles model loading and image generation using Huggingface Diffusers
2. **TypeScript Plugin** (`plugins/diffusers/src/`): Capability class that provides controlled access to the server

## Setup

### Prerequisites

- Python 3.13
- CUDA-capable GPU (recommended, though CPU inference works)
- ~10GB disk space for model weights

### Starting the Server

#### Using Nix (recommended):

```bash
cd plugins/diffusers/server
nix develop
uv sync
uv run uvicorn main:app --host 127.0.0.1 --port 8000
```

#### Without Nix:

```bash
cd plugins/diffusers/server
pip install uv
uv sync
uv run uvicorn main:app --host 127.0.0.1 --port 8000
```

The server will start on `http://localhost:8000`. Visit `/docs` for the interactive API documentation.

## Capabilities

### `diffusers.generate`

The main capability for image generation. Access is controlled through capability ownership and parameters.

**Capability Parameters:**

- `server_url` (required): URL to the Python server (e.g., `"http://localhost:8000"`)
- `default_model` (required): Default Stable Diffusion model ID
- `allowed_models` (optional): Array of model IDs this capability can use

### Creating a Capability

```typescript
// Basic capability with a default model
let genCap = sys.mint.mint("diffusers.generate", {
  server_url: "http://localhost:8000",
  default_model: "stabilityai/stable-diffusion-2-1",
});
```

### Restricting Models

Limit which models can be used by specifying an allowlist:

```typescript
let restrictedCap = sys.mint.mint("diffusers.generate", {
  server_url: "http://localhost:8000",
  default_model: "stabilityai/sdxl-turbo",
  allowed_models: ["stabilityai/sdxl-turbo", "stabilityai/stable-diffusion-2-1"],
});
```

## Methods

### `textToImage(prompt, [options])`

Generates an image from a text prompt.

**Parameters:**

- `prompt` (string): Text description of the image to generate
- `options` (optional object):
  - `modelId` (string): Override the default model
  - `width` (number): Image width in pixels
  - `height` (number): Image height in pixels
  - `numInferenceSteps` (number): Number of denoising steps (default: 50)
  - `guidanceScale` (number): Classifier-free guidance scale (default: 7.5)
  - `negativePrompt` (string): What to avoid in the image
  - `seed` (number): Random seed for reproducibility

**Returns:** Object with:

- `image` (string): Base64-encoded PNG image
- `width` (number): Image width
- `height` (number): Image height
- `format` (string): Image format ("png")

**Example:**

```typescript
// Simple generation
let result = genCap.textToImage("a beautiful sunset over mountains");

// With custom parameters
let customResult = genCap.textToImage("a futuristic cityscape at night", {
  width: 768,
  height: 512,
  numInferenceSteps: 30,
  guidanceScale: 7.5,
  negativePrompt: "blurry, low quality",
  seed: 42,
});

// Override the model
let xlResult = genCap.textToImage("detailed portrait", {
  modelId: "stabilityai/stable-diffusion-xl-base-1.0",
  width: 1024,
  height: 1024,
});
```

## Supported Models

The server auto-detects pipeline type based on model ID:

- **Stable Diffusion 1.5**: `runwayml/stable-diffusion-v1-5`, `stabilityai/stable-diffusion-2-1`
- **Stable Diffusion XL**: `stabilityai/stable-diffusion-xl-base-1.0`, `stabilityai/sdxl-turbo`
- **Stable Diffusion 3**: `stabilityai/stable-diffusion-3-medium`
- **Flux**: `black-forest-labs/FLUX.1-schnell`

Model files will be automatically downloaded from Huggingface Hub on first use and cached locally.

## Resource Control

The capability system provides natural resource limiting:

- **Model restrictions**: Use `allowed_models` to limit which models can be accessed
- **Access control**: Only entities that own the capability can use it
- **Delegation**: Capabilities can be delegated with stricter restrictions
- **GPU isolation**: Python server runs separately, protecting GPU resources

## Development Environment

The top-level flake provides two development shells:

```bash
# TypeScript only (fast, default)
nix develop

# TypeScript + Python for diffusers server
nix develop .#full
```

Alternatively, use the diffusers-specific flake:

```bash
# Python only (for server development/deployment)
nix develop ./plugins/diffusers/server
```

## Troubleshooting

### Server won't start

- Ensure Python 3.13 is installed: `python --version`
- Check if port 8000 is available: `lsof -i :8000`
- Verify dependencies: `uv sync`

### Out of memory errors

- Reduce image dimensions (try 512x512)
- Use a smaller model (e.g., `sdxl-turbo` instead of full SDXL)
- Close other GPU applications
- For CPU: reduce `num_inference_steps`

### Model download fails

- Check internet connection
- Verify Hugging Face Hub is accessible
- Some models may require authentication - set `HF_TOKEN` environment variable

### Image generation is slow

- First generation loads the model (slow)
- Subsequent generations reuse cached pipeline (faster)
- GPU greatly improves speed vs CPU
- Use turbo models for faster iteration: `stabilityai/sdxl-turbo`
