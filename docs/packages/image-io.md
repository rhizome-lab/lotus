# Image I/O Package

Server-side image processing package for lotus, built on the high-performance `sharp` library.

## Overview

The `@lotus/image-io` package provides comprehensive image manipulation capabilities for server-side operations. It's designed for use with lotus's `ImageEntity` system, enabling secure, efficient image processing without client-side execution.

## Why sharp?

- **Performance**: 4-7x faster than ImageMagick
- **Memory efficient**: Uses libvips for low memory usage
- **Format support**: PNG, JPEG, WebP, TIFF, AVIF, and more
- **Native bindings**: C++ bindings via libvips

## API Reference

### Metadata Operations

#### `embedMetadata(image, format, metadata)`

Embed metadata into an image using EXIF tags.

**Parameters:**

- `image` (Buffer): Source image buffer
- `format` ("png" | "jpeg" | "webp"): Image format
- `metadata` (object): Metadata to embed

**Returns:** `Promise<Buffer>` - Image with embedded metadata

**Example:**

```typescript
import { embedMetadata } from "@lotus/image-io";

const imageWithMetadata = await embedMetadata(imageBuffer, "png", {
  prompt: "a beautiful landscape",
  model: "stable-diffusion-xl-base-1.0",
  steps: 50,
  seed: 12345,
  created: Date.now(),
});
```

#### `readMetadata(image, format)`

Extract metadata from an image.

**Parameters:**

- `image` (Buffer): Image buffer
- `format` (string): Image format

**Returns:** `Promise<object>` - Parsed metadata object

**Example:**

```typescript
import { readMetadata } from "@lotus/image-io";

const metadata = await readMetadata(imageBuffer, "png");
console.log(metadata.prompt); // "a beautiful landscape"
```

### Format Conversion

#### `convertImage(image, fromFormat, toFormat, options)`

Convert image between formats with optional metadata preservation.

**Parameters:**

- `image` (Buffer): Source image buffer
- `fromFormat` (string): Source format
- `toFormat` (string): Target format
- `options` (object):
  - `quality` (number): Output quality 1-100 (for lossy formats)
  - `preserveMetadata` (boolean): Whether to preserve EXIF metadata

**Returns:** `Promise<Buffer>` - Converted image

**Example:**

```typescript
import { convertImage } from "@lotus/image-io";

// Convert PNG to JPEG with metadata preservation
const jpegImage = await convertImage(pngBuffer, "png", "jpeg", {
  quality: 90,
  preserveMetadata: true,
});

// Convert to WebP for smaller file size
const webpImage = await convertImage(pngBuffer, "png", "webp", {
  quality: 85,
  preserveMetadata: false,
});
```

### Image Transformations

#### `transformImage(image, format, options)`

Rotate and scale images.

**Parameters:**

- `image` (Buffer): Source image buffer
- `format` (string): Image format
- `options` (object):
  - `rotation` (number): Rotation angle in degrees (0, 90, 180, 270)
  - `scale` (number): Scale factor (e.g., 2.0 for 2x)

**Returns:** `Promise<Buffer>` - Transformed image

**Example:**

```typescript
import { transformImage } from "@lotus/image-io";

// Rotate 90 degrees clockwise
const rotated = await transformImage(imageBuffer, "png", {
  rotation: 90,
  scale: 1.0,
});

// Scale to 2x size
const scaled = await transformImage(imageBuffer, "png", {
  rotation: 0,
  scale: 2.0,
});

// Rotate and scale in one operation
const transformed = await transformImage(imageBuffer, "png", {
  rotation: 180,
  scale: 0.5,
});
```

### Image Filtering

#### `filterImage(image, format, filterType)`

Apply image filters.

**Parameters:**

- `image` (Buffer): Source image buffer
- `format` (string): Image format
- `filterType` ("blur" | "sharpen" | "grayscale"): Filter to apply

**Returns:** `Promise<Buffer>` - Filtered image

**Example:**

```typescript
import { filterImage } from "@lotus/image-io";

// Apply gaussian blur
const blurred = await filterImage(imageBuffer, "png", "blur");

// Sharpen image
const sharpened = await filterImage(imageBuffer, "png", "sharpen");

// Convert to grayscale
const grayscale = await filterImage(imageBuffer, "png", "grayscale");
```

### Image Compositing

#### `compositeImages(baseImage, overlayImage, format, options)`

Overlay one image on top of another.

**Parameters:**

- `baseImage` (Buffer): Base image buffer
- `overlayImage` (Buffer): Overlay image buffer
- `format` (string): Output format
- `options` (object):
  - `x` (number): X position of overlay
  - `y` (number): Y position of overlay

**Returns:** `Promise<Buffer>` - Composited image

**Example:**

```typescript
import { compositeImages } from "@lotus/image-io";

// Overlay logo at position (100, 100)
const withLogo = await compositeImages(baseImage, logoImage, "png", {
  x: 100,
  y: 100,
});

// Center overlay
const width = 1024;
const height = 768;
const overlayWidth = 256;
const overlayHeight = 256;
const centered = await compositeImages(baseImage, overlayImage, "png", {
  x: (width - overlayWidth) / 2,
  y: (height - overlayHeight) / 2,
});
```

## Integration with ImageEntity

The package is used by `ImageEntity` in `packages/core/src/seeds/definitions/Image.ts`:

```typescript
// Transform verb
async image_transform(ctx: ScriptContext, rotation: number, scale: number) {
  const imageData = this.props.get("image_data");
  const format = this.props.get("format") ?? "png";

  const transformed = await transformImage(
    Buffer.from(imageData, "base64"),
    format,
    { rotation, scale }
  );

  this.props.set("image_data", transformed.toString("base64"));
  return this;
}

// Filter verb
async image_filter(ctx: ScriptContext, filterType: "blur" | "sharpen" | "grayscale") {
  const imageData = this.props.get("image_data");
  const format = this.props.get("format") ?? "png";

  const filtered = await filterImage(
    Buffer.from(imageData, "base64"),
    format,
    filterType
  );

  this.props.set("image_data", filtered.toString("base64"));
  return this;
}
```

## Performance Considerations

### Memory Usage

- Sharp processes images in streams when possible
- Use appropriate image sizes to avoid memory issues
- Large batch operations should be rate-limited

### Format Selection

- **PNG**: Lossless, best for graphics with transparency
- **JPEG**: Lossy, best for photographs (smaller file size)
- **WebP**: Modern format, good compression with quality
- **AVIF**: Newest format, excellent compression (slower encoding)

### Optimization Tips

```typescript
// Good: Reuse buffers when chaining operations
const processed = await filterImage(
  await transformImage(imageBuffer, "png", { rotation: 90, scale: 1.0 }),
  "png",
  "sharpen",
);

// Better: Use sharp's chaining API directly for multiple operations
// (when you need more control than the provided functions)
import sharp from "sharp";

const processed = await sharp(imageBuffer).rotate(90).sharpen().png().toBuffer();
```

## Error Handling

All functions throw errors for invalid inputs:

```typescript
try {
  const result = await transformImage(imageBuffer, "png", {
    rotation: 45, // Invalid: only 0, 90, 180, 270 supported
    scale: 1.0,
  });
} catch (error) {
  console.error("Transform failed:", error.message);
}
```

Common errors:

- Invalid image buffer
- Unsupported format
- Invalid parameters (rotation, scale, filter type)
- Out of memory for very large images

## Testing

The package includes comprehensive tests:

```bash
bun test packages/image-io/src/index.test.ts
```

Tests cover:

- Metadata embedding and extraction
- Format conversion with metadata preservation
- All transformation operations
- All filter types
- Compositing with various positions
- Error cases and validation

## See Also

- [ImageEntity Definition](../../packages/core/src/seeds/definitions/Image.ts) - Entity integration
- [Image Generation App](../apps/imagegen.md) - Frontend usage
- [sharp Documentation](https://sharp.pixelplumbing.com/) - Underlying library
