import { createEntity } from "./repo";
import { db } from "./db";

export function seed() {
  const root = db
    .query("SELECT id FROM entities WHERE slug = 'sys:root'")
    .get();
  if (root) {
    console.log("Database already seeded.");
    return;
  }

  console.log("Seeding database...");

  // 1. Create The Void (Root Zone)
  const voidId = createEntity({
    name: "The Void",
    slug: "sys:root",
    kind: "ZONE",
    props: {
      description: "An endless expanse of nothingness.",
    },
  });

  // 2. Create Player Prototype
  const playerBaseId = createEntity({
    name: "Player Base",
    slug: "sys:player_base",
    kind: "ACTOR",
    props: {
      description: "A generic adventurer.",
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
      ],
    },
  });

  // 3. Create a Lobby Room
  const lobbyId = createEntity({
    name: "Lobby",
    slug: "area:lobby",
    kind: "ROOM",
    location_id: voidId,
    props: {
      description: "A cozy lobby with a crackling fireplace.",
    },
  });

  // 4. Create a Test Player
  const playerId = createEntity({
    name: "Guest",
    kind: "ACTOR",
    location_id: lobbyId,
    prototype_id: playerBaseId,
    props: {
      description: "A confused looking guest.",
    },
  });

  // 5. Create some furniture (Table)
  const tableId = createEntity({
    name: "Oak Table",
    kind: "ITEM",
    location_id: lobbyId,
    props: {
      description: "A sturdy oak table.",
      slots: ["surface", "under"], // Generalizable slots!
    },
  });

  // 6. Create a Cup ON the table
  createEntity({
    name: "Ceramic Cup",
    kind: "ITEM",
    location_id: tableId,
    location_detail: "surface", // It's ON the table
    props: {
      description: "A chipped ceramic cup.",
    },
  });

  // 7. Create a Backpack
  const backpackId = createEntity({
    name: "Leather Backpack",
    kind: "ITEM",
    location_id: playerId,
    location_detail: "back", // Worn on back
    props: {
      description: "A worn leather backpack.",
      slots: ["main", "front_pocket"],
    },
  });

  // 8. Create a Badge ON the Backpack
  createEntity({
    name: "Scout Badge",
    kind: "ITEM",
    location_id: backpackId,
    location_detail: "surface", // Attached to the outside? Or maybe we define a slot for it.
    props: {
      description: "A merit badge.",
    },
  });

  // Create another room
  const gardenId = createEntity({
    name: "Garden",
    kind: "ROOM",
    props: { description: "A lush garden with blooming flowers." },
  });

  // Link Lobby and Garden
  createEntity({
    name: "north",
    kind: "EXIT",
    location_id: lobbyId,
    props: { direction: "north", destination_id: gardenId },
  });

  createEntity({
    name: "south",
    kind: "EXIT",
    location_id: gardenId,
    props: { direction: "south", destination_id: lobbyId },
  });

  console.log("Seeding complete!");
}
