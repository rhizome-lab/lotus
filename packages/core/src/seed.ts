import { addVerb, createCapability, createEntity, getEntity, updateEntity } from "./repo";
import { db } from "./db";
import { loadEntityDefinition } from "./seeds/loader";
import { resolve } from "node:path";
import { seedChatTree } from "./seeds/chat_tree";
import { seedHotel } from "./seeds/hotel";
import { seedItems } from "./seeds/items";

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
  const entityBaseDef = loadEntityDefinition(
    resolve(__dirname, "seeds/definitions/EntityBase.ts"),
    "EntityBase",
  );
  const entityBaseId = createEntity({
    ...entityBaseDef.props,
    location: voidId,
  });

  for (const [name, code] of entityBaseDef.verbs) {
    addVerb(entityBaseId, name, code);
  }

  // Set Void prototype to EntityBase so it has on_leave/on_enter
  updateEntity({ id: voidId, prototype_id: entityBaseId });

  // 3. Create System Entity
  const systemDef = loadEntityDefinition(
    resolve(__dirname, "seeds/definitions/System.ts"),
    "System",
  );

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

  for (const [name, code] of systemDef.verbs) {
    addVerb(systemId, name, code);
  }

  // 4. Create Discord Bot Entity
  const botDef = loadEntityDefinition(
    resolve(__dirname, "seeds/definitions/System.ts"),
    "DiscordBot",
  );

  const botId = createEntity({
    description: "The bridge to Discord.",
    location: voidId,
    name: "Discord Bot",
  });

  createCapability(botId, "sys.sudo", {});

  for (const [name, code] of botDef.verbs) {
    addVerb(botId, name, code);
  }

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
  const playerDef = loadEntityDefinition(
    resolve(__dirname, "seeds/definitions/Player.ts"),
    "Player",
    {
      ENTITY_BASE_ID_PLACEHOLDER: String(entityBaseId),
    },
  );

  const playerBaseId = createEntity(
    {
      ...playerDef.props,
    },
    humanoidBaseId,
  );

  // Add verbs to Player Base
  for (const [name, code] of playerDef.verbs) {
    addVerb(playerBaseId, name, code);
  }

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
  const watchDef = loadEntityDefinition(resolve(__dirname, "seeds/definitions/Items.ts"), "Watch");
  const watchId = createEntity({
    adjectives: ["color:gold", "material:gold"],
    description: "A beautiful golden pocket watch.",
    location: lobbyId,
    name: "Golden Watch",
  });
  for (const [name, code] of watchDef.verbs) {
    addVerb(watchId, name, code);
  }

  // Teleporter Item
  const teleporterDef = loadEntityDefinition(
    resolve(__dirname, "seeds/definitions/Items.ts"),
    "Teleporter",
  );
  const teleporterId = createEntity({
    adjectives: ["effect:glowing", "material:stone"],
    description: "A humming stone that vibrates with energy.",
    destination: gardenId,
    location: lobbyId,
    name: "Teleporter Stone",
  });
  for (const [name, code] of teleporterDef.verbs) {
    addVerb(teleporterId, name, code);
  }

  // Status Item
  const statusOrbDef = loadEntityDefinition(
    resolve(__dirname, "seeds/definitions/Items.ts"),
    "StatusOrb",
  );
  const statusId = createEntity({
    adjectives: ["effect:transparent", "material:crystal"],
    description: "A crystal orb that shows world statistics.",
    location: lobbyId,
    name: "Status Orb",
  });
  for (const [name, code] of statusOrbDef.verbs) {
    addVerb(statusId, name, code);
  }

  // Color Library
  const colorLibDef = loadEntityDefinition(
    resolve(__dirname, "seeds/definitions/Items.ts"),
    "ColorLibrary",
  );
  const colorLibId = createEntity({
    colors: ["red", "green", "blue", "purple", "orange", "yellow", "cyan", "magenta"],
    location: voidId, // Hidden
    name: "Color Library", // Or a system object
  });
  for (const [name, code] of colorLibDef.verbs) {
    addVerb(colorLibId, name, code);
  }

  // Mood Ring
  const moodRingDef = loadEntityDefinition(
    resolve(__dirname, "seeds/definitions/Items.ts"),
    "MoodRing",
  );
  const moodRingId = createEntity({
    adjectives: ["color:grey", "material:silver"],
    color_lib: colorLibId,
    description: "A ring that changes color based on... something.",
    location: lobbyId,
    name: "Mood Ring",
  });
  for (const [name, code] of moodRingDef.verbs) {
    addVerb(moodRingId, name, code);
  }

  // --- Advanced Items ---

  // 1. Dynamic Mood Ring (Getter)
  const dynRingDef = loadEntityDefinition(
    resolve(__dirname, "seeds/definitions/Items.ts"),
    "DynamicMoodRing",
  );
  const dynamicRingId = createEntity({
    // No static adjectives needed if we use getter
    description: "A ring that shimmers with the current second.",
    location: lobbyId,
    name: "Dynamic Mood Ring",
  });
  for (const [name, code] of dynRingDef.verbs) {
    addVerb(dynamicRingId, name, code);
  }

  // 2. Special Watch (Local Broadcast)
  const broadcastWatchDef = loadEntityDefinition(
    resolve(__dirname, "seeds/definitions/Items.ts"),
    "BroadcastingWatch",
  );
  const specialWatchId = createEntity({
    description: "A watch that announces the time to you.",
    location: lobbyId,
    name: "Broadcasting Watch",
  });
  for (const [name, code] of broadcastWatchDef.verbs) {
    addVerb(specialWatchId, name, code);
  }

  // 3. Clock (Room Broadcast)
  // Watch broadcasts to holder (Player), Clock broadcasts to Room.
  const clockDef = loadEntityDefinition(resolve(__dirname, "seeds/definitions/Items.ts"), "Clock");
  const clockId = createEntity({
    description: "A loud clock.",
    location: lobbyId,
    name: "Grandfather Clock",
  });
  for (const [name, code] of clockDef.verbs) {
    addVerb(clockId, name, code);
  }

  // 4. Clock Tower (Global Broadcast)
  const towerDef = loadEntityDefinition(
    resolve(__dirname, "seeds/definitions/Items.ts"),
    "ClockTower",
  );
  const towerId = createEntity({
    description: "The source of time.",
    location: voidId, // Hidden, or visible somewhere
    name: "Clock Tower", // Or ROOM/BUILDING
  });
  for (const [name, code] of towerDef.verbs) {
    addVerb(towerId, name, code);
  }

  // 5. Mailbox
  // A prototype for mailboxes.
  const mailboxDef = loadEntityDefinition(
    resolve(__dirname, "seeds/definitions/Items.ts"),
    "Mailbox",
  );
  const mailboxProtoId = createEntity({
    description: "A secure mailbox.",
    name: "Mailbox Prototype",
  });
  for (const [name, code] of mailboxDef.verbs) {
    addVerb(mailboxProtoId, name, code);
  }

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
  const directorDef = loadEntityDefinition(
    resolve(__dirname, "seeds/definitions/Items.ts"),
    "Director",
  );
  const directorId = createEntity({
    description: "The AI Director.",
    location: voidId,
    name: "Director",
  });

  // Grant Director capabilities
  createCapability(directorId, "sys.sudo", {});
  createCapability(directorId, "entity.control", { "*": true });

  for (const [name, code] of directorDef.verbs) {
    addVerb(directorId, name, code);
  }

  // 8. Combat Manager
  const cmDef = loadEntityDefinition(
    resolve(__dirname, "seeds/definitions/Items.ts"),
    "CombatManager",
  );
  const combatManagerId = createEntity({
    description: "Manages combat sessions.",
    location: voidId,
    name: "Combat Manager",
  });

  createCapability(combatManagerId, "sys.create", {});
  createCapability(combatManagerId, "entity.control", { "*": true });

  for (const [name, code] of cmDef.verbs) {
    addVerb(combatManagerId, name, code);
  }

  // 9a. Status Effect Prototypes
  const effectBaseDef = loadEntityDefinition(
    resolve(__dirname, "seeds/definitions/Items.ts"),
    "EffectBase",
  );
  const effectBaseId = createEntity({
    description: "Base for status effects.",
    name: "Effect Base",
  });
  for (const [name, code] of effectBaseDef.verbs) {
    addVerb(effectBaseId, name, code);
  }

  const poisonDef = loadEntityDefinition(
    resolve(__dirname, "seeds/definitions/Items.ts"),
    "Poison",
  );
  const poisonEffectId = createEntity(
    {
      description: "Deals damage over time.",
      name: "Poison",
    },
    effectBaseId,
  );
  for (const [name, code] of poisonDef.verbs) {
    addVerb(poisonEffectId, name, code);
  }

  const regenDef = loadEntityDefinition(resolve(__dirname, "seeds/definitions/Items.ts"), "Regen");
  const regenEffectId = createEntity(
    {
      description: "Heals over time.",
      name: "Regen",
    },
    effectBaseId,
  );
  for (const [name, code] of regenDef.verbs) {
    addVerb(regenEffectId, name, code);
  }

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

  // Note: CombatManager basic_attack, test, etc are methods now.
  // Already attached above.

  // 10a. Create Golem
  const golemDef = loadEntityDefinition(resolve(__dirname, "seeds/definitions/Golem.ts"), "Golem");
  const golemId = createEntity({
    description: "A large stone construct.",
    location: lobbyId,
    name: "Golem",
  });
  for (const [name, code] of golemDef.verbs) {
    addVerb(golemId, name, code);
  }

  // 11. Quest Engine Seeds
  const questBaseDef = loadEntityDefinition(
    resolve(__dirname, "seeds/definitions/Quest.ts"),
    "QuestBase",
  );
  const questBaseId = createEntity({
    description: "A base definition for quests.",
    name: "Quest Base",
  });
  for (const [name, code] of questBaseDef.verbs) {
    addVerb(questBaseId, name, code);
  }

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

  // 13. Chat Tree Seed
  seedChatTree(voidId, playerId);

  if (process.env.NODE_ENV !== "test") {
    console.log("Seeding complete!");
  }
}
