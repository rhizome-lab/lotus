// oxlint-disable prefer-add-event-listener
import { createEffect, createSignal, onCleanup } from "solid-js";

interface CapabilityMetadata {
  type: string;
  label: string;
  description: string;
  methods: {
    name: string;
    label: string;
    description: string;
    parameters: any[];
    returnType: string;
  }[];
}

let ws: WebSocket | null = null;
let messageId = 0;
const pendingRequests = new Map<number, (result: any) => void>();

export function useViwoConnection() {
  const [connected, setConnected] = createSignal(false);
  const [capabilities, setCapabilities] = createSignal<CapabilityMetadata[]>([]);

  createEffect(() => {
    // Connect to viwo server
    ws = new WebSocket("ws://localhost:8080");

    ws.onopen = () => {
      console.log("Connected to viwo server");
      setConnected(true);

      // Fetch capability metadata
      sendRpc("get_capability_metadata", {}).then((metadata) => {
        console.log("Received capability metadata:", metadata);
        setCapabilities(metadata);
      });
    };

    ws.onclose = () => {
      console.log("Disconnected from viwo server");
      setConnected(false);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      // Handle RPC responses
      if ("result" in data && "id" in data) {
        const callback = pendingRequests.get(data.id);
        if (callback) {
          callback(data.result);
          pendingRequests.delete(data.id);
        }
      }

      // Handle notifications (if needed later)
      if ("method" in data && !("id" in data)) {
        console.log("Received notification:", data.method, data.params);
      }
    };

    onCleanup(() => {
      ws?.close();
      ws = null;
    });
  });

  return {
    capabilities,
    connected,
    sendRpc,
  };
}

function sendRpc(method: string, params: any, signal?: AbortSignal): Promise<any> {
  return new Promise((resolve, reject) => {
    // Check if already aborted
    if (signal?.aborted) {
      reject(new Error("Request aborted"));
      return;
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error("WebSocket not connected"));
      return;
    }

    messageId += 1;
    const id = messageId;
    pendingRequests.set(id, resolve);

    // Listen for abort signal
    const abortHandler = () => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error("Request aborted"));
      }
    };

    signal?.addEventListener("abort", abortHandler);

    ws.send(
      JSON.stringify({
        id,
        jsonrpc: "2.0",
        method,
        params,
      }),
    );

    // Timeout after 30 seconds
    const timeoutId = setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        signal?.removeEventListener("abort", abortHandler);
        reject(new Error("Request timeout"));
      }
    }, 30_000);

    // Wrap original resolve to cleanup
    const originalCallback = pendingRequests.get(id);
    if (originalCallback) {
      pendingRequests.set(id, (result: any) => {
        clearTimeout(timeoutId);
        signal?.removeEventListener("abort", abortHandler);
        originalCallback(result);
      });
    }
  });
}

/** Convert a Blob to base64 data URL */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export interface GenerationMetadata {
  prompt: string;
  negative_prompt?: string;
  seed?: number;
  model?: string;
  steps?: number;
  cfg_scale?: number;
  width?: number;
  height?: number;
  [key: string]: any;
}

interface SaveImageOptions {
  imageName: string;
  metadata: GenerationMetadata;
  roomId?: number;
}

/**
 * Save an image as a viwo entity
 * @param sendRpc - RPC send function
 * @param imageBlob - Image blob to save
 * @param options - Save options (imageName, metadata, roomId)
 * @returns The created entity ID
 */
export async function saveImageAsEntity(
  sendRpc: (method: string, params: any, signal?: AbortSignal) => Promise<any>,
  imageBlob: Blob,
  options: SaveImageOptions,
  signal?: AbortSignal,
): Promise<number> {
  // 1. Get sys.create capability
  const createCap = await sendRpc("get_capability", { type: "sys.create" }, signal);

  // 2. Convert blob to base64
  const imageBase64 = await blobToBase64(imageBlob);

  // 3. Create entity
  const entityId = await sendRpc(
    "std.call_method",
    {
      args: [
        {
          image: imageBase64,
          image_type: "generated",
          metadata: JSON.stringify(options.metadata),
          name: options.imageName,
        },
      ],
      method: "create",
      object: createCap,
    },
    signal,
  );

  // 4. Optionally attach to room
  if (options.roomId) {
    await sendRpc(
      "entity.verb",
      {
        args: [entityId],
        entity: options.roomId,
        verb: "addItem",
      },
      signal,
    );
  }

  return entityId;
}
