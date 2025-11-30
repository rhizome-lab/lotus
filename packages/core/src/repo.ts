import { SQLQueryBindings } from "bun:sqlite";
import { db } from "./db";
import { ScriptValue } from "./scripting/def";

/**
 * Represents a game entity.
 * Everything in the game is an Entity (Room, Player, Item, Exit, etc.).
 */
export type Entity = {
  /** Unique ID of the entity */
  id: number;
  /** ID of the prototype this entity inherits from (hidden from public interface mostly) */
  // prototype_id: number | null;
  /**
   * Resolved properties (merged from prototype and instance).
   * Contains arbitrary game data like description, adjectives, custom_css.
   */
  [key: string]: unknown;
};

/**
 * Fetches an entity by ID, resolving its properties against its prototype.
 *
 * This performs a "deep resolve" where instance properties override prototype properties.
 *
 * @param id - The ID of the entity to fetch.
 * @returns The resolved Entity object or null if not found.
 */
export function getEntity(id: number): Entity | null {
  const row = db
    .query("SELECT id, prototype_id, props FROM entities WHERE id = ?")
    .get(id) as { id: number; prototype_id: number | null; props: string };

  if (!row) return null;

  let props = JSON.parse(row.props);

  // Recursive prototype resolution
  if (row.prototype_id) {
    const proto = getEntity(row.prototype_id);
    if (proto) {
      // Merge props: Instance overrides Prototype
      // We exclude 'id' from proto to avoid overwriting
      const { id: _, ...protoProps } = proto;
      props = { ...protoProps, ...props };
    }
  }

  return {
    id: row.id,
    ...props,
  };
}

/**
 * Creates a new entity in the database.
 *
 * @param props - The initial properties for the entity.
 * @param prototypeId - Optional prototype ID.
 * @returns The ID of the newly created entity.
 */
export function createEntity(
  props: Record<string, unknown>,
  prototypeId?: number,
): number {
  const result = db
    .query<{ id: number }, [prototypeId: number | null, props: string]>(
      "INSERT INTO entities (prototype_id, props) VALUES (?, ?) RETURNING id",
    )
    .get(prototypeId ?? null, JSON.stringify(props));
  return result!.id;
}

/**
 * Updates an existing entity.
 * Only provided fields will be updated.
 *
 * @param id - The ID of the entity to update.
 * @param props - The properties to update (merged with existing).
 */
export function updateEntity(...entities: readonly Entity[]) {
  const ids: number[] = [];
  const allProps: string[] = [];
  for (const { id, ...props } of entities) {
    ids.push(id);
    allProps.push(JSON.stringify(props));
  }
  db.query(
    `INSERT INTO entities (id, props) VALUES ${entities
      .map(() => "(?, ?)")
      .join(", ")} ON CONFLICT (id) DO UPDATE SET props = excluded.props`,
  ).run(...ids, ...allProps);
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
  code: ScriptValue<unknown>;
  /** Permission settings for the verb */
  permissions: Record<string, unknown>;
}

export function getVerbs(entityId: number): Verb[] {
  // Recursive function to collect verbs up the prototype chain
  const collectVerbs = (id: number, visited: Set<number>): Verb[] => {
    if (visited.has(id)) return [];
    visited.add(id);

    const rows = db
      .query<
        {
          id: number;
          entity_id: number;
          name: string;
          code: string;
          permissions: string;
        },
        [id: number]
      >("SELECT * FROM verbs WHERE entity_id = ?")
      .all(id);

    const verbs = rows.map((r) => ({
      ...r,
      code: JSON.parse(r.code),
      permissions: JSON.parse(r.permissions),
    }));

    // Check prototype
    const entity = db
      .query<{ prototype_id: number | null }, [id: number]>(
        "SELECT prototype_id FROM entities WHERE id = ?",
      )
      .get(id);

    if (entity?.prototype_id) {
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

// Recursive lookup
function lookupVerb(
  id: number,
  name: string,
  visited: Set<number>,
): Verb | null {
  if (visited.has(id)) return null;
  visited.add(id);

  const row = db
    .query<
      {
        id: number;
        entity_id: number;
        name: string;
        code: string;
        permissions: string;
      },
      [id: number, name: string]
    >("SELECT * FROM verbs WHERE entity_id = ? AND name = ?")
    .get(id, name);

  if (row) {
    return {
      ...row,
      code: JSON.parse(row.code),
      permissions: JSON.parse(row.permissions),
    };
  }

  // Check prototype
  const entity = db
    .query<{ prototype_id: number | null }, [id: number]>(
      "SELECT prototype_id FROM entities WHERE id = ?",
    )
    .get(id);

  if (entity?.prototype_id) {
    return lookupVerb(entity.prototype_id, name, visited);
  }

  return null;
}

export function getVerb(entityId: number, name: string): Verb | null {
  return lookupVerb(entityId, name, new Set());
}

export function addVerb(
  entityId: number,
  name: string,
  code: ScriptValue<unknown>,
  permissions: Record<string, unknown> = { call: "public" },
) {
  db.query<
    unknown,
    [entityId: number, name: string, code: string, permissions: string]
  >(
    "INSERT INTO verbs (entity_id, name, code, permissions) VALUES (?, ?, ?, ?)",
  ).run(entityId, name, JSON.stringify(code), JSON.stringify(permissions));
}

export function updateVerb(
  id: number,
  code?: ScriptValue<unknown>,
  permissions?: Record<string, unknown>,
) {
  const updates: string[] = [];
  const params: SQLQueryBindings[] = [];

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
    db.query<unknown, SQLQueryBindings[]>(
      `UPDATE verbs SET ${updates.join(", ")} WHERE id = ?`,
    ).run(...params);
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

export function getPrototypeId(id: number): number | null {
  const row = db
    .query<{ prototype_id: number | null }, [number]>(
      "SELECT prototype_id FROM entities WHERE id = ?",
    )
    .get(id);
  return row ? row.prototype_id : null;
}

export function setPrototypeId(id: number, prototypeId: number | null) {
  db.query("UPDATE entities SET prototype_id = ? WHERE id = ?").run(
    prototypeId,
    id,
  );
}
