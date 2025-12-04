import { db } from "./db";
import { getEntity, getVerb } from "./repo";
import { evaluate, createScriptContext } from "@viwo/scripting";

/**
 * Manages scheduled tasks (delayed verb executions).
 * Tasks are persisted in the database until execution.
 */
export class TaskScheduler {
  constructor() {}

  /**
   * Schedules a verb to be executed on an entity after a delay.
   *
   * @param entityId - The ID of the entity to execute the verb on.
   * @param verb - The name of the verb.
   * @param args - Arguments to pass to the verb.
   * @param delayMs - Delay in milliseconds.
   */
  schedule(
    entityId: number,
    verb: string,
    args: readonly unknown[],
    delayMs: number,
  ) {
    const executeAt = Date.now() + delayMs;
    db.query(
      "INSERT INTO scheduled_tasks (entity_id, verb, args, execute_at) VALUES (?, ?, ?, ?)",
    ).run(entityId, verb, JSON.stringify(args), executeAt);
  }

  private sendFactory: (
    entityId: number,
  ) => (type: string, payload: unknown) => void = () => () => {};
  /**
   * Sets the factory function for creating the 'send' function used in scheduled tasks.
   * This allows the scheduler to send messages to clients even when triggered asynchronously.
   *
   * @param factory - A function that returns a send function for a given entity ID.
   */
  setSendFactory(
    factory: (entityId: number) => (type: string, payload: unknown) => void,
  ) {
    this.sendFactory = factory;
  }

  private intervalId: Timer | null = null;

  /**
   * Starts the scheduler loop.
   *
   * @param intervalMs - The interval in milliseconds to check for due tasks.
   */
  start(intervalMs: number = 1000) {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.process(), intervalMs);
    console.log(`[Scheduler] Started with interval ${intervalMs}ms`);
  }

  /**
   * Stops the scheduler loop.
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[Scheduler] Stopped");
    }
  }

  /**
   * Processes all due tasks.
   * Should be called periodically (e.g., every tick).
   */
  async process() {
    const now = Date.now();
    const tasks = db
      .query("SELECT * FROM scheduled_tasks WHERE execute_at <= ?")
      .all(now) as any[];

    if (tasks.length === 0) return;

    // Delete tasks immediately
    const ids = tasks.map((t) => t.id);
    db.query(
      `DELETE FROM scheduled_tasks WHERE id IN (${ids.join(",")})`,
    ).run();

    if (!this.sendFactory) {
      throw new Error("[Scheduler] No send factory set.");
    }

    for (const task of tasks) {
      // Create a send function specific to this entity

      try {
        const entity = getEntity(task.entity_id);
        const verb = getVerb(task.entity_id, task.verb);
        const args = JSON.parse(task.args);

        const send = this.sendFactory(task.entity_id);

        if (entity && verb) {
          await evaluate(
            verb.code,
            createScriptContext({
              caller: entity, // System is caller? Or self?
              this: entity,
              args,
              send,
            }),
          );
        }
      } catch (e) {
        console.error(`[Scheduler] Error executing task ${task.id}:`, e);
      }
    }
  }
}

export const scheduler = new TaskScheduler();
