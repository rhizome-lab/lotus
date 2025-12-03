import {
  defineOpcode,
  ScriptValue,
  ScriptError,
  Capability,
  evaluate,
} from "@viwo/scripting";
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

const http_get = defineOpcode<
  [ScriptValue<Capability>, ScriptValue<string>],
  string
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
      { name: "cap", type: "Capability" },
      { name: "url", type: "string" },
    ],
    returnType: "string",
  },
  handler: async (args, ctx) => {
    const [capExpr, urlExpr] = args;
    const cap = evaluate(capExpr, ctx);
    const urlStr = evaluate(urlExpr, ctx);

    if (typeof urlStr !== "string") {
      throw new ScriptError("net.http.get: url must be a string");
    }

    let url: URL;
    try {
      url = new URL(urlStr);
    } catch {
      throw new ScriptError("net.http.get: invalid url");
    }

    checkNetCapability(ctx, cap as Capability, "net.http.read", url.hostname);

    try {
      const response = await fetch(urlStr);
      return await response.text();
    } catch (e: any) {
      throw new ScriptError(`net.http.get failed: ${e.message}`);
    }
  },
});
export { http_get as "net.http.get" };

const http_post = defineOpcode<
  [ScriptValue<Capability>, ScriptValue<string>, ScriptValue<string>],
  string
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
      { name: "cap", type: "Capability" },
      { name: "url", type: "string" },
      { name: "body", type: "string" },
    ],
    returnType: "string",
  },
  handler: async (args, ctx) => {
    const [capExpr, urlExpr, bodyExpr] = args;
    const cap = evaluate(capExpr, ctx);
    const urlStr = evaluate(urlExpr, ctx);
    const body = evaluate(bodyExpr, ctx);

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

    checkNetCapability(ctx, cap as Capability, "net.http.write", url.hostname);

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
export { http_post as "net.http.post" };
