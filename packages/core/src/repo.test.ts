import { describe, test, expect, mock } from "bun:test";
import { Database } from "bun:sqlite";

import { initSchema } from "./schema";

// Setup in-memory DB
const db = new Database(":memory:");

// Initialize Schema
initSchema(db);

// Mock the db module
mock.module("./db", () => ({ db }));

// Import repo after mocking
import {
  createEntity,
  addVerb,
  getVerbs,
  updateEntity,
  deleteEntity,
  getEntity,
  getVerb,
  updateVerb,
} from "./repo";
import * as Core from "./scripting/lib/core";

describe("Repo", () => {
  test("createEntity", () => {
    const id = createEntity({ name: "TestItem" });
    expect(id).toBeGreaterThan(0);
  });

  test("Verb Inheritance", () => {
    // 1. Create Prototype
    const protoId = createEntity({ name: "Proto" });
    addVerb(protoId, "protoVerb", Core["seq"]());

    // 2. Create Instance
    const instanceId = createEntity({ name: "Instance" }, protoId);
    addVerb(instanceId, "instanceVerb", Core["seq"]());

    // 3. Get Verbs
    const verbs = getVerbs(instanceId);
    const names = verbs.map((v) => v.name);

    expect(names).toContain("protoVerb");
    expect(names).toContain("instanceVerb");
  });

  test("Verb Override", () => {
    // 1. Create Prototype
    const protoId = createEntity({ name: "ProtoOverride" });
    addVerb(protoId, "common", Core["seq"]("proto"));

    // 2. Create Instance
    const instanceId = createEntity({ name: "InstanceOverride" }, protoId);
    addVerb(instanceId, "common", Core["seq"]("instance"));

    // 3. Get Verbs
    const verbs = getVerbs(instanceId);
    const common = verbs.find((v) => v.name === "common");

    expect(common).toBeDefined();
    // Should be the instance one
    expect(common?.code).toEqual(Core["seq"]("instance"));
  });

  test("updateEntity", () => {
    const id = createEntity({ name: "Old Name" });
    updateEntity({
      id,
      name: "New Name",
      location: 100,
      location_detail: "worn",
      foo: "bar",
    });
    const updated = getEntity(id);
    expect(updated?.["name"]).toBe("New Name");
    expect(updated?.["location"]).toBe(100);
    expect(updated?.["location_detail"]).toBe("worn");
    expect(updated?.["foo"]).toBe("bar");
  });

  test("deleteEntity", () => {
    const id = createEntity({ name: "ToDelete" });
    deleteEntity(id);
    const deleted = getEntity(id);
    expect(deleted).toBeNull();
  });

  // TODO: When implementing `move` in scripting, it should disallow a box to be put inside itself

  test("getVerb", () => {
    const entity = createEntity({ name: "Scripted" });
    addVerb(
      entity,
      "jump",
      Core["call"](Core["caller"](), "tell", "You jumped"),
    );

    const verb = getVerb(entity, "jump");
    expect(verb).not.toBeNull();
    expect(verb?.name).toBe("jump");

    const nonExistent = getVerb(entity, "fly");
    expect(nonExistent).toBeNull();
  });

  test("getVerb Inheritance", () => {
    const proto = createEntity({ name: "Proto" });
    addVerb(proto, "fly", Core["call"](Core["caller"](), "tell", "You flew"));

    const instance = createEntity({ name: "Instance" }, proto);

    const verb = getVerb(instance, "fly");
    expect(verb).not.toBeNull();
    expect(verb?.name).toBe("fly");
  });

  test("updateVerb", () => {
    const id = createEntity({ name: "VObj" });
    addVerb(id, "jump", { op: "jump" });

    const verb = getVerb(id, "jump");
    updateVerb(verb!.id, { op: "leap" }, { call: "admin" });

    const updated = getVerb(id, "jump");
    expect(updated?.code).toEqual({ op: "leap" });
    expect(updated?.permissions).toEqual({ call: "admin" });
  });
});
