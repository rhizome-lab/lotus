import { describe, test, expect, beforeEach, mock } from "bun:test";

// Mock fs and fetch
mock.module("node:fs/promises", () => ({
  readFile: mock((_path: string) => Promise.resolve("file content")),
  writeFile: mock((_path: string, _content: string) => Promise.resolve()),
  readdir: mock((_path: string) => Promise.resolve(["file1.txt", "file2.txt"])),
}));

// const originalFetch = global.fetch;
global.fetch = mock((_url: string | Request | URL) =>
  Promise.resolve(new Response("http response")),
) as any;

import {
  evaluate,
  createScriptContext,
  registerLibrary,
  StdLib as Std,
  ObjectLib,
  ListLib as List,
} from "@viwo/scripting";
import { Entity } from "@viwo/shared/jsonrpc";
import { createEntity, getEntity, createCapability } from "./repo";
import * as Kernel from "./runtime/lib/kernel";
import * as FS from "./runtime/lib/fs";
import * as Net from "./runtime/lib/net";
import { db } from "./db";

describe("System Integration Security", () => {
  registerLibrary(Std);
  registerLibrary(ObjectLib);
  registerLibrary(List);
  registerLibrary(Kernel);
  registerLibrary(FS);
  registerLibrary(Net);

  let admin: Entity;
  let user: Entity;

  beforeEach(() => {
    // Reset DB state
    db.query("DELETE FROM entities").run();
    db.query("DELETE FROM capabilities").run();
    db.query("DELETE FROM sqlite_sequence").run();

    // Create Admin (with full access)
    const adminId = createEntity({ name: "Admin" });
    admin = getEntity(adminId)!;
    createCapability(adminId, "fs.read", { path: "/tmp" });
    createCapability(adminId, "fs.write", { path: "/tmp" });
    createCapability(adminId, "net.http.read", { domain: "example.com" });

    // Create User (no rights)
    const userId = createEntity({ name: "User" });
    user = getEntity(userId)!;
  });

  test("FS.read with capability", async () => {
    const ctx = createScriptContext({ caller: admin, this: admin, args: [] });
    const content = await evaluate(
      FS["fs.read"](Kernel["get_capability"]("fs.read"), "/tmp/test.txt"),
      ctx,
    );
    expect(content).toBe("file content");
  });

  test("FS.read without capability", async () => {
    const ctx = createScriptContext({ caller: user, this: user, args: [] });
    expect(
      evaluate(
        FS["fs.read"](
          Kernel["get_capability"]("fs.read"), // User has none, returns null
          "/tmp/test.txt",
        ),
        ctx,
      ),
    ).rejects.toThrow();
  });

  test("FS.read outside allowed path", async () => {
    const ctx = createScriptContext({ caller: admin, this: admin, args: [] });
    expect(
      evaluate(
        FS["fs.read"](
          Kernel["get_capability"]("fs.read"),
          "/etc/passwd", // Outside /tmp
        ),
        ctx,
      ),
    ).rejects.toThrow();
  });

  test("Net.http.get with capability", async () => {
    const ctx = createScriptContext({ caller: admin, this: admin, args: [] });
    const response = await evaluate(
      Net["net.http.get"](
        Kernel["get_capability"]("net.http.read"),
        "https://api.example.com/data",
      ),
      ctx,
    );
    expect(response).toBe("http response");
  });

  test("Net.http.get domain mismatch", async () => {
    const ctx = createScriptContext({ caller: admin, this: admin, args: [] });
    expect(
      evaluate(
        Net["net.http.get"](
          Kernel["get_capability"]("net.http.read"),
          "https://google.com", // Not example.com
        ),
        ctx,
      ),
    ).rejects.toThrow();
  });
});
