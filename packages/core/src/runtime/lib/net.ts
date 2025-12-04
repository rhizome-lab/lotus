import { defineOpcode, ScriptError, Capability } from "@viwo/scripting";
import { checkCapability } from "../utils";

function checkNetCapability(
  ctx: any,
  cap: Capability,
  type: string,
  targetDomain: string,
) {
  checkCapability(cap, ctx.this.id, type, (params) => {
    const allowedDomain = params["domain"] as string;
    if (!allowedDomain) return false;

    // Simple domain suffix check
    // "example.com" allows "api.example.com"
    return targetDomain.endsWith(allowedDomain);
  });
}

export const netHttpGet = defineOpcode<
  [Capability | null, string],
  Promise<string>
>("net.http.get", {
  metadata: {
    label: "HTTP GET",
    category: "net",
    description: "Perform an HTTP GET request",
    slots: [
      { name: "Cap", type: "block" },
      { name: "URL", type: "string" },
    ],
    parameters: [
      { name: "cap", type: "Capability | null" },
      { name: "url", type: "string" },
    ],
    returnType: "Promise<string>",
  },
  handler: async ([cap, urlStr], ctx) => {
    if (!cap) {
      throw new ScriptError("net.http.get: missing capability");
    }

    if (typeof urlStr !== "string") {
      throw new ScriptError("net.http.get: url must be a string");
    }

    let url: URL;
    try {
      url = new URL(urlStr);
    } catch {
      throw new ScriptError("net.http.get: invalid url");
    }

    checkNetCapability(ctx, cap, "net.http.read", url.hostname);

    try {
      const response = await fetch(urlStr);
      return await response.text();
    } catch (e: any) {
      throw new ScriptError(`net.http.get failed: ${e.message}`);
    }
  },
});

export const netHttpPost = defineOpcode<
  [Capability | null, string, string],
  Promise<string>
>("net.http.post", {
  metadata: {
    label: "HTTP POST",
    category: "net",
    description: "Perform an HTTP POST request",
    slots: [
      { name: "Cap", type: "block" },
      { name: "URL", type: "string" },
      { name: "Body", type: "string" },
    ],
    parameters: [
      { name: "cap", type: "Capability | null" },
      { name: "url", type: "string" },
      { name: "body", type: "string" },
    ],
    returnType: "Promise<string>",
  },
  handler: async ([cap, urlStr, body], ctx) => {
    if (!cap) {
      throw new ScriptError("net.http.post: missing capability");
    }

    if (typeof urlStr !== "string") {
      throw new ScriptError("net.http.post: url must be a string");
    }
    if (typeof body !== "string") {
      throw new ScriptError("net.http.post: body must be a string");
    }

    let url: URL;
    try {
      url = new URL(urlStr);
    } catch {
      throw new ScriptError("net.http.post: invalid url");
    }

    checkNetCapability(ctx, cap, "net.http.write", url.hostname);

    try {
      const response = await fetch(urlStr, {
        method: "POST",
        body: body,
      });
      return await response.text();
    } catch (e: any) {
      throw new ScriptError(`net.http.post failed: ${e.message}`);
    }
  },
});
