import { transpile } from "@viwo/scripting";
import { db } from "./db";
import { createEntity, addVerb, createCapability, updateEntity, getEntity } from "./repo";
import { seedItems } from "./seeds/items";
import { seedHotel } from "./seeds/hotel";
import { extractVerb } from "./verb_loader";
import { resolve } from "path";

const verbsPath = resolve(__dirname, "seeds/verbs.ts");

export function seed() {
  // Check for any row at all.
  const root = db.query("SELECT id FROM entities").get();
  if (root !== null) {
    console.log("Database already seeded.");
    return;
  }

  console.log("Seeding database...");

  // 1. Create The Void (Root Zone)
  const voidId = createEntity({
    name: "The Void",
    description: "An endless expanse of nothingness.",
  });

  // 2. Create Entity Base
  const entityBaseId = createEntity({
    name: "Entity Base",
    description: "The base of all things.",
    location: voidId,
  });

  // 3. Create System Entity
  const systemId = createEntity({
    name: "System",
    description: "The system root object.",
    location: voidId,
  });

  // Grant System capabilities
  createCapability(systemId, "sys.mint", { namespace: "*" });
  createCapability(systemId, "sys.create", {});
  createCapability(systemId, "sys.sudo", {});
  createCapability(systemId, "entity.control", { "*": true });

  // 4. Create Discord Bot Entity
  const botId = createEntity({
    name: "Discord Bot",
    description: "The bridge to Discord.",
    location: voidId,
  });

  createCapability(botId, "sys.sudo", {});

  createCapability(botId, "sys.sudo", {});

  addVerb(botId, "sudo", transpile(extractVerb(verbsPath, "bot_sudo")));

  addVerb(
    systemId,
    "get_available_verbs",
    transpile(extractVerb(verbsPath, "system_get_available_verbs")),
  );

  addVerb(entityBaseId, "find", transpile(extractVerb(verbsPath, "entity_base_find")));

  addVerb(entityBaseId, "find_exit", transpile(extractVerb(verbsPath, "entity_base_find_exit")));

  addVerb(entityBaseId, "on_enter", transpile(extractVerb(verbsPath, "entity_base_on_enter")));

  addVerb(entityBaseId, "on_leave", transpile(extractVerb(verbsPath, "entity_base_on_leave")));

  addVerb(entityBaseId, "teleport", transpile(extractVerb(verbsPath, "entity_base_teleport")));

  addVerb(entityBaseId, "go", transpile(extractVerb(verbsPath, "entity_base_go")));

  addVerb(entityBaseId, "say", transpile(extractVerb(verbsPath, "entity_base_say")));

  addVerb(entityBaseId, "tell", transpile(extractVerb(verbsPath, "entity_base_tell")));

  addVerb(
    entityBaseId,
    "get_llm_prompt",
    transpile(extractVerb(verbsPath, "entity_base_get_llm_prompt")),
  );

  addVerb(
    entityBaseId,
    "get_image_gen_prompt",
    transpile(extractVerb(verbsPath, "entity_base_get_image_gen_prompt")),
  );

  // 3. Create Humanoid Base
  const humanoidBaseId = createEntity(
    {
      name: "Humanoid Base",
      description: "A humanoid creature.",
      body_type: "humanoid",
      // Slots are just definitions of where things can go
      slots: [
        // Head & Neck
        "head",
        "face",
        "ears",
        "neck",
        // Torso & Back
        "torso",
        "back",
        "waist",
        // Arms
        "l_shoulder",
        "r_shoulder",
        "l_arm",
        "r_arm",
        "l_wrist",
        "r_wrist",
        "l_hand",
        "r_hand",
        // Fingers (Rings)
        "l_finger_thumb",
        "l_finger_index",
        "l_finger_middle",
        "l_finger_ring",
        "l_finger_pinky",
        "r_finger_thumb",
        "r_finger_index",
        "r_finger_middle",
        "r_finger_ring",
        "r_finger_pinky",
        // Legs
        "l_leg",
        "r_leg",
        "l_ankle",
        "r_ankle",
        // Feet
        "l_foot",
        "r_foot",
        "l_foot",
      ],
    },
    entityBaseId,
  );

  // 4. Create Player Prototype
  const playerBaseId = createEntity(
    {
      name: "Player Base",
      description: "A generic adventurer.",
    },
    humanoidBaseId,
  );

  // Add verbs to Player Base

  addVerb(playerBaseId, "look", transpile(extractVerb(verbsPath, "player_look")));

  addVerb(playerBaseId, "inventory", transpile(extractVerb(verbsPath, "player_inventory")));

  addVerb(playerBaseId, "whoami", transpile(extractVerb(verbsPath, "player_whoami")));

  addVerb(
    playerBaseId,
    "dig",
    transpile(
      extractVerb(verbsPath, "player_dig").replace(
        "ENTITY_BASE_ID_PLACEHOLDER",
        String(entityBaseId),
      ),
    ),
  );

  addVerb(
    playerBaseId,
    "create",
    transpile(
      extractVerb(verbsPath, "player_create").replace(
        "ENTITY_BASE_ID_PLACEHOLDER",
        String(entityBaseId),
      ),
    ),
  );

  addVerb(playerBaseId, "set", transpile(extractVerb(verbsPath, "player_set")));

  // 3. Create a Lobby Room
  const lobbyId = createEntity(
    {
      name: "Lobby",
      location: voidId,
      description: "A cozy lobby with a crackling fireplace.",
    },
    entityBaseId,
  );

  // 4. Create a Test Player
  const playerId = createEntity(
    {
      name: "Guest",
      location: lobbyId,
      description: "A confused looking guest.",
    },
    playerBaseId,
  );

  // 5. Create some furniture (Table)
  const tableId = createEntity({
    name: "Oak Table",
    location: lobbyId,
    description: "A sturdy oak table.",
    slots: ["surface", "under"], // Generalizable slots!
  });

  // 6. Create a Cup ON the table
  createEntity({
    name: "Ceramic Cup",
    location: tableId,
    description: "A chipped ceramic cup.",
    location_detail: "surface", // It's ON the table
  });

  // 7. Create a Backpack
  const backpackId = createEntity({
    name: "Leather Backpack",
    location: playerId,
    description: "A worn leather backpack.",
    slots: ["main", "front_pocket"],
    location_detail: "back", // Worn on back
  });

  // 8. Create a Badge ON the Backpack
  createEntity({
    name: "Scout Badge",
    location: backpackId,
    description: "A merit badge.",
    location_detail: "surface", // Attached to the outside? Or maybe we define a slot for it.
  });

  // Create another room
  const gardenId = createEntity({
    name: "Garden",
    description: "A lush garden with blooming flowers.",
  });

  // Link Lobby and Garden
  const northExitId = createEntity({
    name: "north",
    location: lobbyId,
    direction: "north",
    destination: gardenId,
  });
  const lobby = getEntity(lobbyId)!;
  updateEntity({
    ...lobby,
    exits: [northExitId],
  });

  const southExitId = createEntity({
    name: "south",
    location: gardenId,
    direction: "south",
    destination: lobbyId,
  });
  const garden = getEntity(gardenId)!;
  updateEntity({
    ...garden,
    exits: [southExitId],
  });

  // 9. Create a Gemstore
  const gemstoreId = createEntity({
    name: "Gemstore",
    description: "A glittering shop filled with rare stones and oddities.",
  });

  // Link Lobby and Gemstore
  // Link Lobby and Gemstore
  const eastExitId = createEntity({
    name: "east",
    location: lobbyId,
    direction: "east",
    destination: gemstoreId,
  });
  // Note: We need to append to existing exits if any
  // But here we know Lobby only has north so far (actually we just added it above)
  // Let's do a cleaner way: update Lobby with both exits
  const lobbyExits = [northExitId, eastExitId];
  const lobbyUpdated = getEntity(lobbyId)!;
  updateEntity({
    ...lobbyUpdated,
    exits: lobbyExits,
  });

  const westExitId = createEntity({
    name: "west",
    location: gemstoreId,
    direction: "west",
    destination: lobbyId,
  });
  const gemstore = getEntity(gemstoreId)!;
  updateEntity({
    ...gemstore,
    exits: [westExitId],
  });

  // Items in Gemstore
  createEntity({
    name: "Black Obsidian",
    location: gemstoreId,
    description: "A pitch black stone.",
    adjectives: ["color:black", "effect:shiny", "material:stone", "material:obsidian"],
  });

  createEntity({
    name: "Silver Dagger",
    location: gemstoreId,
    description: "A gleaming silver blade.",
    adjectives: ["color:silver", "material:metal", "material:silver"],
  });

  createEntity({
    name: "Gold Coin",
    location: gemstoreId,
    description: "A heavy gold coin.",
    adjectives: ["color:gold", "weight:heavy", "material:metal", "material:gold"],
  });

  createEntity({
    name: "Platinum Ring",
    location: gemstoreId,
    description: "A precious platinum ring.",
    adjectives: ["color:platinum", "value:precious", "material:metal", "material:platinum"],
  });

  createEntity({
    name: "Radioactive Isotope",
    location: gemstoreId,
    description: "It glows with a sickly light.",
    adjectives: ["effect:radioactive", "effect:glowing"],
  });

  createEntity({
    name: "Electric Blue Potion",
    location: gemstoreId,
    description: "A crackling blue liquid.",
    adjectives: ["color:electric blue", "effect:glowing"],
  });

  createEntity({
    name: "Ethereal Mist",
    location: gemstoreId,
    description: "A swirling white mist.",
    adjectives: ["color:white", "effect:ethereal"],
  });

  createEntity({
    name: "Transparent Cube",
    location: gemstoreId,
    description: "You can barely see it.",
    adjectives: ["effect:transparent", "material:glass"],
  });

  const wigStandId = createEntity({
    name: "Wig Stand",
    location: gemstoreId,
    description: "A stand holding various wigs.",
    slots: ["surface"],
  });

  if (wigStandId) {
    createEntity({
      name: "Auburn Wig",
      location: wigStandId,
      description: "A reddish-brown wig.",
      adjectives: ["color:auburn"],
      location_detail: "surface",
    });

    createEntity({
      name: "Blonde Wig",
      location: wigStandId,
      description: "A bright yellow wig.",
      adjectives: ["color:blonde"],
      location_detail: "surface",
    });

    createEntity({
      name: "Brunette Wig",
      location: wigStandId,
      description: "A dark brown wig.",
      adjectives: ["color:brunette"],
      location_detail: "surface",
    });
  }

  // 10. Create Scripting Test Items (Lobby)

  // Watch Item
  const watchId = createEntity({
    name: "Golden Watch",
    location: lobbyId,
    props: {
      description: "A beautiful golden pocket watch.",
      adjectives: ["color:gold", "material:gold"],
    },
  });

  addVerb(watchId, "tell", transpile(extractVerb(verbsPath, "watch_tell")));

  // Teleporter Item
  const teleporterId = createEntity({
    name: "Teleporter Stone",
    location: lobbyId,
    props: {
      description: "A humming stone that vibrates with energy.",
      destination: gardenId,
      adjectives: ["effect:glowing", "material:stone"],
    },
  });

  addVerb(teleporterId, "teleport", transpile(extractVerb(verbsPath, "teleporter_teleport")));

  // Status Item
  const statusId = createEntity({
    name: "Status Orb",
    location: lobbyId,
    props: {
      description: "A crystal orb that shows world statistics.",
      adjectives: ["effect:transparent", "material:crystal"],
    },
  });

  addVerb(
    statusId,
    "check",
    // world.entities missing
    transpile(extractVerb(verbsPath, "status_check")),
  );

  console.log("Seeding complete!");

  // Color Library
  const colorLibId = createEntity({
    name: "Color Library", // Or a system object
    location: voidId, // Hidden
    props: {
      colors: ["red", "green", "blue", "purple", "orange", "yellow", "cyan", "magenta"],
    },
  });

  addVerb(colorLibId, "random_color", transpile(extractVerb(verbsPath, "color_lib_random_color")));

  // Mood Ring
  const moodRingId = createEntity({
    name: "Mood Ring",
    location: lobbyId,
    props: {
      description: "A ring that changes color based on... something.",
      adjectives: ["color:grey", "material:silver"],
      color_lib: colorLibId,
    },
  });

  // Verb to update color
  // It calls random_color on the lib, sets its own color adjective, and schedules itself again.
  addVerb(moodRingId, "update_color", transpile(extractVerb(verbsPath, "mood_ring_update_color")));

  // Kickoff
  // We need a way to start it. Let's add a 'touch' verb to start it.
  addVerb(moodRingId, "touch", transpile(extractVerb(verbsPath, "mood_ring_touch")));

  // --- Advanced Items ---

  // 1. Dynamic Mood Ring (Getter)
  const dynamicRingId = createEntity({
    name: "Dynamic Mood Ring",
    location: lobbyId,
    props: {
      description: "A ring that shimmers with the current second.",
      // No static adjectives needed if we use getter
    },
  });

  // get_adjectives verb
  // Returns a list of adjectives.
  // We'll use the current second to determine color.
  addVerb(
    dynamicRingId,
    "get_adjectives",
    transpile(extractVerb(verbsPath, "dynamic_ring_get_adjectives")),
  );

  // 2. Special Watch (Local Broadcast)
  const specialWatchId = createEntity({
    name: "Broadcasting Watch",
    location: lobbyId,
    props: { description: "A watch that announces the time to you." },
  });

  addVerb(specialWatchId, "tick", transpile(extractVerb(verbsPath, "special_watch_tick")));
  addVerb(specialWatchId, "start", transpile(extractVerb(verbsPath, "special_watch_start")));

  // 3. Clock (Room Broadcast)
  // Watch broadcasts to holder (Player), Clock broadcasts to Room.

  const clockId = createEntity({
    name: "Grandfather Clock",
    location: lobbyId,
    props: { description: "A loud clock." },
  });

  addVerb(clockId, "tick", transpile(extractVerb(verbsPath, "clock_tick")));
  addVerb(clockId, "start", transpile(extractVerb(verbsPath, "clock_start")));

  // 4. Clock Tower (Global Broadcast)
  const towerId = createEntity({
    name: "Clock Tower", // Or ROOM/BUILDING
    location: voidId, // Hidden, or visible somewhere
    props: { description: "The source of time." },
  });

  addVerb(towerId, "toll", transpile(extractVerb(verbsPath, "clock_tower_toll")));
  addVerb(towerId, "start", transpile(extractVerb(verbsPath, "clock_tower_start")));

  // 5. Mailbox
  // A prototype for mailboxes.
  const mailboxProtoId = createEntity({
    name: "Mailbox Prototype",
    props: {
      description: "A secure mailbox.",
      permissions: {
        view: ["owner"], // Only owner can see contents
        enter: [], // No one can manually put things in (must use deposit)
      },
    },
  });

  addVerb(mailboxProtoId, "deposit", transpile(extractVerb(verbsPath, "mailbox_deposit")));

  // Give the player a mailbox
  createEntity(
    {
      name: "My Mailbox",
      location: playerId, // Carried by player
      owner_id: playerId,
    },
    mailboxProtoId,
  );
  // 5. Create Items
  seedItems(voidId);

  // 6. Create Hotel
  seedHotel(lobbyId, voidId, entityBaseId);

  // 7. Director AI
  const directorId = createEntity({
    name: "Director",
    location: voidId,
    description: "The AI Director.",
  });

  // Grant Director capabilities
  createCapability(directorId, "sys.sudo", {});
  createCapability(directorId, "entity.control", { "*": true });

  addVerb(directorId, "tick", transpile(extractVerb(verbsPath, "director_tick")));
  addVerb(directorId, "start", transpile(extractVerb(verbsPath, "director_start")));

  // 8. Combat Manager
  const combatManagerId = createEntity({
    name: "Combat Manager",
    location: voidId,
    description: "Manages combat sessions.",
  });

  createCapability(combatManagerId, "sys.create", {});
  createCapability(combatManagerId, "entity.control", { "*": true });

  addVerb(combatManagerId, "start", transpile(extractVerb(verbsPath, "combat_start")));
  addVerb(combatManagerId, "next_turn", transpile(extractVerb(verbsPath, "combat_next_turn")));
  // Use elemental attack for this manager
  addVerb(combatManagerId, "attack", transpile(extractVerb(verbsPath, "combat_attack_elemental")));

  addVerb(
    combatManagerId,
    "apply_status",
    transpile(extractVerb(verbsPath, "combat_apply_status")),
  );
  addVerb(combatManagerId, "tick_status", transpile(extractVerb(verbsPath, "combat_tick_status")));

  // 9a. Status Effect Prototypes
  const effectBaseId = createEntity({
    name: "Effect Base",
    description: "Base for status effects.",
  });
  addVerb(effectBaseId, "on_apply", transpile(extractVerb(verbsPath, "effect_base_on_apply")));
  addVerb(effectBaseId, "on_tick", transpile(extractVerb(verbsPath, "effect_base_on_tick")));
  addVerb(effectBaseId, "on_remove", transpile(extractVerb(verbsPath, "effect_base_on_remove")));

  const poisonEffectId = createEntity(
    {
      name: "Poison",
      description: "Deals damage over time.",
    },
    effectBaseId,
  );
  addVerb(poisonEffectId, "on_tick", transpile(extractVerb(verbsPath, "poison_on_tick")));

  const regenEffectId = createEntity(
    {
      name: "Regen",
      description: "Heals over time.",
    },
    effectBaseId,
  );
  addVerb(regenEffectId, "on_tick", transpile(extractVerb(verbsPath, "regen_on_tick")));

  // Link Poison to Combat Manager
  const cm = entity(combatManagerId);
  cm["poison_effect"] = poisonEffectId;
  const cmCap = get_capability("entity.control", { target_id: combatManagerId });
  if (cmCap) {
    set_entity(cmCap, cm);
  }

  // 9. Elemental Prototypes
  const fireElementalProtoId = createEntity({
    name: "Fire Elemental Prototype",
    element: "fire",
    elemental_stats: {
      water: { damage_taken: 2.0 },
      fire: { damage_taken: 0.0, attack_scale: 1.5 },
    },
  });

  const waterElementalProtoId = createEntity({
    name: "Water Elemental Prototype",
    element: "water",
    elemental_stats: {
      fire: { damage_taken: 2.0 },
      water: { damage_taken: 0.0, attack_scale: 1.5 },
    },
  });

  // 10. Combat Verification
  createEntity(
    {
      name: "Fire Warrior",
      location: lobbyId,
      props: { hp: 100, attack: 15, defense: 5, speed: 10 },
    },
    fireElementalProtoId,
  );

  createEntity(
    {
      name: "Water Orc",
      location: lobbyId,
      props: { hp: 80, attack: 12, defense: 2, speed: 8 },
    },
    waterElementalProtoId,
  );

  addVerb(combatManagerId, "test", transpile(extractVerb(verbsPath, "combat_test")));

  console.log("Database seeded successfully.");
}
