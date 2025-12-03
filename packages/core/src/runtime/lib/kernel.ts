import {
  defineOpcode,
  ScriptValue,
  ScriptError,
  Capability,
  evaluate,
} from "@viwo/scripting";
import {
  getCapabilities,
  createCapability,
  getCapability,
  updateCapabilityOwner,
} from "../../repo";
import { Entity } from "@viwo/shared/jsonrpc";

export const get_capability = defineOpcode<
  [ScriptValue<string>, ScriptValue<object> | undefined],
  Capability | null
>("get_capability", {
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
      { name: "filter", type: "object" },
    ],
    returnType: "Capability | null",
  },
  handler: (args, ctx) => {
    const [typeExpr, filterExpr] = args;
    const type = evaluate(typeExpr, ctx);
    const filter = filterExpr ? evaluate(filterExpr, ctx) : {};

    if (typeof type !== "string") {
      throw new ScriptError("get_capability: type must be string");
    }

    const caps = getCapabilities(ctx.this.id);
    const match = caps.find((c) => {
      if (c.type !== type) return false;
      // Check filter params
      for (const [k, v] of Object.entries(filter as Record<string, unknown>)) {
        if (JSON.stringify(c.params[k]) !== JSON.stringify(v)) return false;
      }
      return true;
    });

    if (!match) return null;

    return {
      __brand: "Capability",
      id: match.id,
    };
  },
});

export const mint = defineOpcode<
  [ScriptValue<Capability>, ScriptValue<string>, ScriptValue<object>],
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
      { name: "authority", type: "Capability" },
      { name: "type", type: "string" },
      { name: "params", type: "object" },
    ],
    returnType: "Capability",
  },
  handler: (args, ctx) => {
    const [authExpr, typeExpr, paramsExpr] = args;
    const auth = evaluate(authExpr, ctx);
    const type = evaluate(typeExpr, ctx);
    const params = evaluate(paramsExpr, ctx);

    if (
      !auth ||
      typeof auth !== "object" ||
      (auth as any).__brand !== "Capability"
    ) {
      throw new ScriptError("mint: expected capability for authority");
    }

    // Verify authority
    const authCap = getCapability(auth.id);
    if (!authCap || authCap.owner_id !== ctx.this.id) {
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

    const newId = createCapability(
      ctx.this.id,
      type as string,
      params as Record<string, unknown>,
    );

    return {
      __brand: "Capability",
      id: newId,
    };
  },
});

export const delegate = defineOpcode<
  [ScriptValue<Capability>, ScriptValue<object>],
  Capability
>("delegate", {
  metadata: {
    label: "Delegate Capability",
    category: "kernel",
    description: "Create a restricted version of a capability",
    slots: [
      { name: "Parent", type: "block" },
      { name: "Restrictions", type: "block" },
    ],
    parameters: [
      { name: "parent", type: "Capability" },
      { name: "restrictions", type: "object" },
    ],
    returnType: "Capability",
  },
  handler: (args, ctx) => {
    const [parentExpr, restrictionsExpr] = args;
    const parent = evaluate(parentExpr, ctx);
    const restrictions = evaluate(restrictionsExpr, ctx);

    if (
      !parent ||
      typeof parent !== "object" ||
      (parent as any).__brand !== "Capability"
    ) {
      throw new ScriptError("delegate: expected capability");
    }

    const parentCap = getCapability(parent.id);
    if (!parentCap || parentCap.owner_id !== ctx.this.id) {
      throw new ScriptError("delegate: invalid parent capability");
    }

    // For now, delegation just creates a new capability with same type but potentially modified params
    // TODO: In a real system, we'd need to ensure restrictions are actually restrictive (subset)
    // Here we'll just merge params for simplicity of the prototype
    const newParams = { ...parentCap.params, ...(restrictions as object) };

    const newId = createCapability(ctx.this.id, parentCap.type, newParams);

    return {
      __brand: "Capability",
      id: newId,
    };
  },
});

export const give_capability = defineOpcode<
  [ScriptValue<Capability>, ScriptValue<Entity>],
  null
>("give_capability", {
  metadata: {
    label: "Give Capability",
    category: "kernel",
    description: "Transfer a capability to another entity",
    slots: [
      { name: "Cap", type: "block" },
      { name: "Target", type: "block" },
    ],
    parameters: [
      { name: "cap", type: "Capability" },
      { name: "target", type: "Entity" },
    ],
    returnType: "null",
  },
  handler: (args, ctx) => {
    const [capExpr, targetExpr] = args;
    const cap = evaluate(capExpr, ctx);
    const target = evaluate(targetExpr, ctx);

    if (
      !cap ||
      typeof cap !== "object" ||
      (cap as any).__brand !== "Capability"
    ) {
      throw new ScriptError("give_capability: expected capability");
    }

    if (
      !target ||
      typeof target !== "object" ||
      typeof target.id !== "number"
    ) {
      throw new ScriptError("give_capability: expected target entity");
    }

    const dbCap = getCapability(cap.id);
    if (!dbCap || dbCap.owner_id !== ctx.this.id) {
      throw new ScriptError("give_capability: invalid capability");
    }

    updateCapabilityOwner(cap.id, target.id);
    return null;
  },
});
