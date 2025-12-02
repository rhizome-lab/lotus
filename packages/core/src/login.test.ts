import { describe, test, expect, mock, beforeEach } from "bun:test";
import { handleJsonRpcRequest } from "./index";
import { JsonRpcRequest } from "@viwo/shared/jsonrpc";
import { createEntity } from "./repo";

describe("Login Logic", () => {
  beforeEach(() => {
    // Reset DB for each test (TODO: use in-memory db or transaction rollback)
    // For now, let's just create new entities.
  });

  test("Login with valid entity ID", async () => {
    const entityId = createEntity({ name: "Test User", description: "Test" });
    const ws = {
      data: { userId: 0 },
      send: mock(() => {}),
    };

    const req: JsonRpcRequest = {
      jsonrpc: "2.0",
      method: "login",
      params: { entityId },
      id: 1,
    };

    const response = await handleJsonRpcRequest(req, 0, ws);

    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { status: "ok", playerId: entityId },
    });

    expect(ws.data.userId).toBe(entityId);
    expect(ws.send).toHaveBeenCalled(); // Should send player_id notification
  });

  test("Login with invalid entity ID", async () => {
    const ws = {
      data: { userId: 0 },
      send: mock(() => {}),
    };

    const req: JsonRpcRequest = {
      jsonrpc: "2.0",
      method: "login",
      params: { entityId: 999999 }, // Non-existent ID
      id: 2,
    };

    const response = await handleJsonRpcRequest(req, 0, ws);

    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 2,
      error: { code: -32000, message: "Entity not found" },
    });

    expect(ws.data.userId).toBe(0);
  });

  test("Login with missing params", async () => {
    const ws = {
      data: { userId: 0 },
      send: mock(() => {}),
    };

    const req: JsonRpcRequest = {
      jsonrpc: "2.0",
      method: "login",
      params: {}, // Missing entityId
      id: 3,
    };

    const response = await handleJsonRpcRequest(req, 0, ws);

    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 3,
      error: { code: -32602, message: "Invalid params: entityId required" },
    });
  });
});
