import * as CoreLib from "./runtime/lib/core";
import * as KernelLib from "./runtime/lib/kernel";
import { ObjectLib, createScriptContext, evaluate } from "@viwo/scripting";
import { beforeEach, describe, expect, test } from "bun:test";
import { createCapability, createEntity, getCapabilities, getEntity } from "./repo";
import type { Entity } from "@viwo/shared/jsonrpc";
import { GameOpcodes } from "./runtime/opcodes";
import { db } from ".";

describe("Capability Security", () => {
  // let sys: Entity;
  let admin: Entity;
  let user: Entity;

  beforeEach(() => {
    // Reset DB state
    db.query("DELETE FROM entities").run();
    db.query("DELETE FROM verbs").run();
    db.query("DELETE FROM capabilities").run();
    db.query("DELETE FROM sqlite_sequence").run();

    // Create System
    createEntity({ name: "System" });
    // sys = getEntity(sysId)!;

    // Create Admin (with minting rights)
    const adminId = createEntity({ name: "Admin" });
    admin = getEntity(adminId)!;
    createCapability(adminId, "sys.mint", { namespace: "*" });
    createCapability(adminId, "sys.create", {});
    createCapability(adminId, "entity.control", { "*": true });

    // Create User (no rights initially)
    const userId = createEntity({ name: "User" });
    user = getEntity(userId)!;
  });

  test("Kernel.get_capability", async () => {
    const ctx = createScriptContext({ args: [], caller: admin, ops: GameOpcodes, this: admin });
    const cap = await evaluate(KernelLib.getCapability("sys.mint"), ctx);
    expect(cap).not.toBeNull();
    expect((cap as any)?.__brand).toBe("Capability");
  });

  test("Kernel.mint", async () => {
    // Admin mints a capability for themselves
    const ctx = createScriptContext({ args: [], caller: admin, ops: GameOpcodes, this: admin });
    const newCap = await evaluate(
      KernelLib.mint(KernelLib.getCapability("sys.mint"), "test.cap", ObjectLib.objNew()),
      ctx,
    );
    expect(newCap).not.toBeNull();
    expect((newCap as any)?.__brand).toBe("Capability");

    // Verify in DB
    const capabilities = getCapabilities(admin.id);
    expect(capabilities.find((capability) => capability.type === "test.cap")).toBeDefined();
  });

  test("Core.create requires capability", async () => {
    // User tries to create without capability
    const ctx = createScriptContext({ args: [], caller: user, ops: GameOpcodes, this: user });

    // Should fail because first arg is not capability (it's the object)
    // Or if we pass null/invalid cap
    // We expect it to throw, but since evaluate might return a Promise, we need to handle that.
    // expect(async () => await evaluate(...)).toThrow() works in bun test?

    try {
      await evaluate(CoreLib.create(null, ObjectLib.objNew(["name", "Fail"])), ctx);
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  test("Core.create with capability", async () => {
    // Admin creates entity
    const ctx = createScriptContext({ args: [], caller: admin, ops: GameOpcodes, this: admin });
    const newId = await evaluate(
      CoreLib.create(KernelLib.getCapability("sys.create"), ObjectLib.objNew(["name", "Success"])),
      ctx,
    );
    expect(typeof newId).toBe("number");
  });

  test("Core.set_entity requires capability", async () => {
    const ctx = createScriptContext({ args: [], caller: user, ops: GameOpcodes, this: user });
    const targetId = createEntity({ name: "Target" });

    try {
      await evaluate(
        CoreLib.setEntity(
          ObjectLib.objNew(["name", "Fail"]), // Invalid cap
          CoreLib.entity(targetId),
          ObjectLib.objNew(), // updates
        ),
        ctx,
      );
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  test("Core.set_entity with capability", async () => {
    const ctx = createScriptContext({ args: [], caller: admin, ops: GameOpcodes, this: admin });
    const targetId = createEntity({ name: "Target" });

    await evaluate(
      CoreLib.setEntity(
        KernelLib.getCapability("entity.control", ObjectLib.objNew(["*", true])),
        CoreLib.entity(targetId),
        ObjectLib.objNew(["name", "Modified"]),
      ),
      ctx,
    );

    const updated = getEntity(targetId)! as any;
    expect(updated.name).toBe("Modified");
  });
});
