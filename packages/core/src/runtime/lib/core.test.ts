import { expect, beforeEach, mock } from "bun:test";
import {
  evaluate,
  ScriptContext,
  registerLibrary,
  createScriptContext,
  ListLib as List,
  ScriptError,
  StdLib as Std,
} from "@viwo/scripting";
import { createLibraryTester } from "@viwo/scripting/test-utils";
import * as Core from "./core";

const cap1 = crypto.randomUUID();
const cap2 = crypto.randomUUID();
const cap3 = crypto.randomUUID();
const cap4 = crypto.randomUUID();
const cap5 = crypto.randomUUID();
const cap6 = crypto.randomUUID();

// Mock repo functions
mock.module("../../repo", () => ({
  createEntity: () => 100,
  deleteEntity: () => {},
  getEntity: (id: number) => ({ id, props: {} }),
  getPrototypeId: () => null,
  getVerbs: (id: number) => {
    if (id === 101) {
      return [{ name: "get_dynamic", code: "resolved_value" }];
    }
    return [];
  },
  setPrototypeId: () => {},
  updateEntity: () => {},
  getVerb: (id: number, name: string) => {
    if (id === 101 && name === "get_dynamic") {
      return {
        id: 1,
        entity_id: 101,
        name: "get_dynamic",
        code: "resolved_value",
        permissions: {},
      };
    }
    if (id === 102 && name === "fail") {
      return {
        id: 2,
        entity_id: 102,
        name: "fail",
        code: Std["throw"]("verb failed"),
        permissions: {},
      };
    }
    if (id === 103 && name === "say_hello") {
      return {
        id: 3,
        entity_id: 103,
        name: "say_hello",
        code: Std["send"]("message", "Hello!"),
        permissions: {},
      };
    }
    return null;
  },
  getCapability: (id: string) => {
    switch (id) {
      case cap1:
        return { owner_id: 2, type: "sys.create", params: {} };
      case cap2:
        return {
          owner_id: 2,
          type: "entity.control",
          params: { target_id: 1 },
        };
      case cap3:
        return { owner_id: 2, type: "sys.sudo", params: {} };
      case cap4:
        return {
          owner_id: 2,
          type: "entity.control",
          params: { target_id: 101 },
        };
      case cap5:
        return { owner_id: 3, type: "sys.sudo", params: {} }; // System
      case cap6:
        return { owner_id: 4, type: "sys.sudo", params: {} }; // Bot
    }
    return null;
  },
  createCapability: () => {},
}));

// Mock scheduler
mock.module("../../scheduler", () => ({
  scheduler: {
    schedule: () => {},
  },
}));

createLibraryTester(Core, "Core Library", (test) => {
  registerLibrary(Core);
  registerLibrary(List);
  registerLibrary(Std);

  let ctx: ScriptContext;
  const sysCreateCap = { __brand: "Capability" as const, id: cap1 };
  const entityControlCap = { __brand: "Capability" as const, id: cap2 };

  beforeEach(() => {
    ctx = createScriptContext({
      caller: { id: 1 } as any,
      this: { id: 2 } as any,
      args: [10, 20],
      send: () => {},
      warnings: [],
    });
  });

  // Entity Interaction
  test("create", () => {
    expect(evaluate(Core["create"](sysCreateCap, {}), ctx)).toBe(100);
  });

  test("destroy", () => {
    evaluate(Core["destroy"](entityControlCap, { id: 1 }), ctx);
  });

  test("call", () => {
    // Mock getVerb to return something executable
    expect(() => evaluate(Core["call"]({ id: 1 }, "missing"), ctx)).toThrow();
  });

  test("call stack trace", () => {
    try {
      evaluate(Core["call"]({ id: 102 }, "fail"), ctx);
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e).toBeInstanceOf(ScriptError);
      expect(e.message).toBe("verb failed");
      expect(e.stackTrace).toHaveLength(1);
      expect(e.stackTrace[0].name).toBe("fail");
    }
  });

  test("schedule", () => {
    evaluate(Core["schedule"]("verb", List["list.new"](), 100), ctx);
  });

  // Entity Introspection
  test("verbs", () => {
    expect(evaluate(Core["verbs"]({ id: 1 }), ctx)).toEqual([]);
  });

  test("get_verb", () => {
    // Mock returns a verb for id 101
    expect(evaluate(Core["get_verb"]({ id: 101 }, "get_dynamic"), ctx)).toEqual({
      id: 1,
      entity_id: 101,
      name: "get_dynamic",
      code: "resolved_value",
      permissions: {},
    });
    // Mock returns null for id 1
    expect(evaluate(Core["get_verb"]({ id: 1 }, "missing"), ctx)).toBe(null);
  });

  test("entity", () => {
    expect(evaluate(Core["entity"](1), ctx)).toEqual({
      id: 1,
      props: {},
    });
  });

  test("set_entity", () => {
    evaluate(Core["set_entity"](entityControlCap, { id: 1 }), ctx);
  });

  test("get_prototype", () => {
    expect(evaluate(Core["get_prototype"]({ id: 1 }), ctx)).toBe(null);
  });

  test("set_prototype", () => {
    evaluate(Core["set_prototype"](entityControlCap, { id: 1 }, 2), ctx);
  });

  test("resolve_props", () => {
    expect(evaluate(Core["resolve_props"]({ id: 101 }), ctx)).toEqual({
      id: 101,
      dynamic: "resolved_value",
    });
  });

  test("sudo", () => {
    // 1. Deny if not system/bot (and missing capability)
    const userCtx = createScriptContext({
      caller: { id: 100 } as any,
      this: { id: 100 } as any,
      args: [],
      send: () => {},
    });
    // We pass a fake cap that won't exist or won't be owned
    const fakeCap = { __brand: "Capability" as const, id: crypto.randomUUID() };

    expect(() =>
      evaluate(Core["sudo"](fakeCap, { id: 101 }, "get_dynamic", List["list.new"]()), userCtx),
    ).toThrow("Invalid capability"); // Or "Capability not owned"

    // 2. Allow if System (ID 3) with valid cap
    const sysSudoCap = { __brand: "Capability" as const, id: cap5 };
    const systemCtx = createScriptContext({
      caller: { id: 3 } as any,
      this: { id: 3 } as any,
      args: [],
      send: () => {},
    });
    expect(
      evaluate(Core["sudo"](sysSudoCap, { id: 101 }, "get_dynamic", List["list.new"]()), systemCtx),
    ).toBe("resolved_value");

    // 3. Allow if Bot (ID 4) with valid cap
    const botSudoCap = { __brand: "Capability" as const, id: cap6 };
    const botCtx = createScriptContext({
      caller: { id: 4 } as any,
      this: { id: 4 } as any,
      args: [],
      send: () => {},
    });
    expect(
      evaluate(Core["sudo"](botSudoCap, { id: 101 }, "get_dynamic", List["list.new"]()), botCtx),
    ).toBe("resolved_value");

    // 4. Verify message forwarding for Bot
    let sentMessage: any = null;
    const botForwardCtx = createScriptContext({
      caller: { id: 4 } as any,
      this: { id: 4 } as any,
      args: [],
      send: (type, payload) => {
        sentMessage = { type, payload };
      },
    });

    evaluate(Core["sudo"](botSudoCap, { id: 103 }, "say_hello", List["list.new"]()), botForwardCtx);

    expect(sentMessage).toEqual({
      type: "forward",
      payload: {
        target: 103,
        type: "message",
        payload: "Hello!",
      },
    });
  });
});
