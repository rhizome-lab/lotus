// oxlint-disable-next-line no-unassigned-import
import "../../generated_types";
import { EntityBase } from "./EntityBase";

export class Watch extends EntityBase {
  override tell() {
    send("message", time.format(time.now(), "time"));
  }
}

export class Teleporter extends EntityBase {
  override teleport() {
    const destId = this.destination;
    if (!destId) {
      send("message", "The stone is dormant.");
      return;
    }
    call(std.caller(), "teleport", entity(destId));
    send("message", "Whoosh! You have been teleported.");
  }
}

export class StatusOrb extends EntityBase {
  check() {
    send("message", "Status check disabled.");
  }
}

export class ColorLibrary extends EntityBase {
  colors: string[] = [];

  random_color() {
    const { colors } = this;
    const idx = (this.id * 7919) % list.len(colors);
    list.get(colors, idx);
  }
}

export class MoodRing extends EntityBase {
  color_lib?: number;

  update_color() {
    const libId = this.color_lib!;
    const newColor = call(entity(libId), "random_color");
    const cap = get_capability("entity.control", { target_id: this.id });
    if (cap) {
      std.call_method(cap, "update", this, {
        adjectives: [`color:${newColor}`, "material:silver"],
      });
    }
    schedule("update_color", [], 5000);
  }

  touch() {
    schedule("update_color", [], 0);
  }
}

export class DynamicMoodRing extends EntityBase {
  get_adjectives() {
    return [`color:hsl(${time.to_timestamp(time.now()) * 0.1}, 100%, 50%)`, "material:gold"];
  }
}

export class BroadcastingWatch extends EntityBase {
  tick() {
    send("message", `Tick Tock: ${time.format(time.now(), "time")}`);
    (globalThis as any).schedule("tick", [], 10_000);
  }
  start() {
    (globalThis as any).schedule("tick", [], 0);
  }
}

export class Clock extends EntityBase {
  tick() {
    send("message", `BONG! It is ${time.format(time.now(), "time")}`);
    (globalThis as any).schedule("tick", [], 15_000);
  }
  start() {
    (globalThis as any).schedule("tick", [], 0);
  }
}

export class ClockTower extends EntityBase {
  toll() {
    send("message", `The Clock Tower tolls: ${time.format(time.now(), "time")}`);
    (globalThis as any).schedule("toll", [], 60_000);
  }
  start() {
    (globalThis as any).schedule("toll", [], 0);
  }
}

export class Mailbox extends EntityBase {
  deposit() {
    send("message", "Deposit disabled.");
  }
}

export class Director extends EntityBase {
  tick() {
    const voidId = this.location!;
    const voidEnt = entity(voidId) as EntityBase;
    const contents = voidEnt.contents ?? [];

    let lobbyId: number | null = null;
    for (const id of contents) {
      const ent = resolve_props(entity(id)) as EntityBase;
      if (ent.name === "Lobby") {
        lobbyId = id;
        break;
      }
    }

    if (!lobbyId) {
      (globalThis as any).schedule("tick", [], 60_000);
      return;
    }

    const room = resolve_props(entity(lobbyId)) as EntityBase;

    const prompt = `\
Location: "${room.name}"
Description: "${room.description}"

Generate a single sentence of atmospheric prose describing a subtle event in this location.`;

    const eventText = ai.text("openai:gpt-3.5-turbo", prompt);

    const roomContents = room.contents ?? [];
    for (const id of roomContents) {
      try {
        const ent = entity(id);
        call(ent, "tell", `[Director] ${eventText}`);
      } catch {
        // Ignore
      }
    }

    // Random delay between 20-60 seconds
    const delay = 20_000 + (Date.now() % 40_000);
    (globalThis as any).schedule("tick", [], delay);
  }

  start() {
    (globalThis as any).schedule("tick", [], 1000);
  }

  test_quest() {
    // Placeholder for quest_test
    // Originally: export function quest_test(this: Entity) { ... }
    // We can implement it if needed or just skip it if it was for testing.
    // Let's implement minimal placeholder.
    send("message", "Quest test verb called.");
  }
}

export class CombatManager extends EntityBase {
  start(participants: Entity[]) {
    if (!participants || list.len(participants) < 2) {
      throw new Error("Not enough participants for combat.");
    }

    const createCap = get_capability("sys.create", {});
    const controlCap = get_capability("entity.control", { "*": true });

    if (!createCap || !controlCap) {
      throw new Error("Combat Manager missing capabilities.");
    }

    const participantIds = list.map(participants, (participant: Entity) => participant.id);

    const sessionData: Record<string, any> = {};
    sessionData["name"] = "Combat Session";
    sessionData["participants"] = participantIds;
    sessionData["turn_order"] = participantIds;
    sessionData["current_turn_index"] = 0;
    sessionData["round"] = 1;
    sessionData["location"] = this.location;

    const sessionId = createCap.create(sessionData);
    return sessionId;
  }

  next_turn(sessionId: number) {
    const session = entity(sessionId);
    const controlCap = get_capability("entity.control", { target_id: sessionId });
    if (!controlCap) {
      throw new Error("Combat Manager missing capabilities.");
    }
    let index = session["current_turn_index"] as number;
    const order = session["turn_order"] as number[];

    let nextId: number | null = null;
    let attempts = 0;
    const maxAttempts = list.len(order);

    while (attempts < maxAttempts) {
      index += 1;
      if (index >= list.len(order)) {
        index = 0;
        const round = session["round"] as number;
        controlCap.update(session, { round: round + 1 });
      }

      const candidateId = order[index]!;
      const canAct = this.tick_status(entity(candidateId));

      if (canAct) {
        nextId = candidateId;
        break;
      } else {
        call(entity(candidateId), "tell", "You are unable to act this turn!");
      }

      attempts += 1;
    }
    controlCap.update(session, { current_turn_index: index });
    return nextId;
  }

  attack(attacker: Entity, target: Entity, elementArg: string) {
    const attProps = resolve_props(attacker) as EntityBase;
    const defProps = resolve_props(target) as EntityBase;

    const element = elementArg ?? (attProps["element"] as string) ?? "normal";

    const attack = (attProps["attack"] as number) ?? 10;
    const defense = (defProps["defense"] as number) ?? 0;

    const attStats = (attProps["elemental_stats"] as Record<string, any>) ?? {};
    const attMod = (attStats[element] ? attStats[element]["attack_scale"] : 1) ?? 1;
    const finalAttack = attack * attMod;

    const defStats = (defProps["elemental_stats"] as Record<string, any>) ?? {};
    const defMod = (defStats[element] ? defStats[element]["defense_scale"] : 1) ?? 1;
    const resMod = (defStats[element] ? defStats[element]["damage_taken"] : 1) ?? 1;
    const finalDefense = defense * defMod;

    let baseDamage = finalAttack - finalDefense;
    if (baseDamage < 1) {
      baseDamage = 1;
    }

    const finalDamage = math.floor(baseDamage * resMod);

    const hp = (defProps["hp"] as number) ?? 100;
    const newHp = hp - finalDamage;

    let targetCap = get_capability("entity.control", { target_id: target.id });
    targetCap ??= get_capability("entity.control", { "*": true });

    if (targetCap) {
      targetCap.update(target, { hp: newHp });

      let msg = `You attack ${defProps.name} with ${element} for ${finalDamage} damage!`;
      if (resMod > 1) {
        msg += " It's super effective!";
      }
      if (resMod < 1 && resMod > 0) {
        msg += " It's not very effective...";
      }
      if (resMod === 0) {
        msg += " It had no effect!";
      }

      call(attacker, "tell", msg);
      call(
        target,
        "tell",
        `${attProps.name} attacks you with ${element} for ${finalDamage} damage!`,
      );

      if (newHp <= 0) {
        call(attacker, "tell", `${defProps.name} is defeated!`);
        call(target, "tell", "You are defeated!");
      }
    } else {
      call(
        attacker,
        "tell",
        `You attack ${defProps.name}, but it seems invulnerable (no permission).`,
      );
    }
  }

  basic_attack(attacker: Entity, target: Entity) {
    // Reuse elemental logic or simplify?
    // Original was simpler. Let's just defer to elemental with "normal".
    this.attack(attacker, target, "normal");
  }

  apply_status(target: EntityBase, effectEntity: EntityBase, duration: number, magnitude: number) {
    if (!target || !effectEntity) {
      return;
    }

    const effectId = effectEntity.id;
    const effectKey = `${effectId}`;

    const effects = (target["status_effects"] as Record<string, any>) ?? {};

    const newEffect: Record<string, any> = {};
    newEffect["effect_id"] = effectId;
    if (duration !== null) {
      newEffect["duration"] = duration;
    }
    if (magnitude !== null) {
      newEffect["magnitude"] = magnitude;
    }

    effects[effectKey] = newEffect;

    const controlCap =
      get_capability("entity.control", { target_id: target.id }) ??
      get_capability("entity.control", { "*": true });
    if (!controlCap) {
      return;
    }
    controlCap.update(target, { status_effects: effects });
    call(effectEntity, "on_apply", target, newEffect);
    call(target, "tell", `Applied ${effectEntity.name}.`);
  }

  tick_status(target: Entity) {
    if (!target) {
      return true;
    }

    const effects = (target["status_effects"] as Record<string, any>) ?? {};
    const effectKeys = obj.keys(effects);

    let canAct = true;
    let controlCap = get_capability("entity.control", { target_id: target.id });
    controlCap ??= get_capability("entity.control", { "*": true });

    if (!controlCap) {
      return true;
    }

    for (const key of effectKeys) {
      const effectData = effects[key];
      const effectId = effectData["effect_id"] as number;
      const effectEntity = entity(effectId) as EntityBase;

      const result = call(effectEntity, "on_tick", target, effectData);
      if (result === false) {
        canAct = false;
      }

      if (effectData["duration"] !== undefined && effectData["duration"] !== null) {
        const duration = effectData["duration"] as number;
        const newDuration = duration - 1;
        effectData["duration"] = newDuration;

        if (newDuration <= 0) {
          call(effectEntity, "on_remove", target, effectData);
          obj.del(effects, key);
          call(target, "tell", `${effectEntity.name} wore off.`);
        }
      }
    }

    controlCap.update(target, { status_effects: effects });
    return canAct;
  }

  test(warrior: EntityBase, orc: EntityBase) {
    if (!warrior || !orc) {
      send("message", "Usage: test <warrior> <orc>");
      return;
    }

    const sessionId = this.start([warrior, orc]);
    send("message", `Combat started! Session: ${sessionId}`);

    const firstId = this.next_turn(sessionId);
    if (!firstId) {
      send("message", "No one can act!");
      return;
    }
    const first = entity(firstId) as EntityBase;
    send("message", `Turn: ${first.name}`);

    const target = first.id === warrior.id ? orc : warrior;

    const poisonId = this["poison_effect"] as number;
    if (poisonId) {
      this.apply_status(target, entity(poisonId) as EntityBase, 3, 5);
      send("message", `Debug: Applied Poison to ${target.name}`);
    }

    this.attack(first, target, "normal");
  }
}

export class EffectBase extends EntityBase {
  on_apply() {
    // No-op
  }
  on_tick(_target: Entity, _data: Record<string, unknown>) {
    // No-op
  }
  on_remove() {
    // No-op
  }
}

export class Poison extends EffectBase {
  override on_tick(target: Entity, data: Record<string, unknown>) {
    const controlCap =
      get_capability("entity.control", { target_id: target.id }) ??
      get_capability("entity.control", { "*": true });
    if (!controlCap) {
      return;
    }

    const magnitude = (data["magnitude"] as number) ?? 5;

    const hp = (resolve_props(target)["hp"] as number) ?? 100;
    const newHp = hp - magnitude;

    controlCap.update(target, { hp: newHp });
    call(target, "tell", `You take ${magnitude} poison damage!`);

    if (newHp <= 0) {
      call(target, "tell", "You succumbed to poison!");
    }
  }
}

export class Regen extends EffectBase {
  override on_tick(target: Entity, data: Record<string, unknown>) {
    const magnitude = (data["magnitude"] as number) ?? 5;

    const hp = (resolve_props(target)["hp"] as number) ?? 100;
    const maxHp = (resolve_props(target)["max_hp"] as number) ?? 100;

    let newHp = hp + magnitude;
    if (newHp > maxHp) {
      newHp = maxHp;
    }

    const controlCap =
      get_capability("entity.control", { target_id: target.id }) ??
      get_capability("entity.control", { "*": true });
    if (!controlCap) {
      return;
    }

    controlCap.update(target, { hp: newHp });
    call(target, "tell", `You regenerate ${magnitude} HP.`);
  }
}

export class Book extends EntityBase {
  read(index: number) {
    if (index === null) {
      throw new Error("Please specify a chapter index (0-based).");
    }
    const chapters = this["chapters"] as { title: string; content: string }[];
    const chapter = list.get(chapters, index);
    if (!chapter) {
      throw new Error("Chapter not found.");
    }
    call(std.caller(), "tell", `Reading: ${chapter.title}\n\n${chapter.content}`);
  }

  list_chapters() {
    const chapters = this["chapters"] as { title: string; content: string }[];
    call(
      std.caller(),
      "tell",
      `Chapters:\n${str.join(
        list.map(chapters, (chapter) => chapter.title),
        "\n",
      )}`,
    );
  }

  add_chapter(title: string, content: string) {
    if (!title || !content) {
      throw new Error("Usage: add_chapter <title> <content>");
    }
    const chapters = this["chapters"] as any[];
    const newChapter: Record<string, any> = {};
    newChapter["title"] = title;
    newChapter["content"] = content;
    newChapter["title"] = title;
    newChapter["content"] = content;
    list.push(chapters, newChapter);
    this["chapters"] = chapters;
    call(std.caller(), "tell", "Chapter added.");
  }

  search_chapters(query: string) {
    query = str.lower(query);
    const chapters = this["chapters"] as { title: string; content: string }[];
    const results = list.filter(
      chapters,
      (chapter) =>
        str.includes(str.lower(chapter.title), query) ??
        str.includes(str.lower(chapter.content), query),
    );
    call(
      std.caller(),
      "tell",
      `Found ${list.len(results)} matches:\n${str.join(
        list.map(results, (chapter) => chapter.title),
        "\n",
      )}`,
    );
  }
}
