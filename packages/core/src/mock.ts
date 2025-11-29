import { Entity } from "./repo";

// Mock Entity Helper
export const mockEntity = (
  id: number,
  props: any = {},
  owner_id: number | null = null,
  location_id: number | null = null,
): Entity => ({
  id,
  kind: "ITEM",
  location_id,
  prototype_id: null,
  owner_id,
  created_at: "",
  updated_at: "",
  props: { name: "Mock", ...props },
});
