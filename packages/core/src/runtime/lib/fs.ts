import {
  defineOpcode,
  ScriptValue,
  ScriptError,
  Capability,
  evaluate,
} from "@viwo/scripting";
import { checkCapability } from "../utils";
import * as fs from "node:fs/promises";
import * as path from "node:path";

function checkFsCapability(
  ctx: any,
  cap: Capability,
  type: string,
  targetPath: string,
) {
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

const read = defineOpcode<
  [ScriptValue<Capability>, ScriptValue<string>],
  string
>("fs.read", {
  metadata: {
    label: "Read File",
    category: "fs",
    description: "Read content from a file",
    slots: [
      { name: "Cap", type: "block" },
      { name: "Path", type: "string" },
    ],
    parameters: [
      { name: "cap", type: "Capability" },
      { name: "path", type: "string" },
    ],
    returnType: "string",
  },
  handler: async (args, ctx) => {
    const [capExpr, pathExpr] = args;
    const cap = evaluate(capExpr, ctx);
    const filePath = evaluate(pathExpr, ctx);

    if (typeof filePath !== "string") {
      throw new ScriptError("fs.read: path must be a string");
    }

    checkFsCapability(ctx, cap as Capability, "fs.read", filePath);

    try {
      return await fs.readFile(filePath, "utf-8");
    } catch (e: any) {
      throw new ScriptError(`fs.read failed: ${e.message}`);
    }
  },
});
export { read as "fs.read" };

const write = defineOpcode<
  [ScriptValue<Capability>, ScriptValue<string>, ScriptValue<string>],
  null
>("fs.write", {
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
      { name: "cap", type: "Capability" },
      { name: "path", type: "string" },
      { name: "content", type: "string" },
    ],
    returnType: "null",
  },
  handler: async (args, ctx) => {
    const [capExpr, pathExpr, contentExpr] = args;
    const cap = evaluate(capExpr, ctx);
    const filePath = evaluate(pathExpr, ctx);
    const content = evaluate(contentExpr, ctx);

    if (typeof filePath !== "string") {
      throw new ScriptError("fs.write: path must be a string");
    }
    if (typeof content !== "string") {
      throw new ScriptError("fs.write: content must be a string");
    }

    checkFsCapability(ctx, cap as Capability, "fs.write", filePath);

    try {
      await fs.writeFile(filePath, content, "utf-8");
      return null;
    } catch (e: any) {
      throw new ScriptError(`fs.write failed: ${e.message}`);
    }
  },
});
export { write as "fs.write" };

const list = defineOpcode<
  [ScriptValue<Capability>, ScriptValue<string>],
  string[]
>("fs.list", {
  metadata: {
    label: "List Directory",
    category: "fs",
    description: "List contents of a directory",
    slots: [
      { name: "Cap", type: "block" },
      { name: "Path", type: "string" },
    ],
    parameters: [
      { name: "cap", type: "Capability" },
      { name: "path", type: "string" },
    ],
    returnType: "readonly string[]",
  },
  handler: async (args, ctx) => {
    const [capExpr, pathExpr] = args;
    const cap = evaluate(capExpr, ctx);
    const dirPath = evaluate(pathExpr, ctx);

    if (typeof dirPath !== "string") {
      throw new ScriptError("fs.list: path must be a string");
    }

    checkFsCapability(ctx, cap as Capability, "fs.read", dirPath);

    try {
      return await fs.readdir(dirPath);
    } catch (e: any) {
      throw new ScriptError(`fs.list failed: ${e.message}`);
    }
  },
});
export { list as "fs.list" };
