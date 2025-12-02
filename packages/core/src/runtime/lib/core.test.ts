import { expect, beforeEach, mock } from "bun:test";
import {
  evaluate,
  ScriptContext,
  registerLibrary,
  createScriptContext,
  ListLib as List,
  createLibraryTester,
  ScriptError,
  StdLib as Std,
} from "@viwo/scripting";
import * as Core from "./core";

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
        code: ["test.send", "message", "Hello!"],
        permissions: {},
      };
    }
    return null;
  },
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

  // Register a test library to allow side effects (sending messages)
  const TestLib = {
    "test.send": {
      metadata: { label: "Test Send", category: "test" } as any,
      handler: async (args: any[], ctx: ScriptContext) => {
        if (ctx.send) {
          ctx.send(args[0], args[1]);
        }
        return null;
      },
    },
  };
  registerLibrary(TestLib);

  let ctx: ScriptContext;

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
  test("create", async () => {
    expect(await evaluate(Core["create"]({}), ctx)).toBe(100);
  });

  test("destroy", async () => {
    await evaluate(Core["destroy"]({ id: 1 }), ctx);
  });

  test("call", async () => {
    // Mock getVerb to return something executable
    expect(evaluate(Core["call"]({ id: 1 }, "missing"), ctx)).rejects.toThrow();
  });

  test("call stack trace", async () => {
    try {
      await evaluate(Core["call"]({ id: 102 }, "fail"), ctx);
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e).toBeInstanceOf(ScriptError);
      expect(e.message).toBe("verb failed");
      expect(e.stackTrace).toHaveLength(1);
      expect(e.stackTrace[0].name).toBe("fail");
    }
  });

  test("schedule", async () => {
    await evaluate(Core["schedule"]("verb", List["list.new"](), 100), ctx);
  });

  // Entity Introspection
  test("verbs", async () => {
    expect(await evaluate(Core["verbs"]({ id: 1 }), ctx)).toEqual([]);
  });

  test("get_verb", async () => {
    // Mock returns a verb for id 101
    expect(
      await evaluate(Core["get_verb"]({ id: 101 }, "get_dynamic"), ctx),
    ).toEqual({
      id: 1,
      entity_id: 101,
      name: "get_dynamic",
      code: "resolved_value",
      permissions: {},
    });
    // Mock returns null for id 1
    expect(await evaluate(Core["get_verb"]({ id: 1 }, "missing"), ctx)).toBe(
      null,
    );
  });

  test("entity", async () => {
    expect(await evaluate(Core["entity"](1), ctx)).toEqual({
      id: 1,
      props: {},
    });
  });

  test("set_entity", async () => {
    await evaluate(Core["set_entity"]({ id: 1 }), ctx);
  });

  test("get_prototype", async () => {
    expect(await evaluate(Core["get_prototype"]({ id: 1 }), ctx)).toBe(null);
  });

  test("set_prototype", async () => {
    await evaluate(Core["set_prototype"]({ id: 1 }, 2), ctx);
  });

  test("resolve_props", async () => {
    expect(await evaluate(Core["resolve_props"]({ id: 101 }), ctx)).toEqual({
      id: 101,
      dynamic: "resolved_value",
    });
  });

  test("sudo", async () => {
    // 1. Deny if not system/bot
    const userCtx = createScriptContext({
      caller: { id: 100 } as any,
      this: { id: 100 } as any,
      args: [],
      send: () => {},
    });
    expect(
      evaluate(
        Core["sudo"]({ id: 101 }, "get_dynamic", List["list.new"]()),
        userCtx,
      ),
    ).rejects.toThrow("permission denied");

    // 2. Allow if System (ID 3)
    const systemCtx = createScriptContext({
      caller: { id: 3 } as any,
      this: { id: 3 } as any,
      args: [],
      send: () => {},
    });
    expect(
      await evaluate(
        Core["sudo"]({ id: 101 }, "get_dynamic", List["list.new"]()),
        systemCtx,
      ),
    ).toBe("resolved_value");

    // 3. Allow if Bot (ID 4)
    const botCtx = createScriptContext({
      caller: { id: 4 } as any,
      this: { id: 4 } as any,
      args: [],
      send: () => {},
    });
    expect(
      await evaluate(
        Core["sudo"]({ id: 101 }, "get_dynamic", List["list.new"]()),
        botCtx,
      ),
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

    // Call 'say_hello' on entity 103 via sudo
    // The 'say_hello' verb (mocked above) calls send("message", "Hello!")
    // We expect this to be forwarded as:
    // type: "forward"
    // payload: { target: 103, type: "message", payload: "Hello!" }

    // Execute the 'say_hello' verb via sudo.
    // This should trigger a 'send' call which we expect to be forwarded.
    // We use a simple lambda for the verb code in this mock scenario if needed,
    // but here we are testing the routing logic, so we assume the verb execution works.
    await evaluate(
      Core["sudo"]({ id: 103 }, "say_hello", List["list.new"]()),
      botForwardCtx,
    );

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
