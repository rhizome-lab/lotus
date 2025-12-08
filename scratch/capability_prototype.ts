// Mock of the internal privileged system (normally in core/repo.ts)
const INTERNAL = {
  createEntity: (name: string) => {
    const id = Math.floor(Math.random() * 1000);
    INTERNAL.db.set(id, name);
    return id;
  },
  db: new Map() as Map<number, string>, // id -> name
  deleteEntity: (id: number) => INTERNAL.db.delete(id),
};

// Base Capability Class (Abstract)
class Capability {
  readonly #type: string;

  constructor(type: string) {
    this.#type = type;
  }

  toString() {
    return `[Capability: ${this.#type}]`;
  }
}

// Specific Capability: System Create
// This creates new entities.
class SystemCreateCapability extends Capability {
  constructor() {
    super("sys.create");
  }

  create(name: string): EntityControlCapability {
    console.log("SystemCreateCapability: creating entity", name);
    const id = INTERNAL.createEntity(name);
    // Mint a new control capability for this specific entity
    return new EntityControlCapability(id);
  }
}

// Specific Capability: Entity Control
// Controls a specific entity.
class EntityControlCapability extends Capability {
  readonly #targetId: number;

  constructor(targetId: number) {
    super("entity.control");
    this.#targetId = targetId;
  }

  // Method to destroy the entity
  destroy() {
    console.log(`EntityControlCapability: destroying entity ${this.#targetId}`);
    INTERNAL.deleteEntity(this.#targetId);
  }

  // Method to rename (simulate update)
  rename(newName: string) {
    console.log(`EntityControlCapability: renaming entity ${this.#targetId} to ${newName}`);
    INTERNAL.db.set(this.#targetId, newName);
  }

  getId() {
    return this.#targetId;
  }
}

// Simulation of User Script interaction
function userScript(sysCap: SystemCreateCapability) {
  try {
    console.log("Script: Starting...");

    // 1. Create an entity using the System Capability
    const myEntityCap = sysCap.create("My Hero");
    console.log("Script: Created entity with ID:", myEntityCap.getId());

    // 2. Modify it
    myEntityCap.rename("My Super Hero");

    // 3. Try to destroy something we don't own?
    // We can't, because we don't have the capability object for it!
    // Unless we assume we can forge one.

    // Attempt to forge:
    // const fakeCap = new EntityControlCapability(123);
    // ^ This would fail if the class isn't exported to the script, or if the constructor is internal/protected.
    // In a real system, we would NOT expose the classes globally. We would inject instances.

    // 4. Destroy it
    myEntityCap.destroy();
    console.log("Script: Destroyed entity.");
  } catch (error) {
    console.error("Script Error:", error);
  }
}

// Main Execution
console.log("--- Starting Prototype Mock ---");
const rootCap = new SystemCreateCapability();
userScript(rootCap);
console.log("--- End Prototype Mock ---");

// oxlint-disable-next-line require-module-specifiers
export {};
