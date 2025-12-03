import { defineOpcode, ScriptError, Capability } from "@viwo/scripting";
import { checkCapability } from "../utils";
import * as fs from "node:fs/promises";
import * as path from "node:path";

function checkFsCapability(ctx: any, cap: Capability, type: string, targetPath: string) {
  checkCapability(cap, ctx.this.id, type, (params) => {
    const allowedPath = params["path"];
    if (!allowedPath || typeof allowedPath !== "string") {
      return false;
    }

    const resolvedTarget = path.resolve(targetPath);
    const resolvedAllowed = path.resolve(allowedPath);

    return resolvedTarget.startsWith(resolvedAllowed);
  });
}

const read = defineOpcode<[Capability | null, string], Promise<string>>("fs.read", {
  metadata: {
    label: "Read File",
    category: "fs",
    description: "Read content from a file",
    slots: [
      { name: "Cap", type: "block" },
      { name: "Path", type: "string" },
    ],
    parameters: [
      { name: "cap", type: "Capability | null" },
      { name: "path", type: "string" },
    ],
    returnType: "Promise<string>",
  },
  handler: async ([cap, filePath], ctx) => {
    if (!cap) {
      throw new ScriptError("fs.read: missing capability");
    }

    if (typeof filePath !== "string") {
      throw new ScriptError("fs.read: path must be a string");
    }

    checkFsCapability(ctx, cap, "fs.read", filePath);

    try {
      return await fs.readFile(filePath, "utf-8");
    } catch (e: any) {
      throw new ScriptError(`fs.read failed: ${e.message}`);
    }
  },
});
export { read as "fs.read" };

const write = defineOpcode<[Capability | null, string, string], Promise<null>>("fs.write", {
  metadata: {
    label: "Write File",
    category: "fs",
    description: "Write content to a file",
    slots: [
      { name: "Cap", type: "block" },
      { name: "Path", type: "string" },
      { name: "Content", type: "string" },
    ],
    parameters: [
      { name: "cap", type: "Capability | null" },
      { name: "path", type: "string" },
      { name: "content", type: "string" },
    ],
    returnType: "Promise<null>",
  },
  handler: async ([cap, filePath, content], ctx) => {
    if (!cap) {
      throw new ScriptError("fs.write: missing capability");
    }

    if (typeof filePath !== "string") {
      throw new ScriptError("fs.write: path must be a string");
    }
    if (typeof content !== "string") {
      throw new ScriptError("fs.write: content must be a string");
    }

    checkFsCapability(ctx, cap, "fs.write", filePath);

    try {
      await fs.writeFile(filePath, content, "utf-8");
      return null;
    } catch (e: any) {
      throw new ScriptError(`fs.write failed: ${e.message}`);
    }
  },
});
export { write as "fs.write" };

const list = defineOpcode<[Capability | null, string], Promise<readonly string[]>>("fs.list", {
  metadata: {
    label: "List Directory",
    category: "fs",
    description: "List contents of a directory",
    slots: [
      { name: "Cap", type: "block" },
      { name: "Path", type: "string" },
    ],
    parameters: [
      { name: "cap", type: "Capability | null" },
      { name: "path", type: "string" },
    ],
    returnType: "Promise<readonly string[]>",
  },
  handler: async ([cap, dirPath], ctx) => {
    if (!cap) {
      throw new ScriptError("fs.list: missing capability");
    }

    if (typeof dirPath !== "string") {
      throw new ScriptError("fs.list: path must be a string");
    }

    checkFsCapability(ctx, cap, "fs.read", dirPath);

    try {
      return await fs.readdir(dirPath);
    } catch (e: any) {
      throw new ScriptError(`fs.list failed: ${e.message}`);
    }
  },
});
export { list as "fs.list" };
