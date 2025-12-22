import { type Capability, ScriptError, defineFullOpcode } from "@viwo/scripting";
import {
  createCapability,
  getCapabilities,
  getCapability as originalGetCapability,
  updateCapabilityOwner,
} from "../../repo";
import type { Entity } from "@viwo/shared/jsonrpc";
import { hydrateCapability } from "../capabilities";

export const getCapability = defineFullOpcode<[type: string, filter?: object], Capability | null>(
  "get_capability",
  {
    handler: ([type, filter = {}], ctx) => {
      const capabilities = getCapabilities(ctx.this.id);
      const match = capabilities.find((capability) => {
        if (capability.type !== type) {
          return false;
        }
        // UNDOCUMENTED: Wildcard capability bypasses all filter checks.
        // A capability with { "*": true } matches ANY filter, acting as a super-capability.
        // This should either be documented or removed - see TODO.md
        if (capability.params["*"] === true) {
          return true;
        }
        // Check filter params
        for (const [key, value] of Object.entries(filter as Record<string, unknown>)) {
          if (JSON.stringify(capability.params[key]) !== JSON.stringify(value)) {
            return false;
          }
        }
        return true;
      });
      if (!match) {
        return null;
      }
      return hydrateCapability({
        id: match.id,
        ownerId: match.owner_id,
        params: match.params,
        type: match.type,
      });
    },
    metadata: {
      category: "kernel",
      description: "Retrieve a capability owned by the current entity",
      genericParameters: ["Type extends keyof CapabilityRegistry"],
      label: "Get Capability",
      parameters: [
        { description: "The capability type.", name: "type", type: "Type" },
        { description: "Filter parameters.", name: "filter", optional: true, type: "object" },
      ],
      returnType: "CapabilityRegistry[Type] | null",
      slots: [
        { name: "Type", type: "string" },
        { name: "Filter", type: "block" },
      ],
    },
  },
);

export const mint = defineFullOpcode<
  [authority: Capability | null, type: string, params: object],
  Capability
>("mint", {
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
      throw new ScriptError(`mint: authority namespace '${allowedNs}' does not cover '${type}'`);
    }
    const newId = createCapability(ctx.this.id, type, params as never);
    return hydrateCapability({ id: newId, ownerId: ctx.this.id, params, type });
  },
  metadata: {
    category: "kernel",
    description: "Mint a new capability (requires sys.mint)",
    label: "Mint Capability",
    parameters: [
      { description: "The authority capability.", name: "authority", type: "object" },
      { description: "The capability type to mint.", name: "type", type: "string" },
      { description: "The capability parameters.", name: "params", type: "object" },
    ],
    returnType: "Capability",
    slots: [
      { name: "Authority", type: "block" },
      { name: "Type", type: "string" },
      { name: "Params", type: "block" },
    ],
  },
});

export const delegate = defineFullOpcode<
  [parent: Capability | null, restrictions: object],
  Capability
>("delegate", {
  handler: ([parent, restrictions], ctx) => {
    if (!parent || (parent as any).__brand !== "Capability") {
      throw new ScriptError("delegate: expected capability");
    }

    const parentCap = originalGetCapability((parent as Capability).id);
    if (!parentCap || parentCap["owner_id"] !== ctx.this.id) {
      throw new ScriptError("delegate: invalid parent capability");
    }

    // SECURITY ISSUE: This implementation allows privilege ESCALATION, not just restriction.
    // Spreading restrictions OVER parentCap.params means child can OVERRIDE parent values.
    // Example: parent { readonly: true } + restrictions { readonly: false } = { readonly: false }
    //
    // Proper implementation should validate each restriction is actually MORE restrictive:
    // - Numeric: new value should be narrower range or equal
    // - Boolean flags: if parent is restrictive, child cannot be less restrictive
    // - Target IDs: child cannot access targets parent cannot access
    // - Wildcards: if parent lacks wildcard, child cannot add wildcard
    //
    // For now, delegation just creates a new capability with same type but potentially modified params
    // TODO: Implement proper subset validation
    const newParams = { ...parentCap.params, ...(restrictions as object) };
    const newId = createCapability(ctx.this.id, parentCap.type, newParams);

    return hydrateCapability({
      id: newId,
      ownerId: ctx.this.id,
      params: newParams,
      type: parentCap.type,
    });
  },
  metadata: {
    category: "kernel",
    description: "Create a restricted version of a capability",
    label: "Delegate Capability",
    parameters: [
      { description: "The parent capability.", name: "parent", type: "object" },
      { description: "The restrictions to apply.", name: "restrictions", type: "object" },
    ],
    returnType: "Capability",
    slots: [
      { name: "Parent", type: "block" },
      { name: "Restrictions", type: "block" },
    ],
  },
});

export const giveCapability = defineFullOpcode<[cap: Capability | null, target: Entity], null>(
  "give_capability",
  {
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
    metadata: {
      category: "kernel",
      description: "Transfer a capability to another entity",
      label: "Give Capability",
      parameters: [
        { description: "The capability to give.", name: "cap", type: "object" },
        { description: "The target entity.", name: "target", type: "object" },
      ],
      returnType: "null",
      slots: [
        { name: "Cap", type: "block" },
        { name: "Target", type: "block" },
      ],
    },
  },
);

export const hasCapability = defineFullOpcode<
  [target: Entity, type: string, filter?: object],
  boolean
>("has_capability", {
  handler: ([target, type, filter = {}], _ctx) => {
    if (!target || typeof target.id !== "number") {
      throw new ScriptError("has_capability: expected target entity");
    }
    const capabilities = getCapabilities(target.id);
    const match = capabilities.find((capability) => {
      if (capability.type !== type) {
        return false;
      }
      // Wildcard capability - see comment in getCapability
      if (capability.params["*"] === true) {
        return true;
      }
      // Check filter params
      for (const [key, value] of Object.entries(filter as Record<string, unknown>)) {
        if (JSON.stringify(capability.params[key]) !== JSON.stringify(value)) {
          return false;
        }
      }
      return true;
    });

    return !!match;
  },
  metadata: {
    category: "kernel",
    description: "Check if an entity has a capability",
    label: "Has Capability",
    parameters: [
      { description: "The target entity.", name: "target", type: "object" },
      { description: "The capability type.", name: "type", type: "string" },
      { description: "Filter parameters.", name: "filter", optional: true, type: "object" },
    ],
    returnType: "boolean",
    slots: [
      { name: "Target", type: "block" },
      { name: "Type", type: "string" },
      { name: "Filter", type: "block" },
    ],
  },
});
