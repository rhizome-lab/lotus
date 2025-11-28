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
  getContents,
  getEntity,
  getVerb,
  updateVerb,
  moveEntity,
} from "./repo";

describe("Repo", () => {
  test("createEntity", () => {
    const id = createEntity({ name: "TestItem", kind: "ITEM" });
    expect(id).toBeGreaterThan(0);
  });

  test("Verb Inheritance", () => {
    // 1. Create Prototype
    const protoId = createEntity({ name: "Proto", kind: "ITEM" });
    addVerb(protoId, "protoVerb", ["seq"]);

    // 2. Create Instance
    const instanceId = createEntity({
      name: "Instance",
      kind: "ITEM",
      prototype_id: protoId,
    });
    addVerb(instanceId, "instanceVerb", ["seq"]);

    // 3. Get Verbs
    const verbs = getVerbs(instanceId);
    const names = verbs.map((v) => v.name);

    expect(names).toContain("protoVerb");
    expect(names).toContain("instanceVerb");
  });

  test("Verb Override", () => {
    // 1. Create Prototype
    const protoId = createEntity({ name: "ProtoOverride", kind: "ITEM" });
    addVerb(protoId, "common", ["seq", "proto"]);

    // 2. Create Instance
    const instanceId = createEntity({
      name: "InstanceOverride",
      kind: "ITEM",
      prototype_id: protoId,
    });
    addVerb(instanceId, "common", ["seq", "instance"]);

    // 3. Get Verbs
    const verbs = getVerbs(instanceId);
    const common = verbs.find((v) => v.name === "common");

    expect(common).toBeDefined();
    // Should be the instance one
    expect(common?.code).toEqual(["seq", "instance"]);
  });

  test("updateEntity", () => {
    const id = createEntity({ name: "Old Name" });
    updateEntity(id, {
      name: "New Name",
      location_id: 100,
      location_detail: "worn",
      props: { foo: "bar" },
    });
    const updated = getEntity(id);
    expect(updated?.name).toBe("New Name");
    expect(updated?.location_id).toBe(100);
    expect(updated?.location_detail).toBe("worn");
    expect(updated?.props["foo"]).toBe("bar");
  });

  test("deleteEntity", () => {
    const id = createEntity({ name: "ToDelete", kind: "ITEM" });
    deleteEntity(id);
    const deleted = getEntity(id);
    expect(deleted).toBeNull();
  });

  test("moveEntity", () => {
    const container = createEntity({ name: "Box", kind: "ITEM" });
    const item = createEntity({ name: "Apple", kind: "ITEM" });

    moveEntity(item, container, "inside");

    const fetched = getEntity(item)!;
    expect(fetched.location_id).toBe(container);
    expect(fetched.location_detail).toBe("inside");
  });

  test("moveEntity circular check", () => {
    const box1 = createEntity({ name: "Box1", kind: "ITEM" });
    const box2 = createEntity({ name: "Box2", kind: "ITEM" });

    // box2 inside box1
    moveEntity(box2, box1);

    // Try to put box1 inside box2 (should fail)
    expect(() => {
      moveEntity(box1, box2);
    }).toThrow("Circular containment detected");
  });

  test("getContents", () => {
    const container = createEntity({ name: "Box", kind: "ITEM" });
    createEntity({ name: "Apple", kind: "ITEM", location_id: container });
    createEntity({ name: "Banana", kind: "ITEM", location_id: container });

    const contents = getContents(container);
    expect(contents).toHaveLength(2);
    expect(contents.map((c) => c.name)).toContain("Apple");
    expect(contents.map((c) => c.name)).toContain("Banana");
  });

  test("getVerb", () => {
    const entity = createEntity({ name: "Scripted" });
    addVerb(entity, "jump", ["tell", "You jumped"]);

    const verb = getVerb(entity, "jump");
    expect(verb).not.toBeNull();
    expect(verb?.name).toBe("jump");

    const nonExistent = getVerb(entity, "fly");
    expect(nonExistent).toBeNull();
  });

  test("getVerb Inheritance", () => {
    const proto = createEntity({ name: "Proto" });
    addVerb(proto, "fly", ["tell", "You flew"]);

    const instance = createEntity({ name: "Instance", prototype_id: proto });

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
