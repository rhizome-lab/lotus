import { type Capability, type ScriptContext, ScriptError } from "@viwo/scripting";
import { createCapability, createEntity, getEntity, updateEntity } from "../repo";
import { checkCapability } from "./utils";

export function createEntityLogic(
  capability: Capability | null,
  data: object,
  ctx: ScriptContext,
): number {
  if (!capability) {
    throw new ScriptError("create: expected capability");
  }

  checkCapability(capability, ctx.this.id, "sys.create");

  const newId = createEntity(data as never);
  // Mint entity.control for the new entity and give to creator
  createCapability(ctx.this.id, "entity.control", { target_id: newId });

  // Handle location (add to parent's contents)
  if ("location" in data && typeof (data as any).location === "number") {
    const locationId = (data as any).location;
    const location = getEntity(locationId);
    if (location) {
      const contents = (location["contents"] as number[]) ?? [];
      updateEntity({ contents: [...contents, newId], id: locationId });
    }
  }

  return newId;
}
