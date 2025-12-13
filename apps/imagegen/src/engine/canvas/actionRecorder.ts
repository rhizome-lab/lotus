export type CanvasAction =
  | { layerId: string; name: string; type: "layer.create" }
  | { controlType: string; layerId: string; name: string; type: "layer.create_control" }
  | { layerId: string; type: "layer.remove" }
  | { layerId: string; updates: any; type: "layer.update" }
  | { layerId: string; type: "layer.setActive" }
  | { color: string; size: number; tool: string; type: "draw.start"; x: number; y: number }
  | { type: "draw.move"; x: number; y: number }
  | { type: "draw.end" }
  | {
      bbox: { height: number; width: number; x: number; y: number };
      layerId: string;
      negativePrompt?: string;
      prompt: string;
      type: "generate";
    };

export function actionsToViwoScript(actions: CanvasAction[]): string {
  const lines: string[] = [];
  lines.push("// Generated from Layer Mode actions");
  lines.push("// This script recreates the canvas state");
  lines.push("");

  for (const action of actions) {
    switch (action.type) {
      case "layer.create": {
        lines.push(`// Create layer: ${action.name}`);
        lines.push(`const ${action.layerId} = createLayer("${action.name}");`);
        break;
      }

      case "layer.remove": {
        lines.push(`// Remove layer ${action.layerId}`);
        lines.push(`removeLayer(${action.layerId});`);
        break;
      }

      case "layer.update": {
        lines.push(`// Update layer ${action.layerId}`);
        lines.push(`updateLayer(${action.layerId}, ${JSON.stringify(action.updates)});`);
        break;
      }

      case "layer.setActive": {
        lines.push(`setActiveLayer(${action.layerId});`);
        break;
      }

      case "generate": {
        lines.push("");
        lines.push(`// Generate image`);
        lines.push(`const generatedImage = await generate({`);
        lines.push(`  prompt: "${action.prompt}",`);
        if (action.negativePrompt) {
          lines.push(`  negativePrompt: "${action.negativePrompt}",`);
        }
        lines.push(`  bbox: ${JSON.stringify(action.bbox)},`);
        lines.push(`});`);
        lines.push(`loadImageToLayer(${action.layerId}, generatedImage);`);
        break;
      }
    }
  }

  return lines.join("\n");
}

export function exportAsViwoScript(actions: CanvasAction[]): void {
  const script = actionsToViwoScript(actions);
  const blob = new Blob([script], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `canvas-actions-${Date.now()}.viwo`;
  a.click();
  URL.revokeObjectURL(url);
}
