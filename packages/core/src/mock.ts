import { Entity } from "./repo";

// Mock Entity Helper
export const mockEntity = (
  id: number,
  props: any = {},
  owner_id: number | null = null,
  location_id: number | null = null,
): Entity => ({
  id,
  name: "Mock",
  kind: "ITEM",
  location_id,
  location_detail: null,
  prototype_id: null,
  owner_id,
  created_at: "",
  updated_at: "",
  props,
  slug: null,
});
