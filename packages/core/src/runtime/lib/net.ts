import { defineOpcode, ScriptError, Capability } from "@viwo/scripting";
import { checkCapability } from "../utils";

function checkNetCapability(ctx: any, cap: Capability, targetDomain: string, method: string) {
  checkCapability(cap, ctx.this.id, "net.http", (params) => {
    const allowedDomain = params["domain"] as string;
    if (!allowedDomain) return false;

    // Simple domain suffix check
    // "example.com" allows "api.example.com"
    if (!targetDomain.endsWith(allowedDomain)) return false;

    // Method check
    const allowedMethods = params["methods"] as string[] | undefined;
    if (allowedMethods) {
      if (!Array.isArray(allowedMethods)) return false;
      if (!allowedMethods.includes(method)) return false;
    }

    return true;
  });
}

interface HttpResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  __response: Response;
}

export const netHttpFetch = defineOpcode<
  [Capability | null, string, Record<string, any>?],
  Promise<HttpResponse>
>("net.http.fetch", {
  metadata: {
    label: "HTTP Fetch",
    category: "net",
    description: "Perform an HTTP request",
    slots: [
      { name: "Cap", type: "block" },
      { name: "URL", type: "string" },
      { name: "Options", type: "block" },
    ],
    parameters: [
      { name: "cap", type: "Capability | null" },
      { name: "url", type: "string" },
      { name: "options", type: "object", optional: true },
    ],
    returnType: "Promise<object>",
  },
  handler: async ([cap, urlStr, options], ctx) => {
    if (!cap) {
      throw new ScriptError("net.http.fetch: missing capability");
    }

    if (typeof urlStr !== "string") {
      throw new ScriptError("net.http.fetch: url must be a string");
    }

    const method = (options?.method as string) || "GET";
    const headers = (options?.headers as Record<string, string>) || {};
    const body = (options?.body as string | undefined) ?? null;

    let url: URL;
    try {
      url = new URL(urlStr);
    } catch {
      throw new ScriptError("net.http.fetch: invalid url");
    }

    checkNetCapability(ctx, cap, url.hostname, method);

    console.log("Calling fetch with", urlStr, method);
    try {
      const response = await fetch(urlStr, { method, headers, body });

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        __response: response,
      };
    } catch (e: any) {
      throw new ScriptError(`net.http.fetch failed: ${e.message}`);
    }
  },
});

export const netHttpResponseText = defineOpcode<[HttpResponse], string>("net.http.response_text", {
  metadata: {
    label: "Response Text",
    category: "net",
    description: "Get response body as text",
    slots: [{ name: "Response", type: "block" }],
    parameters: [{ name: "response", type: "object" }],
    returnType: "string",
  },
  handler: async ([response], _ctx) => {
    if (!response || !response.__response) {
      throw new ScriptError("net.http.response_text: invalid response object");
    }
    return await (response as HttpResponse).__response.text();
  },
});

export const netHttpResponseJson = defineOpcode<[HttpResponse], any>("net.http.response_json", {
  metadata: {
    label: "Response JSON",
    category: "net",
    description: "Get response body as JSON",
    slots: [{ name: "Response", type: "block" }],
    parameters: [{ name: "response", type: "object" }],
    returnType: "any",
  },
  handler: async ([response], _ctx) => {
    if (!response || !response.__response) {
      throw new ScriptError("net.http.response_json: invalid response object");
    }
    try {
      return await (response as HttpResponse).__response.json();
    } catch {
      throw new ScriptError("net.http.response_json: failed to parse JSON");
    }
  },
});

export const netHttpResponseBytes = defineOpcode<[HttpResponse], number[]>(
  "net.http.response_bytes",
  {
    metadata: {
      label: "Response Bytes",
      category: "net",
      description: "Get response body as bytes",
      slots: [{ name: "Response", type: "block" }],
      parameters: [{ name: "response", type: "object" }],
      returnType: "number[]",
    },
    handler: async ([response], _ctx) => {
      if (!response || !response.__response) {
        throw new ScriptError("net.http.response_bytes: invalid response object");
      }
      return Array.from(await (response as HttpResponse).__response.bytes());
    },
  },
);
