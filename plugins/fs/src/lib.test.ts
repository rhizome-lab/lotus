import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { createCapability, KernelLib, createEntity, getEntity, db } from "@viwo/core";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import {
  createScriptContext,
  evaluate,
  registerLibrary,
  StdLib,
  ObjectLib,
  ListLib,
} from "@viwo/scripting";
import * as FsLib from "./lib";

registerLibrary(StdLib);
registerLibrary(ObjectLib);
registerLibrary(ListLib);
registerLibrary(KernelLib);
registerLibrary(FsLib);

describe("FS Library", () => {
  const testDir = path.resolve(`./tmp_test_fs_${Math.random()}`);
  let admin: { id: number };
  let user: { id: number };

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Reset DB state
    db.query("DELETE FROM entities").run();
    db.query("DELETE FROM capabilities").run();
    db.query("DELETE FROM sqlite_sequence").run();

    // Create Admin (with full access)
    const adminId = createEntity({ name: "Admin" });
    admin = getEntity(adminId)!;
    createCapability(adminId, "fs.write", { path: testDir });
    createCapability(adminId, "fs.read", { path: testDir });

    // Create User (no rights)
    const userId = createEntity({ name: "User" });
    user = getEntity(userId)!;
  });

  it("should write to a file", async () => {
    const ctx = createScriptContext({ caller: admin, this: admin });
    const filePath = path.join(testDir, "test.txt");
    await evaluate(
      FsLib.fsWrite(KernelLib.getCapability("fs.write"), filePath, "Hello World"),
      ctx,
    );

    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("Hello World");
  });

  it("should read from a file", async () => {
    const ctx = createScriptContext({ caller: admin, this: admin });
    const filePath = path.join(testDir, "read_test.txt");
    await fs.writeFile(filePath, "Read Me");
    const content = await evaluate(FsLib.fsRead(KernelLib.getCapability("fs.read"), filePath), ctx);
    expect(content).toBe("Read Me");
  });

  it("should list files in a directory", async () => {
    const ctx = createScriptContext({ caller: admin, this: admin });
    const filePath = path.join(testDir, "test2.txt");
    await fs.writeFile(filePath, "Test 2");
    const files = await evaluate(FsLib.fsList(KernelLib.getCapability("fs.read"), testDir), ctx);
    expect(files).toContain("test.txt");
    expect(files).toContain("test2.txt");
  });

  it("should fail without capability", async () => {
    const ctx = createScriptContext({ caller: user, this: user });
    expect(evaluate(FsLib.fsWrite(null, "path", "content"), ctx)).rejects.toThrow(
      "fs.write: missing capability",
    );
  });

  it("should fail to read without capability", async () => {
    const ctx = createScriptContext({ caller: user, this: user });
    expect(
      evaluate(
        FsLib.fsRead(
          KernelLib.getCapability("fs.read"), // User has none, returns null
          path.join(testDir, "test.txt"),
        ),
        ctx,
      ),
    ).rejects.toThrow();
  });

  it("should fail to read outside allowed path", async () => {
    const ctx = createScriptContext({ caller: admin, this: admin });
    expect(
      evaluate(
        FsLib.fsRead(
          KernelLib.getCapability("fs.read"),
          "/etc/passwd", // Outside /tmp
        ),
        ctx,
      ),
    ).rejects.toThrow();
  });
});
