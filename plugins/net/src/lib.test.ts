import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import {
  createScriptContext,
  evaluate,
  registerLibrary,
  ScriptError,
  StdLib,
  ObjectLib,
  ListLib,
} from "@viwo/scripting";
import { createCapability, KernelLib, createEntity, getEntity, db } from "@viwo/core";
import * as NetLib from "./lib";

// Mock fetch
const originalFetch = global.fetch;
const mockFetch = mock();

registerLibrary(StdLib);
registerLibrary(ObjectLib);
registerLibrary(ListLib);
registerLibrary(KernelLib);
registerLibrary(NetLib);

describe("net.http", () => {
  let admin: { id: number };
  let user: { id: number };

  beforeEach(() => {
    // Reset DB state
    db.query("DELETE FROM entities").run();
    db.query("DELETE FROM capabilities").run();
    db.query("DELETE FROM sqlite_sequence").run();

    // Create Admin (with full access)
    const adminId = createEntity({ name: "Admin" });
    admin = getEntity(adminId)!;
    createCapability(adminId, "net.http", { domain: "example.com", method: ["GET"] });

    // Create User (no rights)
    const userId = createEntity({ name: "User" });
    user = getEntity(userId)!;

    mockFetch.mockReset();
    // @ts-expect-error
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("net.http.fetch", () => {
    it("should fetch with valid capability", async () => {
      const ctx = createScriptContext({ caller: admin, this: admin });
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "Content-Type": "text/plain" }),
        text: async () => "Hello World",
        bytes: async () => new Uint8Array(new TextEncoder().encode("Hello World").buffer),
      });

      const response = await evaluate(
        NetLib.netHttpFetch(KernelLib.getCapability("net.http"), "https://example.com/api", {}),
        ctx,
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/api",
        expect.objectContaining({ method: "GET" }),
      );
      expect(response).toEqual(
        expect.objectContaining({
          ok: true,
          status: 200,
          statusText: "OK",
        }),
      );
    });

    it("should fail if capability is missing", async () => {
      const ctx = createScriptContext({ caller: user, this: user });
      expect(evaluate(NetLib.netHttpFetch(null, "https://example.com", {}), ctx)).rejects.toThrow(
        ScriptError,
      );
    });

    it("should fail if domain does not match", async () => {
      const ctx = createScriptContext({ caller: admin, this: admin });
      expect(
        evaluate(
          NetLib.netHttpFetch(KernelLib.getCapability("net.http"), "https://google.com", {}),
          ctx,
        ),
      ).rejects.toThrow(ScriptError);
    });

    it("should fail if method is not allowed", async () => {
      const ctx = createScriptContext({ caller: admin, this: admin });
      // Admin only has GET
      expect(
        evaluate(
          NetLib.netHttpFetch(KernelLib.getCapability("net.http"), "https://example.com", {
            method: "POST",
          }),
          ctx,
        ),
      ).rejects.toThrow(ScriptError);
    });

    it("should allow method if methods param is missing", async () => {
      // Create a user with no method restriction
      const unrestrictedId = createEntity({ name: "Unrestricted" });
      const unrestricted = getEntity(unrestrictedId)!;
      createCapability(unrestrictedId, "net.http", { domain: "example.com" });

      const ctx = createScriptContext({ caller: unrestricted, this: unrestricted });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers(),
        text: async () => "",
        bytes: async () => new Uint8Array(),
      });

      await evaluate(
        NetLib.netHttpFetch(KernelLib.getCapability("net.http"), "https://example.com", {
          method: "POST",
        }),
        ctx,
      );
      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  describe("response parsing", () => {
    const mockResponse: NetLib.HttpResponse = {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: {},
      __response: {
        text: async () => '{"foo":"bar"}',
        json: async () => ({ foo: "bar" }),
        bytes: async () => new Uint8Array(new TextEncoder().encode('{"foo":"bar"}').buffer),
      } as Response,
    };

    it("should parse text", async () => {
      const ctx = createScriptContext({ caller: admin, this: admin });
      const text = await evaluate(NetLib.netHttpResponseText(mockResponse), ctx);
      expect(text).toBe('{"foo":"bar"}');
    });

    it("should parse json", async () => {
      const ctx = createScriptContext({ caller: admin, this: admin });
      const json = await evaluate(NetLib.netHttpResponseJson(mockResponse), ctx);
      expect(json).toEqual({ foo: "bar" });
    });

    it("should parse bytes", async () => {
      const ctx = createScriptContext({ caller: admin, this: admin });
      const bytes = await evaluate(NetLib.netHttpResponseBytes(mockResponse), ctx);
      expect(bytes).toEqual(Array.from(new TextEncoder().encode('{"foo":"bar"}')));
    });
  });
});
