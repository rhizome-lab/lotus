import { resolve } from "node:path";
import { transpile } from "@viwo/scripting";
import { addVerb, createCapability, createEntity, getEntity, updateEntity } from "./repo";
import { db } from "./db";
import { extractVerb } from "./verb_loader";
import { seedHotel } from "./seeds/hotel/seed";
import { seedItems } from "./seeds/items";

const verbsPath = resolve(__dirname, "seeds/verbs.ts");

export function seed() {
  // Check for any row at all.
  const root = db.query("SELECT id FROM entities").get();
  if (root !== null) {
    console.log("Database already seeded.");
    return;
  }

  if (process.env.NODE_ENV !== "test") {
    console.log("Seeding database...");
  }

  // 1. Create The Void (Root Zone)
  const voidId = createEntity({
    description: "An endless expanse of nothingness.",
    name: "The Void",
  });

  // 2. Create Entity Base
  const entityBaseId = createEntity({
    description: "The base of all things.",
    location: voidId,
    name: "Entity Base",
  });

  // 3. Create System Entity
  const systemId = createEntity({
    description: "The system root object.",
    location: voidId,
    name: "System",
  });

  // Grant System capabilities
  createCapability(systemId, "sys.mint", { namespace: "*" });
  createCapability(systemId, "sys.create", {});
  createCapability(systemId, "sys.sudo", {});
  createCapability(systemId, "entity.control", { "*": true });

  // 4. Create Discord Bot Entity
  const botId = createEntity({
    description: "The bridge to Discord.",
    location: voidId,
    name: "Discord Bot",
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
      body_type: "humanoid",
      description: "A humanoid creature.",
      name: "Humanoid Base",
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
      description: "A generic adventurer.",
      name: "Player Base",
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

  // Quest Verbs
  addVerb(playerBaseId, "quest_start", transpile(extractVerb(verbsPath, "player_quest_start")));
  addVerb(playerBaseId, "quest_update", transpile(extractVerb(verbsPath, "player_quest_update")));
  addVerb(playerBaseId, "quest_log", transpile(extractVerb(verbsPath, "player_quest_log")));

  // 3. Create a Lobby Room
  const lobbyId = createEntity(
    {
      description: "A cozy lobby with a crackling fireplace.",
      location: voidId,
      name: "Lobby",
    },
    entityBaseId,
  );

  // 4. Create a Test Player
  const playerId = createEntity(
    {
      description: "A confused looking guest.",
      location: lobbyId,
      name: "Guest",
    },
    playerBaseId,
  );

  // 5. Create some furniture (Table)
  const tableId = createEntity({
    description: "A sturdy oak table.",
    location: lobbyId,
    name: "Oak Table",
    slots: ["surface", "under"], // Generalizable slots!
  });

  // 6. Create a Cup ON the table
  createEntity({
    description: "A chipped ceramic cup.",
    location: tableId,
    location_detail: "surface",
    name: "Ceramic Cup", // It's ON the table
  });

  // 7. Create a Backpack
  const backpackId = createEntity({
    description: "A worn leather backpack.",
    location: playerId,
    location_detail: "back",
    name: "Leather Backpack",
    slots: ["main", "front_pocket"], // Worn on back
  });

  // 8. Create a Badge ON the Backpack
  createEntity({
    description: "A merit badge.",
    location: backpackId,
    location_detail: "surface",
    name: "Scout Badge", // Attached to the outside? Or maybe we define a slot for it.
  });

  // Create another room
  const gardenId = createEntity({
    description: "A lush garden with blooming flowers.",
    name: "Garden",
  });

  // Link Lobby and Garden
  const northExitId = createEntity({
    destination: gardenId,
    direction: "north",
    location: lobbyId,
    name: "north",
  });
  const lobby = getEntity(lobbyId)!;
  updateEntity({
    ...lobby,
    exits: [northExitId],
  });

  const southExitId = createEntity({
    destination: lobbyId,
    direction: "south",
    location: gardenId,
    name: "south",
  });
  const garden = getEntity(gardenId)!;
  updateEntity({
    ...garden,
    exits: [southExitId],
  });

  // 9. Create a Gemstore
  const gemstoreId = createEntity({
    description: "A glittering shop filled with rare stones and oddities.",
    name: "Gemstore",
  });

  // Link Lobby and Gemstore
  // Link Lobby and Gemstore
  const eastExitId = createEntity({
    destination: gemstoreId,
    direction: "east",
    location: lobbyId,
    name: "east",
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
    destination: lobbyId,
    direction: "west",
    location: gemstoreId,
    name: "west",
  });
  const gemstore = getEntity(gemstoreId)!;
  updateEntity({
    ...gemstore,
    exits: [westExitId],
  });

  // Items in Gemstore
  createEntity({
    adjectives: ["color:black", "effect:shiny", "material:stone", "material:obsidian"],
    description: "A pitch black stone.",
    location: gemstoreId,
    name: "Black Obsidian",
  });

  createEntity({
    adjectives: ["color:silver", "material:metal", "material:silver"],
    description: "A gleaming silver blade.",
    location: gemstoreId,
    name: "Silver Dagger",
  });

  createEntity({
    adjectives: ["color:gold", "weight:heavy", "material:metal", "material:gold"],
    description: "A heavy gold coin.",
    location: gemstoreId,
    name: "Gold Coin",
  });

  createEntity({
    adjectives: ["color:platinum", "value:precious", "material:metal", "material:platinum"],
    description: "A precious platinum ring.",
    location: gemstoreId,
    name: "Platinum Ring",
  });

  createEntity({
    adjectives: ["effect:radioactive", "effect:glowing"],
    description: "It glows with a sickly light.",
    location: gemstoreId,
    name: "Radioactive Isotope",
  });

  createEntity({
    adjectives: ["color:electric blue", "effect:glowing"],
    description: "A crackling blue liquid.",
    location: gemstoreId,
    name: "Electric Blue Potion",
  });

  createEntity({
    adjectives: ["color:white", "effect:ethereal"],
    description: "A swirling white mist.",
    location: gemstoreId,
    name: "Ethereal Mist",
  });

  createEntity({
    adjectives: ["effect:transparent", "material:glass"],
    description: "You can barely see it.",
    location: gemstoreId,
    name: "Transparent Cube",
  });

  const wigStandId = createEntity({
    description: "A stand holding various wigs.",
    location: gemstoreId,
    name: "Wig Stand",
    slots: ["surface"],
  });

  if (wigStandId) {
    createEntity({
      adjectives: ["color:auburn"],
      description: "A reddish-brown wig.",
      location: wigStandId,
      location_detail: "surface",
      name: "Auburn Wig",
    });

    createEntity({
      adjectives: ["color:blonde"],
      description: "A bright yellow wig.",
      location: wigStandId,
      location_detail: "surface",
      name: "Blonde Wig",
    });

    createEntity({
      adjectives: ["color:brunette"],
      description: "A dark brown wig.",
      location: wigStandId,
      location_detail: "surface",
      name: "Brunette Wig",
    });
  }

  // 10. Create Scripting Test Items (Lobby)

  // Watch Item
  const watchId = createEntity({
    adjectives: ["color:gold", "material:gold"],
    description: "A beautiful golden pocket watch.",
    location: lobbyId,
    name: "Golden Watch",
  });

  addVerb(watchId, "tell", transpile(extractVerb(verbsPath, "watch_tell")));

  // Teleporter Item
  const teleporterId = createEntity({
    adjectives: ["effect:glowing", "material:stone"],
    description: "A humming stone that vibrates with energy.",
    destination: gardenId,
    location: lobbyId,
    name: "Teleporter Stone",
  });

  addVerb(teleporterId, "teleport", transpile(extractVerb(verbsPath, "teleporter_teleport")));

  // Status Item
  const statusId = createEntity({
    adjectives: ["effect:transparent", "material:crystal"],
    description: "A crystal orb that shows world statistics.",
    location: lobbyId,
    name: "Status Orb",
  });

  addVerb(
    statusId,
    "check",
    // world.entities missing
    transpile(extractVerb(verbsPath, "status_check")),
  );

  // Color Library
  const colorLibId = createEntity({
    colors: ["red", "green", "blue", "purple", "orange", "yellow", "cyan", "magenta"],
    location: voidId, // Hidden
    name: "Color Library", // Or a system object
  });

  addVerb(colorLibId, "random_color", transpile(extractVerb(verbsPath, "color_lib_random_color")));

  // Mood Ring
  const moodRingId = createEntity({
    adjectives: ["color:grey", "material:silver"],
    color_lib: colorLibId,
    description: "A ring that changes color based on... something.",
    location: lobbyId,
    name: "Mood Ring",
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
    // No static adjectives needed if we use getter
    description: "A ring that shimmers with the current second.",
    location: lobbyId,
    name: "Dynamic Mood Ring",
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
    description: "A watch that announces the time to you.",
    location: lobbyId,
    name: "Broadcasting Watch",
  });

  addVerb(specialWatchId, "tick", transpile(extractVerb(verbsPath, "special_watch_tick")));
  addVerb(specialWatchId, "start", transpile(extractVerb(verbsPath, "special_watch_start")));

  // 3. Clock (Room Broadcast)
  // Watch broadcasts to holder (Player), Clock broadcasts to Room.

  const clockId = createEntity({
    description: "A loud clock.",
    location: lobbyId,
    name: "Grandfather Clock",
  });

  addVerb(clockId, "tick", transpile(extractVerb(verbsPath, "clock_tick")));
  addVerb(clockId, "start", transpile(extractVerb(verbsPath, "clock_start")));

  // 4. Clock Tower (Global Broadcast)
  const towerId = createEntity({
    description: "The source of time.",
    location: voidId, // Hidden, or visible somewhere
    name: "Clock Tower", // Or ROOM/BUILDING
  });

  addVerb(towerId, "toll", transpile(extractVerb(verbsPath, "clock_tower_toll")));
  addVerb(towerId, "start", transpile(extractVerb(verbsPath, "clock_tower_start")));

  // 5. Mailbox
  // A prototype for mailboxes.
  const mailboxProtoId = createEntity({
    description: "A secure mailbox.",
    name: "Mailbox Prototype",
  });

  addVerb(mailboxProtoId, "deposit", transpile(extractVerb(verbsPath, "mailbox_deposit")));

  // Give the player a mailbox
  createEntity(
    {
      location: playerId, // Carried by player
      name: "My Mailbox",
      owner_id: playerId,
    },
    mailboxProtoId,
  );
  // 5. Create Items
  seedItems(voidId);

  // 7. Director AI
  const directorId = createEntity({
    description: "The AI Director.",
    location: voidId,
    name: "Director",
  });

  // Grant Director capabilities
  createCapability(directorId, "sys.sudo", {});
  createCapability(directorId, "entity.control", { "*": true });

  addVerb(directorId, "tick", transpile(extractVerb(verbsPath, "director_tick")));
  addVerb(directorId, "start", transpile(extractVerb(verbsPath, "director_start")));

  // 8. Combat Manager
  const combatManagerId = createEntity({
    description: "Manages combat sessions.",
    location: voidId,
    name: "Combat Manager",
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
    description: "Base for status effects.",
    name: "Effect Base",
  });
  addVerb(effectBaseId, "on_apply", transpile(extractVerb(verbsPath, "effect_base_on_apply")));
  addVerb(effectBaseId, "on_tick", transpile(extractVerb(verbsPath, "effect_base_on_tick")));
  addVerb(effectBaseId, "on_remove", transpile(extractVerb(verbsPath, "effect_base_on_remove")));

  const poisonEffectId = createEntity(
    {
      description: "Deals damage over time.",
      name: "Poison",
    },
    effectBaseId,
  );
  addVerb(poisonEffectId, "on_tick", transpile(extractVerb(verbsPath, "poison_on_tick")));

  const regenEffectId = createEntity(
    {
      description: "Heals over time.",
      name: "Regen",
    },
    effectBaseId,
  );
  addVerb(regenEffectId, "on_tick", transpile(extractVerb(verbsPath, "regen_on_tick")));

  // Link Poison to Combat Manager
  const cm = getEntity(combatManagerId);
  if (cm) {
    updateEntity({ ...cm, poison_effect: poisonEffectId });
  }

  // 9. Elemental Prototypes
  const fireElementalProtoId = createEntity({
    element: "fire",
    elemental_stats: {
      fire: { attack_scale: 1.5, damage_taken: 0 },
      water: { damage_taken: 2 },
    },
    name: "Fire Elemental Prototype",
  });

  const waterElementalProtoId = createEntity({
    element: "water",
    elemental_stats: {
      fire: { damage_taken: 2 },
      water: { attack_scale: 1.5, damage_taken: 0 },
    },
    name: "Water Elemental Prototype",
  });

  // 10. Combat Verification
  createEntity(
    {
      attack: 15,
      defense: 5,
      hp: 100,
      location: lobbyId,
      name: "Fire Warrior",
      speed: 10,
    },
    fireElementalProtoId,
  );

  createEntity(
    {
      attack: 12,
      defense: 2,
      hp: 80,
      location: lobbyId,
      name: "Water Orc",
      speed: 8,
    },
    waterElementalProtoId,
  );

  // Use basic attack for testing
  addVerb(combatManagerId, "basic_attack", transpile(extractVerb(verbsPath, "combat_attack")));

  addVerb(combatManagerId, "test", transpile(extractVerb(verbsPath, "combat_test")));
  addVerb(directorId, "test_quest", transpile(extractVerb(verbsPath, "quest_test")));

  // 10a. Create Golem
  const golemId = createEntity({
    description: "A large stone construct.",
    location: lobbyId,
    name: "Golem",
  });
  addVerb(golemId, "on_hear", transpile(extractVerb(verbsPath, "golem_on_hear")));

  // 11. Quest Engine Seeds
  const questBaseId = createEntity({
    description: "A base definition for quests.",
    name: "Quest Base",
  });

  addVerb(questBaseId, "get_structure", transpile(extractVerb(verbsPath, "quest_get_structure")));
  addVerb(questBaseId, "get_node", transpile(extractVerb(verbsPath, "quest_get_node")));

  createEntity(
    {
      description: "Get ready for the big party!",
      name: "Party Preparation",
      nodes_map: {
        gather_supplies: {
          children: ["get_chips", "get_drinks"],
          description: "Gather Supplies",
          id: "gather_supplies",
          parent_id: "party_prep",
          type: "parallel_all",
        },
        get_chips: {
          description: "Get Chips",
          id: "get_chips",
          parent_id: "gather_supplies",
          type: "leaf",
        },
        get_drinks: {
          description: "Get Drinks",
          id: "get_drinks",
          parent_id: "gather_supplies",
          type: "leaf",
        },
        invite_friends: {
          description: "Invite Friends",
          id: "invite_friends",
          parent_id: "party_prep",
          type: "leaf",
        },
        party_prep: {
          children: ["gather_supplies", "invite_friends"],
          description: "Prepare for the party.",
          id: "party_prep",
          type: "sequence",
        },
      },
      structure: {
        children: ["gather_supplies", "invite_friends"],
        description: "Prepare for the party.",
        id: "party_prep",
        type: "sequence",
      },
    },
    questBaseId,
  );

  // 12. Hotel Seed (Stage 1)
  // 12. Hotel Seed (Stage 1)
  seedHotel(voidId, lobbyId);

  if (process.env.NODE_ENV !== "test") {
    console.log("Seeding complete!");
  }
}
