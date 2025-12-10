import { db, getEntity, seed, getVerb, scheduler, PluginManager } from "../packages/core/src/index";
// @ts-expect-error - Internal access
import { GameOpcodes } from "../packages/core/src/runtime/opcodes";
// We need to import libs to use 'call/send' or use the public API.
// Actually, using the public API is better if possible, but 'call' is internal op.
// Let's use `evaluate` or similar if accessible, otherwise we might need to rely on `db` and some helper.

// Actually, let's just use the server's main loop or scheduler?
// Writing a true "integration test" script against a running server is hard from a script if we don't have client lib.
// We can use the core's internal methods since we are in the monorepo.

import { evaluate, createScriptContext } from "../packages/scripting/src/index";

// Hack: we need to setup the environment.
const pluginManager = new PluginManager();
// Load minimal plugins needed?
// Core is already there.

async function main() {
  console.log("Setting up Hotel Stage 1 Test...");

  // 1. Reset DB (InMemory for test)
  // db.query('DELETE FROM entities').run(); // Or use a fresh db instance if possible.
  // seed() checks if DB is empty.

  // We can't easily reset the singleton DB.
  // Assuming this script runs in a separate process, it will use a fresh DB if configured to use in-memory.
  process.env.DB_PATH = ":memory:";

  seed();

  // 2. Find Hotel Manager
  const manager = db
    .query("SELECT * FROM entities WHERE json_extract(props, '$.name') = 'Hotel Manager'")
    .get() as any;
  if (!manager) {
    console.error("FAIL: Hotel Manager not found!");
    process.exit(1);
  }
  console.log("PASS: Hotel Manager found (ID:", manager.id, ")");
  const managerEntity = getEntity(manager.id)!;

  // 3. Start Cleanup Loop
  // We need to execute the 'start' verb.
  // Using `call` directly might be hard if we don't have a valid context.
  // We can manually `schedule` it or just invoke the function if we had access.
  // Let's try to simulate a 'start' call.

  // But wait, the verbs are compiled in the DB now.
  // We can use `SysSudo` if we have it, or `EntityControl`.
  // Let's try to simulate a 'start' call.

  // Or just invoke `manager_cleanup_loop` verb directly via `db` + evaluate.
  const startVerb = getVerb(manager.id, "start");
  if (!startVerb) throw new Error("Start verb missing");

  // Evaluate needs a context.
  const ctx = createScriptContext({
    args: [],
    caller: managerEntity,
    ops: GameOpcodes, // We need ops!
    this: managerEntity,
  });

  evaluate(startVerb.code, ctx);
  console.log("Triggered 'start' verb.");

  // 4. Create a Room manually
  console.log("Creating room...");
  const createRoomVerb = getVerb(manager.id, "create_room");
  const roomId = evaluate(createRoomVerb!.code, ctx);

  if (!roomId || typeof roomId !== "number") {
    console.error("FAIL: create_room returned invalid ID:", roomId);
    // process.exit(1); // Don't exit yet, check err
  }
  console.log("PASS: Room created (ID:", roomId, ")");

  // Verify room exists
  let room = getEntity(roomId);
  if (!room) {
    console.error("FAIL: Room entity not found in DB.");
    process.exit(1);
  }

  // 5. Wait for Cleanup
  console.log("Waiting 12s for cleanup...");

  // We need to tick the scheduler!
  // The scheduler runs in the background if we start it, but our script might exit?
  // We need to keep the event loop alive.
  // And we need to make sure `scheduler.start()` was called or we call it.

  scheduler.start(100); // 100ms tick

  await new Promise((resolve) => setTimeout(resolve, 12_000));

  // 6. Check if room destroyed
  room = getEntity(roomId);
  if (room) {
    console.error("FAIL: Room was NOT destroyed after timeout.");
    // Debug: check manager state
    const updatedManager = getEntity(manager.id);
    console.log("Manager State:", updatedManager);
    console.log("Room contents:", room.contents);
    process.exit(1);
  } else {
    console.log("PASS: Room destroyed.");
  }

  console.log("Stage 1 Verification Complete.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
