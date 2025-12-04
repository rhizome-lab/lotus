import { SQLQueryBindings } from "bun:sqlite";
import { db } from "./db";

import { Entity } from "@viwo/shared/jsonrpc";
import { ScriptValue } from "@viwo/scripting";

/**
 * Fetches an entity by ID, resolving its properties against its prototype.
 *
 * This performs a "deep resolve" where instance properties override prototype properties.
 *
 * @param id - The ID of the entity to fetch.
 * @returns The resolved Entity object or null if not found.
 */
export function getEntity(id: number): Entity | null {
  const entity = db.query("SELECT * FROM entities WHERE id = ?").get(id) as any;
  if (!entity) {
    console.log(`getEntity: entity ${id} not found in DB`);
    return null;
  }
  let props = JSON.parse(entity.props);
  // Recursive prototype resolution
  if (entity.prototype_id) {
    const proto = getEntity(entity.prototype_id);
    if (proto) {
      // Merge props: Instance overrides Prototype
      props = { ...proto, ...props };
    }
  }
  return { ...props, id: entity.id };
}

/**
 * Creates a new entity in the database.
 *
 * @param props - The initial properties for the entity.
 * @param prototypeId - Optional prototype ID.
 * @returns The ID of the newly created entity.
 */
export function createEntity(
  props: object,
  prototypeId: number | null = null,
): number {
  const info = db
    .query(
      "INSERT INTO entities (prototype_id, props) VALUES (?, ?) RETURNING id",
    )
    .get(prototypeId, JSON.stringify(props)) as { id: number };
  return info.id;
}

/**
 * Updates an existing entity.
 * Only provided fields will be updated.
 *
 * @param id - The ID of the entity to update.
 * @param props - The properties to update (merged with existing).
 */
export function updateEntity(...entities: readonly Entity[]) {
  if (entities.length === 0) return;
  const params: (number | string)[] = [];
  for (const { id, ...props } of entities) {
    params.push(id, JSON.stringify(props));
  }
  db.query(
    `INSERT INTO entities (id, props) VALUES ${entities
      .map(() => "(?, ?)")
      .join(", ")} ON CONFLICT (id) DO UPDATE SET props = excluded.props`,
  ).run(...params);
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

/**
 * Retrieves all verbs available on an entity, including inherited ones.
 *
 * @param entityId - The ID of the entity to fetch verbs for.
 * @returns An array of Verb objects.
 */
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

/**
 * Retrieves a specific verb by name from an entity (or its prototypes).
 *
 * @param entityId - The ID of the entity to search.
 * @param name - The name of the verb.
 * @returns The Verb object or null if not found.
 */
export function getVerb(entityId: number, name: string): Verb | null {
  return lookupVerb(entityId, name, new Set());
}

/**
 * Adds a new verb to an entity.
 *
 * @param entityId - The ID of the entity to attach the verb to.
 * @param name - The name of the verb.
 * @param code - The S-expression code for the verb.
 * @param permissions - Optional permission settings (default: public call).
 */
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

/**
 * Updates an existing verb's code or permissions.
 *
 * @param id - The ID of the verb to update.
 * @param code - Optional new code.
 * @param permissions - Optional new permissions.
 */
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

/**
 * Deletes an entity and all its associated verbs.
 *
 * @param id - The ID of the entity to delete.
 */
export function deleteEntity(id: number) {
  const transaction = db.transaction(() => {
    db.query("DELETE FROM verbs WHERE entity_id = ?").run(id);
    db.query("DELETE FROM entities WHERE id = ?").run(id);
  });
  transaction();
}

/**
 * Gets the prototype ID of an entity.
 *
 * @param id - The ID of the entity.
 * @returns The prototype ID or null if none.
 */
export function getPrototypeId(id: number): number | null {
  const row = db
    .query<{ prototype_id: number | null }, [number]>(
      "SELECT prototype_id FROM entities WHERE id = ?",
    )
    .get(id);
  return row ? row.prototype_id : null;
}

/**
 * Sets the prototype of an entity.
 *
 * @param id - The ID of the entity.
 * @param prototypeId - The new prototype ID or null to remove inheritance.
 */
export function setPrototypeId(id: number, prototypeId: number | null) {
  db.query("UPDATE entities SET prototype_id = ? WHERE id = ?").run(
    prototypeId,
    id,
  );
}

export interface Capability {
  id: string;
  owner_id: number;
  type: string;
  params: Record<string, unknown>;
}

export function createCapability(
  ownerId: number,
  type: string,
  params: Record<string, unknown>,
): string {
  const id = crypto.randomUUID();
  db.query(
    "INSERT INTO capabilities (id, owner_id, type, params) VALUES (?, ?, ?, ?)",
  ).run(id, ownerId, type, JSON.stringify(params));
  return id;
}

export function getCapabilities(ownerId: number): Capability[] {
  const rows = db
    .query<
      { id: string; owner_id: number; type: string; params: string },
      [number]
    >("SELECT id, owner_id, type, params FROM capabilities WHERE owner_id = ?")
    .all(ownerId);
  return rows.map((r) => ({
    ...r,
    params: JSON.parse(r.params),
  }));
}

export function getCapability(id: string): Capability | null {
  const row = db
    .query<
      { id: string; owner_id: number; type: string; params: string },
      [string]
    >("SELECT id, owner_id, type, params FROM capabilities WHERE id = ?")
    .get(id);
  if (!row) return null;
  return {
    ...row,
    params: JSON.parse(row.params),
  };
}

export function deleteCapability(id: string) {
  db.query("DELETE FROM capabilities WHERE id = ?").run(id);
}

export function updateCapabilityOwner(id: string, newOwnerId: number) {
  db.query("UPDATE capabilities SET owner_id = ? WHERE id = ?").run(
    newOwnerId,
    id,
  );
}
