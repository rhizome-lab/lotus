import type { Entity } from "@viwo/shared/jsonrpc";
import type { SQLQueryBindings } from "bun:sqlite";
import type { ScriptValue } from "@viwo/scripting";
import { db } from "./db";

/**
 * Fetches an entity by ID, resolving its properties against its prototype.
 *
 * This performs a "deep resolve" where instance properties override prototype properties.
 *
 * @param id - The ID of the entity to fetch.
 * @returns The resolved Entity object or null if not found.
 */

export function getEntity(id: number): Entity | null {
  const chain = db
    .query<{ id: number; prototype_id: number | null; props: string }, [number]>(
      `WITH RECURSIVE lineage AS (
        SELECT id, prototype_id, props, 0 as depth FROM entities WHERE id = ?
        UNION ALL
        SELECT e.id, e.prototype_id, e.props, l.depth + 1
        FROM entities e
        JOIN lineage l ON e.id = l.prototype_id
      )
      SELECT id, prototype_id, props FROM lineage ORDER BY depth DESC;`,
    )
    .all(id);
  // Merge properties from root (oldest prototype) to leaf (instance)
  if (chain.length === 0) {
    return null;
  }

  let mergedProps = {};
  for (const row of chain) {
    mergedProps = { ...mergedProps, ...JSON.parse(row.props) };
  }

  const instance = chain.at(-1)!;
  return { ...mergedProps, id: instance.id, prototype_id: instance.prototype_id };
}

/**
 * Fetches multiple entities by their IDs, resolving properties against prototypes.
 *
 * @param ids - The list of entity IDs to fetch.
 * @returns An array of resolved Entity objects.
 */
export function getEntities(ids: number[]): Entity[] {
  if (ids.length === 0) {
    return [];
  }
  const entities: Entity[] = [];
  for (const entityId of ids) {
    const entity = getEntity(entityId);
    if (entity) {
      entities.push(entity);
    }
  }
  return entities;
}

/**
 * Creates a new entity in the database.
 *
 * @param props - The initial properties for the entity.
 * @param prototypeId - Optional prototype ID.
 * @returns The ID of the newly created entity.
 */
export function createEntity(props: object, prototypeId: number | null = null): number {
  const info = db
    .query<{ id: number }, [prototypeId: number | null, props: string]>(
      "INSERT INTO entities (prototype_id, props) VALUES (?, ?) RETURNING id",
    )
    .get(prototypeId, JSON.stringify(props))!;
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
  if (entities.length === 0) {
    return;
  }

  const transaction = db.transaction(() => {
    for (const { id, ...updates } of entities) {
      // 1. Fetch current raw props and prototype_id
      const row = db
        .query<{ props: string; prototype_id: number | null }, [number]>(
          "SELECT props, prototype_id FROM entities WHERE id = ?",
        )
        .get(id);

      let currentProps = {};
      let prototypeId: number | null = null;
      let updatesPrototypeId: number | undefined;

      // Extract prototype_id from updates if present
      if ("prototype_id" in updates) {
        updatesPrototypeId = (updates as any).prototype_id;
        delete (updates as any).prototype_id;
      }

      if (row) {
        prototypeId = row.prototype_id;
        try {
          currentProps = JSON.parse(row.props);
        } catch {
          // invalid json, ignore
        }
      }

      // Override prototypeId if provided in updates
      if (updatesPrototypeId !== undefined) {
        prototypeId = updatesPrototypeId;
      }

      // 2. Linear merge (Partial Update)
      const newProps = { ...currentProps, ...updates };

      // 3. Save
      // We use INSERT OR REPLACE to handle both update and creation (if ID provided).
      // We must preserve prototype_id.
      db.query("INSERT OR REPLACE INTO entities (id, prototype_id, props) VALUES (?, ?, ?)").run(
        id,
        prototypeId,
        JSON.stringify(newProps),
      );
    }
  });

  transaction();
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
}

/**
 * Retrieves all verbs available on an entity, including inherited ones.
 *
 * @param entityId - The ID of the entity to fetch verbs for.
 * @returns An array of Verb objects.
 */
export function getVerbs(entityId: number): Verb[] {
  // Use CTE to find all verbs in the prototype chain
  // We wish to allow children to override verbs by name.
  // We select from Lineage -> Verbs.
  // Then we group by name in JS or use logic to keep the one with lowest depth (nearest).
  const rows = db
    .query<{ id: number; entity_id: number; name: string; code: string; depth: number }, [number]>(
      `WITH RECURSIVE lineage AS (
        SELECT id, prototype_id, 0 as depth FROM entities WHERE id = ?
        UNION ALL
        SELECT e.id, e.prototype_id, l.depth + 1
        FROM entities e
        JOIN lineage l ON e.id = l.prototype_id
      )
      SELECT v.id, v.entity_id, v.name, v.code, l.depth
      FROM verbs v
      JOIN lineage l ON v.entity_id = l.id
      ORDER BY l.depth DESC;`, // Order by depth DESC (Root -> Leaf) so Leaf overrides Root
    )
    .all(entityId);

  const verbMap = new Map<string, Verb>();
  for (const row of rows) {
    // Because we iterate Root -> Leaf (Depth DESC means high depth (root) first? Wait.
    // 0 is leaf. N is root.
    // depth 0 = instance.
    // depth 1 = parent.
    // ORDER BY depth DESC means we see Root first. Then Leaf.
    // So Leaf overwrites Root.
    verbMap.set(row.name, {
      code: JSON.parse(row.code),
      entity_id: row.entity_id,
      id: row.id,
      name: row.name,
    });
  }

  return Array.from(verbMap.values());
}

/**
 * Retrieves a specific verb by name from an entity (or its prototypes).
 *
 * @param entityId - The ID of the entity to search.
 * @param name - The name of the verb.
 * @returns The Verb object or null if not found.
 */
export function getVerb(entityId: number, name: string): Verb | null {
  // Find the closest verb in the prototype chain with the given name
  const row = db
    .query<
      { id: number; entity_id: number; name: string; code: string; depth: number },
      [id: number, name: string]
    >(
      `WITH RECURSIVE lineage AS (
        SELECT id, prototype_id, 0 as depth FROM entities WHERE id = ?
        UNION ALL
        SELECT e.id, e.prototype_id, l.depth + 1
        FROM entities e
        JOIN lineage l ON e.id = l.prototype_id
      )
      SELECT v.id, v.entity_id, v.name, v.code, l.depth
      FROM verbs v
      JOIN lineage l ON v.entity_id = l.id
      WHERE v.name = ?
      ORDER BY l.depth ASC
      LIMIT 1;`, // depth ASC means Leaf (0) -> Root (N). We want the first one found (Leaf).
    )
    .get(entityId, name);

  if (!row) {
    return null;
  }
  return {
    code: JSON.parse(row.code),
    entity_id: row.entity_id,
    id: row.id,
    name: row.name,
  };
}

/**
 * Adds a new verb to an entity.
 *
 * @param entityId - The ID of the entity to attach the verb to.
 * @param name - The name of the verb.
 * @param code - The S-expression code for the verb.
 */
export function addVerb(entityId: number, name: string, code: ScriptValue<unknown>) {
  try {
    db.query<unknown, [entityId: number, name: string, code: string]>(
      "INSERT INTO verbs (entity_id, name, code) VALUES (?, ?, ?)",
    ).run(entityId, name, JSON.stringify(code));
  } catch {
    throw new Error(`Verb '${name}' already exists on entity ${entityId}`);
  }
}

/**
 * Updates an existing verb's code or permissions.
 *
 * @param id - The ID of the verb to update.
 * @param code - Optional new code.
 */
export function updateVerb(id: number, code?: ScriptValue<unknown>) {
  const updates: string[] = [];
  const params: SQLQueryBindings[] = [];

  if (code !== undefined) {
    updates.push("code = ?");
    params.push(JSON.stringify(code));
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
    db.query("DELETE FROM capabilities WHERE owner_id = ?").run(id);
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
  db.query("UPDATE entities SET prototype_id = ? WHERE id = ?").run(prototypeId, id);
}

interface Capability {
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
  db.query("INSERT INTO capabilities (id, owner_id, type, params) VALUES (?, ?, ?, ?)").run(
    id,
    ownerId,
    type,
    JSON.stringify(params),
  );
  return id;
}

export function getCapabilities(ownerId: number): Capability[] {
  const rows = db
    .query<Capability, SQLQueryBindings>("SELECT * FROM capabilities WHERE owner_id = ?")
    .all(ownerId);
  return rows.map((row) => ({
    ...row,
    params: JSON.parse(row.params as unknown as string) as Record<string, unknown>,
  }));
}

export function getCapability(id: string): Capability | null {
  const row = db
    .query<{ id: string; owner_id: number; type: string; params: string }, [string]>(
      "SELECT id, owner_id, type, params FROM capabilities WHERE id = ?",
    )
    .get(id);
  if (!row) {
    return null;
  }
  return { ...row, params: JSON.parse(row.params) };
}

export function updateCapabilityOwner(id: string, newOwnerId: number) {
  db.query("UPDATE capabilities SET owner_id = ? WHERE id = ?").run(newOwnerId, id);
}
