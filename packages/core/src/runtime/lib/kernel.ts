import { defineOpcode, ScriptError, Capability } from "@viwo/scripting";
import {
  getCapabilities,
  createCapability,
  getCapability as originalGetCapability,
  updateCapabilityOwner,
} from "../../repo";
import { Entity } from "@viwo/shared/jsonrpc";

export const getCapability = defineOpcode<[string, object?], Capability | null>(
  "get_capability",
  {
    metadata: {
      label: "Get Capability",
      category: "kernel",
      description: "Retrieve a capability owned by the current entity",
      slots: [
        { name: "Type", type: "string" },
        { name: "Filter", type: "block" },
      ],
      parameters: [
        { name: "type", type: "string" },
        { name: "filter", type: "object", optional: true },
      ],
      returnType: "Capability | null",
    },
    handler: ([type, filter = {}], ctx) => {
      const caps = getCapabilities(ctx.this.id);
      const match = caps.find((c) => {
        if (c.type !== type) return false;
        // Check for wildcard
        if (c.params["*"] === true) return true;
        // Check filter params
        for (const [k, v] of Object.entries(
          filter as Record<string, unknown>,
        )) {
          if (JSON.stringify(c.params[k]) !== JSON.stringify(v)) {
            return false;
          }
        }
        return true;
      });
      if (!match) {
        return null;
      }
      return { __brand: "Capability", id: match.id };
    },
  },
);

export const mint = defineOpcode<
  [Capability | null, string, object],
  Capability
>("mint", {
  metadata: {
    label: "Mint Capability",
    category: "kernel",
    description: "Mint a new capability (requires sys.mint)",
    slots: [
      { name: "Authority", type: "block" },
      { name: "Type", type: "string" },
      { name: "Params", type: "block" },
    ],
    parameters: [
      { name: "authority", type: "object" },
      { name: "type", type: "string" },
      { name: "params", type: "object" },
    ],
    returnType: "Capability",
  },
  handler: ([auth, type, params], ctx) => {
    if (!auth || (auth as any).__brand !== "Capability") {
      throw new ScriptError("mint: expected capability for authority");
    }

    // Verify authority
    const authCap = originalGetCapability((auth as Capability).id);
    if (!authCap || authCap["owner_id"] !== ctx.this.id) {
      throw new ScriptError("mint: invalid authority capability");
    }

    if (authCap.type !== "sys.mint") {
      throw new ScriptError("mint: authority must be sys.mint");
    }

    // Check namespace
    // authCap.params.namespace should match type
    // e.g. namespace "user.123" allows "user.123.foo"
    // namespace "*" allows everything
    const allowedNs = authCap.params["namespace"];
    if (typeof allowedNs !== "string") {
      throw new ScriptError("mint: authority namespace must be string");
    }
    if (allowedNs !== "*" && !type.startsWith(allowedNs)) {
      throw new ScriptError(
        `mint: authority namespace '${allowedNs}' does not cover '${type}'`,
      );
    }
    const newId = createCapability(ctx.this.id, type, params as never);
    return { __brand: "Capability", id: newId };
  },
});

export const delegate = defineOpcode<[Capability | null, object], Capability>(
  "delegate",
  {
    metadata: {
      label: "Delegate Capability",
      category: "kernel",
      description: "Create a restricted version of a capability",
      slots: [
        { name: "Parent", type: "block" },
        { name: "Restrictions", type: "block" },
      ],
      parameters: [
        { name: "parent", type: "object" },
        { name: "restrictions", type: "object" },
      ],
      returnType: "Capability",
    },
    handler: ([parent, restrictions], ctx) => {
      if (!parent || (parent as any).__brand !== "Capability") {
        throw new ScriptError("delegate: expected capability");
      }

      const parentCap = originalGetCapability((parent as Capability).id);
      if (!parentCap || parentCap["owner_id"] !== ctx.this.id) {
        throw new ScriptError("delegate: invalid parent capability");
      }

      // For now, delegation just creates a new capability with same type but potentially modified params

      // Here we'll just merge params for simplicity of the prototype
      const newParams = { ...parentCap.params, ...(restrictions as object) };
      const newId = createCapability(ctx.this.id, parentCap.type, newParams);

      return { __brand: "Capability", id: newId };
    },
  },
);

export const giveCapability = defineOpcode<[Capability | null, Entity], null>(
  "give_capability",
  {
    metadata: {
      label: "Give Capability",
      category: "kernel",
      description: "Transfer a capability to another entity",
      slots: [
        { name: "Cap", type: "block" },
        { name: "Target", type: "block" },
      ],
      parameters: [
        { name: "cap", type: "object" },
        { name: "target", type: "object" },
      ],
      returnType: "null",
    },
    handler: ([cap, target], ctx) => {
      if (!cap || (cap as any).__brand !== "Capability") {
        throw new ScriptError("give_capability: expected capability");
      }

      if (!target || typeof target.id !== "number") {
        throw new ScriptError("give_capability: expected target entity");
      }

      const dbCap = originalGetCapability((cap as Capability).id);
      if (!dbCap || dbCap["owner_id"] !== ctx.this.id) {
        throw new ScriptError("give_capability: invalid capability");
      }

      updateCapabilityOwner((cap as Capability).id, target.id);
      return null;
    },
  },
);

export const hasCapability = defineOpcode<[Entity, string, object?], boolean>(
  "has_capability",
  {
    metadata: {
      label: "Has Capability",
      category: "kernel",
      description: "Check if an entity has a capability",
      slots: [
        { name: "Target", type: "block" },
        { name: "Type", type: "string" },
        { name: "Filter", type: "block" },
      ],
      parameters: [
        { name: "target", type: "object" },
        { name: "type", type: "string" },
        { name: "filter", type: "object", optional: true },
      ],
      returnType: "boolean",
    },
    handler: ([target, type, filter = {}], _ctx) => {
      if (!target || typeof target.id !== "number") {
        throw new ScriptError("has_capability: expected target entity");
      }

      const caps = getCapabilities(target.id);
      const match = caps.find((c) => {
        if (c.type !== type) return false;

        // Check for wildcard
        if (c.params["*"] === true) return true;

        // Check filter params
        for (const [k, v] of Object.entries(
          filter as Record<string, unknown>,
        )) {
          if (JSON.stringify(c.params[k]) !== JSON.stringify(v)) {
            return false;
          }
        }
        return true;
      });

      return !!match;
    },
  },
);
