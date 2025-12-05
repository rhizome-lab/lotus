import { defineFullOpcode, ScriptError, Capability } from "@viwo/scripting";
import { checkCapability } from "@viwo/core";

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

export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  __response: Response;
}

// TODO: Support JSON body
export const netHttpFetch = defineFullOpcode<
  [
    Capability | null,
    string,
    {
      readonly method?: string;
      readonly headers?: Record<string, string>;
      readonly body?: string;
    }?,
  ],
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
      { name: "cap", type: "Capability | null", description: "The capability to use." },
      { name: "url", type: "string", description: "The URL to fetch." },
      { name: "options", type: "object", optional: true, description: "The fetch options." },
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

export const netHttpResponseText = defineFullOpcode<[HttpResponse], string>(
  "net.http.response_text",
  {
    metadata: {
      label: "Response Text",
      category: "net",
      description: "Get response body as text",
      slots: [{ name: "Response", type: "block" }],
      parameters: [{ name: "response", type: "object", description: "The response object." }],
      returnType: "string",
    },
    handler: async ([response], _ctx) => {
      if (!response || !response.__response) {
        throw new ScriptError("net.http.response_text: invalid response object");
      }
      return await (response as HttpResponse).__response.text();
    },
  },
);

export const netHttpResponseJson = defineFullOpcode<[HttpResponse], any>("net.http.response_json", {
  metadata: {
    label: "Response JSON",
    category: "net",
    description: "Get response body as JSON",
    slots: [{ name: "Response", type: "block" }],
    parameters: [{ name: "response", type: "object", description: "The response object." }],
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

export const netHttpResponseBytes = defineFullOpcode<[HttpResponse], number[]>(
  "net.http.response_bytes",
  {
    metadata: {
      label: "Response Bytes",
      category: "net",
      description: "Get response body as bytes",
      slots: [{ name: "Response", type: "block" }],
      parameters: [{ name: "response", type: "object", description: "The response object." }],
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
