# Programmable Workflows

Viwo is not just a game engine; it is a programmable object server. This means you can attach scripts to objects to automate tasks, creating "bots" or "agents" that live within the world.

## Concepts

- **Bots**: Entities with scripts that run autonomously (via `schedule` or event triggers).
- **Triggers**: Verbs that are called automatically when certain events happen (e.g., `on_enter`, `on_leave`).
- **Capabilities**: Bots need permissions to act. A "Janitor" bot needs `sys.destroy` or `entity.control` to clean up items.

## Examples

### 1. The Janitor Bot

A bot that cleans up items in a room every minute.

```typescript
// @verb janitor_start
export function janitor_start(this: Entity) {
  schedule("clean", [], 0);
}
// @endverb

// @verb janitor_clean
export function janitor_clean(this: Entity) {
  const room = entity(this["location"] as number);
  const contents = (room["contents"] as number[]) ?? [];

  // Find trash
  const trash = list.filter(contents, (id: number) => {
    const item = resolve_props(entity(id));
    return item["is_trash"] === true;
  });

  if (!list.empty(trash)) {
    const cap = get_capability("sys.destroy", {});
    if (cap) {
      list.map(trash, (id: number) => {
        destroy(cap, entity(id));
      });
      call(room, "tell", "The Janitor sweeps away the trash.");
    }
  }

  // Schedule next clean
  schedule("clean", [], 60000);
}
// @endverb
```

### 2. The Greeter

A bot that welcomes players when they enter a room.

```typescript
// @verb greeter_on_enter
export function greeter_on_enter(this: Entity) {
  const mover = arg<Entity>(0);
  // Don't greet ourselves
  if (mover.id !== this.id) {
    call(
      mover,
      "tell",
      `Welcome to ${
        resolve_props(entity(this["location"] as number))["name"]
      }!`,
    );
  }
}
// @endverb
```

### 3. Kanban Automation

A "Column" entity that archives cards when they are dropped into it.

```typescript
// @verb column_on_enter
export function column_on_enter(this: Entity) {
  const card = arg<Entity>(0);

  // Check if it's a card
  const props = resolve_props(card);
  if (props["type"] === "card") {
    // Archive it
    card["archived"] = true;
    card["archived_at"] = time.now();

    const cap = get_capability("entity.control", { target_id: card.id });
    if (cap) {
      set_entity(cap, card);
      call(caller(), "tell", `Card '${props["name"]}' has been archived.`);
    }
  }
}
// @endverb
```
