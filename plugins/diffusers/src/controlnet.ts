import { BaseCapability, registerCapabilityClass } from "@viwo/core";
import { ScriptError } from "@viwo/scripting";

export class ControlNetCapability extends BaseCapability {
  static override readonly type = "controlnet.generate";

  async getAvailableTypes(ctx?: any) {
    // Check capability ownership
    if (this.ownerId !== ctx.this.id) {
      throw new ScriptError("controlnet.generate: missing capability");
    }

    // Validate capability params
    const serverUrl = this.params["server_url"] as string;

    if (!serverUrl || typeof serverUrl !== "string") {
      throw new ScriptError("controlnet.generate: invalid server_url in capability");
    }

    // Fetch available types from server
    try {
      const response = await fetch(`${serverUrl}/controlnet/types`);

      if (!response.ok) {
        const error = await response.text();
        throw new ScriptError(`controlnet server error: ${error}`);
      }

      const result = (await response.json()) as {
        types: { type: string; label: string; description: string }[];
      };
      return result.types; // [{ type, label, description }, ...]
    } catch (error: any) {
      throw new ScriptError(`controlnet.getAvailableTypes failed: ${error.message}`);
    }
  }

  async preprocess(image: string, controlType: string, ctx?: any) {
    // Check capability ownership
    if (this.ownerId !== ctx.this.id) {
      throw new ScriptError("controlnet.generate: missing capability");
    }

    // Validate capability params
    const serverUrl = this.params["server_url"] as string;

    if (!serverUrl || typeof serverUrl !== "string") {
      throw new ScriptError("controlnet.generate: invalid server_url in capability");
    }

    // Validate control type is a string
    if (typeof controlType !== "string") {
      throw new ScriptError("controlnet.preprocess: type must be a string");
    }

    // Make HTTP request to server
    try {
      const response = await fetch(`${serverUrl}/controlnet/preprocess`, {
        body: JSON.stringify({
          image, // base64 encoded
          type: controlType,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.text();
        throw new ScriptError(`controlnet server error: ${error}`);
      }

      const result = await response.json();
      return result; // { image: base64string, width, height, format }
    } catch (error: any) {
      throw new ScriptError(`controlnet.preprocess failed: ${error.message}`);
    }
  }

  async apply(controlImage: string, prompt: string, controlType: string, ctx?: any) {
    // Check capability ownership
    if (this.ownerId !== ctx.this.id) {
      throw new ScriptError("controlnet.generate: missing capability");
    }

    // Validate capability params
    const serverUrl = this.params["server_url"] as string;
    const allowedModels = this.params["allowed_models"] as string[] | undefined;

    if (!serverUrl || typeof serverUrl !== "string") {
      throw new ScriptError("controlnet.generate: invalid server_url in capability");
    }

    // Validate control type
    if (typeof controlType !== "string") {
      throw new ScriptError("controlnet.apply: type must be a string");
    }

    // Get options from params
    const modelId = this.params["default_model"] ?? "runwayml/stable-diffusion-v1-5";
    const strength = this.params["strength"] ?? 1;
    const width = this.params["width"] as number | undefined;
    const height = this.params["height"] as number | undefined;
    const numInferenceSteps = this.params["num_inference_steps"] ?? 50;
    const guidanceScale = this.params["guidance_scale"] ?? 7.5;
    const negativePrompt = this.params["negative_prompt"] as string | undefined;
    const seed = this.params["seed"] as number | undefined;

    // Check model allowlist
    if (allowedModels && !allowedModels.includes(modelId as string)) {
      throw new ScriptError(`controlnet.apply: model '${modelId}' not allowed`);
    }

    // Make HTTP request to server
    try {
      const response = await fetch(`${serverUrl}/controlnet/generate`, {
        body: JSON.stringify({
          control_image: controlImage, // base64 encoded
          guidance_scale: guidanceScale,
          height,
          model_id: modelId,
          negative_prompt: negativePrompt,
          num_inference_steps: numInferenceSteps,
          prompt,
          seed,
          strength,
          type: controlType,
          width,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.text();
        throw new ScriptError(`controlnet server error: ${error}`);
      }

      const result = await response.json();
      return result; // { image: base64string, width, height, format }
    } catch (error: any) {
      throw new ScriptError(`controlnet.apply failed: ${error.message}`);
    }
  }
}

declare module "@viwo/core" {
  interface CapabilityRegistry {
    [ControlNetCapability.type]: typeof ControlNetCapability;
  }
}

registerCapabilityClass(ControlNetCapability);
