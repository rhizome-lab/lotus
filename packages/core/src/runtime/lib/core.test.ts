import * as CoreLib from "../lib/core";
import * as KernelLib from "../lib/kernel";
import {
  ListLib,
  ScriptError,
  StdLib,
  createOpcodeRegistry,
  createScriptContext,
  evaluate,
} from "@viwo/scripting";
import {
  addVerb,
  createCapability,
  createEntity,
  getEntity,
  getPrototypeId,
  updateEntity,
} from "../../repo";
import { beforeAll, expect } from "bun:test";
import { createLibraryTester } from "@viwo/scripting/test-utils";

const OPS = createOpcodeRegistry(KernelLib, CoreLib, ListLib, StdLib);

createLibraryTester(CoreLib, "Core Library", (test) => {
  const ctx = createScriptContext({ caller: { id: 3 }, ops: OPS, this: { id: 3 } });
  let id!: number;

  beforeAll(() => {
    id = createEntity({});
    ctx.caller.id = id;
    ctx.this.id = id;
    createCapability(id, "sys.create", {});
    createCapability(id, "entity.control", { "*": true });
    createCapability(id, "sys.sudo", {});
    createCapability(4, "sys.sudo", {});

    // Ensure entity 101 exists for tests
    updateEntity({ id: 101 });
    addVerb(101, "get_dynamic", "resolved_value");
  });

  // Entity Interaction
  test("create", () => {
    expect(evaluate(CoreLib.create(KernelLib.getCapability("sys.create"), {}), ctx)).toBeNumber();
  });

  test("destroy", () => {
    const id = createEntity({});
    evaluate(CoreLib.destroy(KernelLib.getCapability("entity.control"), { id }), ctx);
    expect(getEntity(id)).toBeNull();
  });

  test("call", () => {
    expect(() => evaluate(CoreLib.call({ id }, "missing"), ctx)).toThrow();
    // Verify successful call
    expect(evaluate(CoreLib.call({ id: 101 }, "get_dynamic"), ctx)).toBe("resolved_value");
  });

  test("call stack trace", () => {
    try {
      evaluate(CoreLib.call({ id: 102 }, "fail"), ctx);
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error).toBeInstanceOf(ScriptError);
      expect(error.message).toContain("call: verb 'fail' not found");
      expect(error.stackTrace).toHaveLength(0);
    }
  });

  test("schedule", () => {
    evaluate(CoreLib.schedule("verb", ListLib.listNew(), 100), ctx);
  });

  // Entity Introspection
  test("verbs", () => {
    expect(evaluate(CoreLib.verbs({ id }), ctx)).toEqual([]);
  });

  test("get_verb", () => {
    const result = evaluate(CoreLib.get_verb({ id: 101 }, "get_dynamic"), ctx) as Verb;
    // Mock returns a verb for id 101
    expect(result).toEqual({
      code: "resolved_value",
      entity_id: 101,
      id: result.id,
      name: "get_dynamic",
    });
    // Mock returns null for id 1
    expect(evaluate(CoreLib.get_verb({ id }, "missing"), ctx)).toBe(null);
  });

  test("entity", () => {
    expect(evaluate(CoreLib.entity(id), ctx)).toEqual({ id, prototype_id: null });
  });

  test("set_entity", () => {
    // Should return the merged entity object
    const result = evaluate(
      CoreLib.setEntity(KernelLib.getCapability("entity.control"), { id }, { name: "updated" }),
      ctx,
    ) as unknown as { id: number; name: string };
    expect(result.name).toBe("updated");
    expect(result.id).toBe(id);

    // Should update in DB
    expect(getEntity(id)?.["name"]).toBe("updated");

    // Should fail if id is in updates
    expect(() =>
      evaluate(
        CoreLib.setEntity(KernelLib.getCapability("entity.control"), { id }, { id: 123 }),
        ctx,
      ),
    ).toThrow();
  });

  test("get_prototype", () => {
    expect(evaluate(CoreLib.getPrototype({ id }), ctx)).toBe(null);
  });

  test("set_prototype", () => {
    evaluate(CoreLib.setPrototype(KernelLib.getCapability("entity.control"), { id }, 2), ctx);
    expect(getPrototypeId(id)).toBe(2);
  });

  test("resolve_props", () => {
    expect(evaluate(CoreLib.resolve_props({ id: 101 }), ctx)).toEqual({
      dynamic: "resolved_value",
      id: 101,
    });
  });

  test("sudo", () => {
    // 1. Deny if not system/bot (and missing capability)
    const userCtx = createScriptContext({ caller: { id: 100 }, ops: OPS, this: { id: 100 } });

    expect(() =>
      evaluate(
        CoreLib.sudo(
          { __brand: "Capability", id: "" },
          { id: 101 },
          "get_dynamic",
          ListLib.listNew(),
        ),
        userCtx,
      ),
    ).toThrow("Invalid capability");

    // 2. Allow if System (ID 3) with valid cap
    const systemCtx = createScriptContext({ caller: { id }, ops: OPS, this: { id } });
    expect(
      evaluate(
        CoreLib.sudo(
          KernelLib.getCapability("sys.sudo"),
          { id: 101 },
          "get_dynamic",
          ListLib.listNew(),
        ),
        systemCtx,
      ),
    ).toBe("resolved_value");

    // 3. Allow if Bot (ID 4) with valid cap
    const botCtx = createScriptContext({ caller: { id: 4 }, ops: OPS, this: { id: 4 } });
    expect(
      evaluate(
        CoreLib.sudo(
          KernelLib.getCapability("sys.sudo"),
          { id: 101 },
          "get_dynamic",
          ListLib.listNew(),
        ),
        botCtx,
      ),
    ).toBe("resolved_value");

    // 4. Verify message forwarding for Bot
    let sentMessage: any;
    const botForwardCtx = createScriptContext({
      caller: { id: 4 },
      ops: OPS,
      send: (type, payload) => {
        sentMessage = { payload, type };
      },
      this: { id: 4 },
    });

    updateEntity({ id: 103 });
    addVerb(103, "say_hello", StdLib.send("message", "Hello!"));

    evaluate(
      CoreLib.sudo(
        KernelLib.getCapability("sys.sudo"),
        { id: 103 },
        "say_hello",
        ListLib.listNew(),
      ),
      botForwardCtx,
    );

    expect(sentMessage).toEqual({
      payload: { payload: "Hello!", target: 103, type: "message" },
      type: "forward",
    });
  });
});
