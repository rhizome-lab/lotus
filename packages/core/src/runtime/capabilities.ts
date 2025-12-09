import { type Capability, type ScriptContext, ScriptError } from "@viwo/scripting";
import { checkCapability, deepFreeze } from "./utils";
import { deleteEntity, getEntity, setPrototypeId, updateEntity } from "../repo";

export abstract class BaseCapability implements Capability {
  static readonly type: string;
  readonly type: string;
  readonly __brand = "Capability" as const;
  constructor(
    public readonly id: string,
    public readonly ownerId: number,
    public readonly params: any,
  ) {
    this.type = (this.constructor as typeof BaseCapability).type;
    deepFreeze(this);
  }

  // Helper to check ownership or validity if needed
}

export class EntityControl extends BaseCapability {
  static override readonly type = "viwo.capability.entity_control";

  // Example Method 1: Destroy
  // Logic refactored from sys.destroy opcode
  destroy(targetId: number | null, _ctx: ScriptContext) {
    // If targetId is null, assume we are destroying the target of this capability?
    // The capability has a target_id param.
    // Core logic checks if params["target_id"] === targetId.
    // So if targetId is provided, we use it.
    // If NOT provided, we might want to infer it?
    // For now, let's require targetId as per method signature.
    if (targetId === null) {
      throw new ScriptError("EntityControl.destroy: targetId is required");
    }

    if (!this.params["*"] && this.params["target_id"] !== targetId) {
      throw new ScriptError("Capability parameters do not match requirements");
    }

    deleteEntity(targetId);
    return true;
  }

  update(targetId: number, updates: object, _ctx: ScriptContext) {
    if (!targetId && targetId !== 0) {
      throw new ScriptError("EntityControl.update: targetId is required");
    }
    const entity = getEntity(targetId);
    if (!entity) {
      throw new ScriptError(`EntityControl.update: entity ${targetId} not found`);
    }

    if ("id" in updates) {
      throw new ScriptError("set_entity: cannot update 'id'");
    }
    if ("prototype_id" in updates) {
      throw new ScriptError("set_entity: cannot update 'prototype_id'");
    }

    if (!this.params["*"] && this.params["target_id"] !== targetId) {
      throw new ScriptError("Capability parameters do not match requirements");
    }

    updateEntity({ id: targetId, ...updates });
    return { ...entity, ...updates };
  }

  setPrototype(targetId: number, protoId: number | null, _ctx: ScriptContext) {
    if (!targetId && targetId !== 0) {
      throw new ScriptError("EntityControl.setPrototype: targetId is required");
    }
    const entity = getEntity(targetId);
    if (!entity) {
      throw new ScriptError(`EntityControl.setPrototype: entity ${targetId} not found`);
    }

    if (!this.params["*"] && this.params["target_id"] !== targetId) {
      throw new ScriptError("Capability parameters do not match requirements");
    }

    if (protoId !== null && typeof protoId !== "number") {
      throw new ScriptError(
        `set_prototype: expected number or null for prototype ID, got ${JSON.stringify(protoId)}`,
      );
    }
    setPrototypeId(targetId, protoId);
    return true;
  }
}

// Registry for Hydration
const CAPABILITY_CLASSES: Record<
  string,
  new (id: string, ownerId: number, params: any) => BaseCapability
> = {
  [EntityControl.type]: EntityControl,
};

export function registerCapabilityClass(
  type: string,
  Class: new (id: string, ownerId: number, params: any) => BaseCapability,
) {
  if (CAPABILITY_CLASSES[type]) {
    throw new Error(`Capability class for type '${type}' is already registered.`);
  }
  CAPABILITY_CLASSES[type] = Class;
}

function createCapabilityProxy(capability: BaseCapability): BaseCapability {
  return new Proxy(capability, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function" && prop !== "constructor") {
        return function proxy(this: BaseCapability, ...args: any[]) {
          const ctx = args.at(-1);
          if (ctx && typeof ctx === "object" && "this" in ctx) {
            checkCapability(
              target,
              ctx.this.id,
              (target.constructor as typeof BaseCapability).type,
            );
          }
          return value.apply(this, args);
        };
      }
      return value;
    },
  });
}

export function hydrateCapability(data: {
  id: string;
  owner_id: number;
  type: string;
  params: any;
}): BaseCapability {
  const Class = CAPABILITY_CLASSES[data.type];
  if (Class) {
    const instance = new Class(data.id, data.owner_id, data.params);
    return createCapabilityProxy(instance);
  }
  // Fallback for unknown types? Return raw object?
  // Or generic BaseCapability?
  // For now, raw object implies it has no methods, which fits "unknown".
  return data as any;
}
