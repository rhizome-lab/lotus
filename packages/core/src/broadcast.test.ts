import { describe, it, expect, mock } from "bun:test";
import { Database } from "bun:sqlite";

import { initSchema } from "./schema";

// Setup in-memory DB
const db = new Database(":memory:");

// Initialize Schema
initSchema(db);

// Mock the db module
mock.module("./db", () => ({ db }));

import {
  createScriptContext,
  evaluate,
  registerLibrary,
} from "./scripting/interpreter";
import { createEntity, addVerb, getVerb } from "./repo";
import { CoreLibrary } from "./scripting/lib/core";

describe("Advanced Items Verification", () => {
  // Register libraries
  registerLibrary(CoreLibrary);

  it("should broadcast message", async () => {
    const broadcastMock = mock(() => {});
    const ctx = {
      caller: { id: 1 } as any,
      this: { id: 1 } as any,
      args: [],
      sys: {
        broadcast: broadcastMock,
      },
    } as any;

    await evaluate(["broadcast", "Hello World"], ctx);
    expect(broadcastMock).toHaveBeenCalledWith("Hello World", undefined);

    await evaluate(["broadcast", "Hello Room", 123], ctx);
    expect(broadcastMock).toHaveBeenCalledWith("Hello Room", 123);
  });

  it("should resolve dynamic adjectives", async () => {
    // This logic is in index.ts sendRoom, which is hard to unit test directly without mocking WebSocket.
    // However, we can test the script part.
    const itemId = createEntity({
      name: "Test Dynamic Item",
      kind: "ITEM",
      props: {},
    });

    addVerb(itemId, "get_adjectives", [
      "list.new",
      "color:red",
      "material:wood",
    ]);

    const verb = getVerb(itemId, "get_adjectives");
    expect(verb).toBeDefined();

    const result = await evaluate(
      verb!.code,
      createScriptContext({
        caller: { id: itemId } as any,
        this: { id: itemId } as any,
        sys: {} as any,
      }),
    );

    expect(result).toEqual(["color:red", "material:wood"]);
  });
});
