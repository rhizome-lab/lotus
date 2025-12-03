import { describe, test, expect } from "bun:test";
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
import { StdLib } from "@viwo/scripting";
import { CoreLib } from ".";

describe("Repo", () => {
  test("createEntity", () => {
    const id = createEntity({ name: "TestItem" });
    expect(id).toBeGreaterThan(0);
  });

  test("Verb Inheritance", () => {
    // 1. Create Prototype
    const protoId = createEntity({ name: "Proto" });
    addVerb(protoId, "protoVerb", StdLib["seq"]());

    // 2. Create Instance
    const instanceId = createEntity({ name: "Instance" }, protoId);
    addVerb(instanceId, "instanceVerb", StdLib["seq"]());

    // 3. Get Verbs
    const verbs = getVerbs(instanceId);
    const names = verbs.map((v) => v.name);

    expect(names).toContain("protoVerb");
    expect(names).toContain("instanceVerb");
  });

  test("Verb Override", () => {
    // 1. Create Prototype
    const protoId = createEntity({ name: "ProtoOverride" });
    addVerb(protoId, "common", StdLib["seq"]("proto"));

    // 2. Create Instance
    const instanceId = createEntity({ name: "InstanceOverride" }, protoId);
    addVerb(instanceId, "common", StdLib["seq"]("instance"));

    // 3. Get Verbs
    const verbs = getVerbs(instanceId);
    const common = verbs.find((v) => v.name === "common");

    expect(common).toBeDefined();
    // Should be the instance one
    expect(common?.code).toEqual(StdLib["seq"]("instance"));
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

  test("getVerb", () => {
    const entity = createEntity({ name: "Scripted" });
    addVerb(
      entity,
      "jump",
      CoreLib["call"](StdLib["caller"](), "tell", "You jumped"),
    );

    const verb = getVerb(entity, "jump");
    expect(verb).not.toBeNull();
    expect(verb?.name).toBe("jump");

    const nonExistent = getVerb(entity, "fly");
    expect(nonExistent).toBeNull();
  });

  test("getVerb Inheritance", () => {
    const proto = createEntity({ name: "Proto" });
    addVerb(
      proto,
      "fly",
      CoreLib["call"](StdLib["caller"](), "tell", "You flew"),
    );

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
