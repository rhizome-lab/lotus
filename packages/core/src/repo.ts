import { db } from "./db";

/**
 * Represents a game entity.
 * Everything in the game is an Entity (Room, Player, Item, Exit, etc.).
 */
export interface Entity {
  /** Unique ID of the entity */
  id: number;
  /** Optional unique slug for easier lookup */
  slug: string | null;
  /** Display name of the entity */
  name: string;
  /** ID of the container/room this entity is in */
  location_id: number | null;
  /** Optional detail about location (e.g. "worn", "held") */
  location_detail: string | null;
  /** ID of the prototype this entity inherits from */
  prototype_id: number | null;
  /** ID of the player who owns this entity */
  owner_id: number | null;
  /** The type of entity */
  kind: "ZONE" | "ROOM" | "ACTOR" | "ITEM" | "PART" | "EXIT";
  created_at: string;
  updated_at: string;
  // Resolved properties
  /**
   * Resolved properties (merged from prototype and instance).
   * Contains arbitrary game data like description, adjectives, custom_css.
   */
  props: Record<string, any>;
  /**
   * Mutable state for the entity.
   * Used for things that change often (e.g. health, open/closed status).
   */
  state: Record<string, any>;
  /** Context for AI generation/interaction */
  ai_context: Record<string, any>;
  // Raw prototype info
  proto_slug?: string;
}

/**
 * Fetches an entity by ID, resolving its properties against its prototype.
 *
 * This performs a "deep resolve" where instance properties override prototype properties.
 *
 * @param id - The ID of the entity to fetch.
 * @returns The resolved Entity object or null if not found.
 */
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

/**
 * Moves an entity to a new location.
 *
 * @param thingId - The ID of the entity to move.
 * @param containerId - The ID of the destination container/room.
 * @param detail - Optional location detail (e.g. "worn").
 */
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

/**
 * Creates a new entity in the database.
 *
 * @param data - The initial data for the entity.
 * @returns The ID of the newly created entity.
 */
export function createEntity(data: {
  name: string;
  slug?: string;
  kind?: "ZONE" | "ROOM" | "ACTOR" | "ITEM" | "PART" | "EXIT";
  location_id?: number;
  location_detail?: string;
  prototype_id?: number;
  owner_id?: number;
  props?: Record<string, any>;
  state?: Record<string, any>;
  ai_context?: Record<string, any>;
}) {
  const insertEntity = db.query(`
    INSERT INTO entities (name, slug, kind, location_id, location_detail, prototype_id, owner_id)
    VALUES ($name, $slug, $kind, $location_id, $location_detail, $prototype_id, $owner_id)
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
      $owner_id: data.owner_id || null,
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

/**
 * Gets all entities contained within a specific location.
 *
 * @param containerId - The ID of the container/room.
 * @returns An array of resolved Entity objects.
 */
export function getContents(containerId: number): Entity[] {
  const rows = db
    .query(`SELECT id FROM entities WHERE location_id = ?`)
    .all(containerId) as { id: number }[];
  return rows.map((r) => getEntity(r.id)!);
}

/**
 * Gets all entity IDs in the world.
 *
 * @returns An array of all entity IDs.
 */
export function getAllEntities(): number[] {
  const rows = db.query("SELECT id FROM entities").all() as { id: number }[];
  return rows.map((r) => r.id);
}

/**
 * Updates an existing entity.
 * Only provided fields will be updated.
 *
 * @param id - The ID of the entity to update.
 * @param data - The fields to update.
 */
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

/**
 * Represents a scriptable action (verb) attached to an entity.
 */
export interface Verb {
  id: number;
  entity_id: number;
  /** The name of the verb (command) */
  name: string;
  /** The compiled S-expression code for the verb */
  code: any; // JSON
  /** Permission settings for the verb */
  permissions: Record<string, any>;
}

export function getVerbs(entityId: number): Verb[] {
  // Recursive function to collect verbs up the prototype chain
  const collectVerbs = (id: number, visited: Set<number>): Verb[] => {
    if (visited.has(id)) return [];
    visited.add(id);

    const rows = db
      .query("SELECT * FROM verbs WHERE entity_id = ?")
      .all(id) as any[];

    const verbs = rows.map((r) => ({
      ...r,
      code: JSON.parse(r.code),
      permissions: JSON.parse(r.permissions),
    }));

    // Check prototype
    const entity = db
      .query("SELECT prototype_id FROM entities WHERE id = ?")
      .get(id) as { prototype_id: number | null };

    if (entity && entity.prototype_id) {
      const protoVerbs = collectVerbs(entity.prototype_id, visited);
      // Merge, keeping the child's verb if names collide
      const verbNames = new Set(verbs.map((v) => v.name));
      for (const pv of protoVerbs) {
        if (!verbNames.has(pv.name)) {
          verbs.push(pv);
        }
      }
    }

    return verbs;
  };

  return collectVerbs(entityId, new Set());
}

export function getVerb(entityId: number, name: string): Verb | null {
  // Recursive lookup
  const lookup = (id: number, visited: Set<number>): Verb | null => {
    if (visited.has(id)) return null;
    visited.add(id);

    const row = db
      .query("SELECT * FROM verbs WHERE entity_id = ? AND name = ?")
      .get(id, name) as any;

    if (row) {
      return {
        ...row,
        code: JSON.parse(row.code),
        permissions: JSON.parse(row.permissions),
      };
    }

    // Check prototype
    const entity = db
      .query("SELECT prototype_id FROM entities WHERE id = ?")
      .get(id) as { prototype_id: number | null };

    if (entity && entity.prototype_id) {
      return lookup(entity.prototype_id, visited);
    }

    return null;
  };

  return lookup(entityId, new Set());
}

export function addVerb(
  entityId: number,
  name: string,
  code: any,
  permissions: Record<string, any> = { call: "public" },
) {
  db.query(
    "INSERT INTO verbs (entity_id, name, code, permissions) VALUES (?, ?, ?, ?)",
  ).run(entityId, name, JSON.stringify(code), JSON.stringify(permissions));
}

export function updateVerb(
  id: number,
  code?: any,
  permissions?: Record<string, any>,
) {
  const updates: string[] = [];
  const params: any[] = [];

  if (code !== undefined) {
    updates.push("code = ?");
    params.push(JSON.stringify(code));
  }
  if (permissions !== undefined) {
    updates.push("permissions = ?");
    params.push(JSON.stringify(permissions));
  }

  if (updates.length > 0) {
    params.push(id);
    db.query(`UPDATE verbs SET ${updates.join(", ")} WHERE id = ?`).run(
      ...params,
    );
  }
}

export function deleteEntity(id: number) {
  const transaction = db.transaction(() => {
    db.query("DELETE FROM entity_data WHERE entity_id = ?").run(id);
    db.query("DELETE FROM verbs WHERE entity_id = ?").run(id);
    db.query("DELETE FROM entities WHERE id = ?").run(id);
  });
  transaction();
}
