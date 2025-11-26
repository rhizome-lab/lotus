import { db } from "./db";

export interface Entity {
  id: number;
  slug: string | null;
  name: string;
  location_id: number | null;
  location_detail: string | null;
  prototype_id: number | null;
  owner_id: number | null;
  kind: "ZONE" | "ROOM" | "ACTOR" | "ITEM" | "PART" | "EXIT";
  created_at: string;
  updated_at: string;
  // Resolved properties
  props: Record<string, any>;
  state: Record<string, any>;
  ai_context: Record<string, any>;
  // Raw prototype info
  proto_slug?: string;
}

// The "Deep Resolve" - this is the magic function
// It fetches the item AND merges it with its parent prototype
export function getEntity(id: number): Entity | null {
  const raw = db
    .query(
      `
    SELECT 
      e.*, 
      p.slug as proto_slug,
      d.state, 
      d.props, 
      d.ai_context,
      proto_data.props as proto_props
    FROM entities e
    LEFT JOIN entity_data d ON e.id = d.entity_id
    LEFT JOIN entities p ON e.prototype_id = p.id
    LEFT JOIN entity_data proto_data ON p.id = proto_data.entity_id
    WHERE e.id = $id
  `,
    )
    .get({ $id: id }) as any;

  if (!raw) return null;

  // Merge JSON props (Instance overrides Prototype)
  const baseProps = raw.proto_props ? JSON.parse(raw.proto_props) : {};
  const instanceProps = raw.props ? JSON.parse(raw.props) : {};

  return {
    ...raw,
    // The "Resolved" properties
    props: { ...baseProps, ...instanceProps },
    state: raw.state ? JSON.parse(raw.state) : {},
    ai_context: raw.ai_context ? JSON.parse(raw.ai_context) : {},
  };
}

// Moving things (The Satchel -> Backpack logic)
export function moveEntity(
  thingId: number,
  containerId: number,
  detail: string | null = null,
) {
  // TODO: Add check to prevent circular containment (Box inside itself)
  db.query(
    "UPDATE entities SET location_id = ?, location_detail = ? WHERE id = ?",
  ).run(containerId, detail, thingId);
}

export function createEntity(data: {
  name: string;
  slug?: string;
  kind?: "ZONE" | "ROOM" | "ACTOR" | "ITEM" | "PART" | "EXIT";
  location_id?: number;
  location_detail?: string;
  prototype_id?: number;
  props?: Record<string, any>;
  state?: Record<string, any>;
  ai_context?: Record<string, any>;
}) {
  const insertEntity = db.query(`
    INSERT INTO entities (name, slug, kind, location_id, location_detail, prototype_id)
    VALUES ($name, $slug, $kind, $location_id, $location_detail, $prototype_id)
    RETURNING id
  `);

  const insertData = db.query(`
    INSERT INTO entity_data (entity_id, props, state, ai_context)
    VALUES ($entity_id, $props, $state, $ai_context)
  `);

  const transaction = db.transaction(() => {
    const result = insertEntity.get({
      $name: data.name,
      $slug: data.slug || null,
      $kind: data.kind || "ITEM",
      $location_id: data.location_id || null,
      $location_detail: data.location_detail || null,
      $prototype_id: data.prototype_id || null,
    }) as { id: number };

    insertData.run({
      $entity_id: result.id,
      $props: JSON.stringify(data.props || {}),
      $state: JSON.stringify(data.state || {}),
      $ai_context: JSON.stringify(data.ai_context || {}),
    });

    return result.id;
  });

  return transaction();
}

export function getContents(containerId: number): Entity[] {
  const rows = db
    .query(`SELECT id FROM entities WHERE location_id = ?`)
    .all(containerId) as { id: number }[];
  return rows.map((r) => getEntity(r.id)!);
}

export function updateEntity(
  id: number,
  data: {
    name?: string;
    location_id?: number;
    location_detail?: string;
    props?: Record<string, any>;
    state?: Record<string, any>;
    ai_context?: Record<string, any>;
  },
) {
  const updates: string[] = [];
  const params: any[] = [];

  if (data.name !== undefined) {
    updates.push("name = ?");
    params.push(data.name);
  }
  if (data.location_id !== undefined) {
    updates.push("location_id = ?");
    params.push(data.location_id);
  }
  if (data.location_detail !== undefined) {
    updates.push("location_detail = ?");
    params.push(data.location_detail);
  }

  if (updates.length > 0) {
    params.push(id);
    db.query(`UPDATE entities SET ${updates.join(", ")} WHERE id = ?`).run(
      ...params,
    );
  }

  // Update entity_data
  const dataUpdates: string[] = [];
  const dataParams: any[] = [];

  if (data.props) {
    dataUpdates.push("props = ?");
    dataParams.push(JSON.stringify(data.props));
  }
  if (data.state) {
    dataUpdates.push("state = ?");
    dataParams.push(JSON.stringify(data.state));
  }
  if (data.ai_context) {
    dataUpdates.push("ai_context = ?");
    dataParams.push(JSON.stringify(data.ai_context));
  }

  if (dataUpdates.length > 0) {
    dataParams.push(id);
    db.query(
      `UPDATE entity_data SET ${dataUpdates.join(", ")} WHERE entity_id = ?`,
    ).run(...dataParams);
  }
}
