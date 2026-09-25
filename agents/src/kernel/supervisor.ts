/**
 * Runs agents on a cadence, keeps them alive, and enforces a concurrency
 * ceiling so one node cannot start more work than it can carry.
 */
export interface SupervisedTask {
  name: string;
  everyMs: number;
  /** Random spread so tasks never fire in lockstep. */
  jitterMs?: number;
  run(): Promise<void>;
}

export class Supervisor {
  private timers: NodeJS.Timeout[] = [];
  private running = new Set<string>();
  private failures = new Map<string, number>();

  constructor(private readonly maxConcurrent: number) {}

  get active(): number {
    return this.running.size;
  }

  start(task: SupervisedTask): void {
    const tick = async () => {
      if (this.running.size >= this.maxConcurrent) {
        // Shed rather than queue: the next tick will pick it up.
        return;
      }
      if (this.running.has(task.name)) return;

      this.running.add(task.name);
      try {
        await task.run();
        this.failures.set(task.name, 0);
      } catch (error) {
        const count = (this.failures.get(task.name) ?? 0) + 1;
        this.failures.set(task.name, count);
        console.error(`[${task.name}] failed (${count}):`, (error as Error).message);
      } finally {
        this.running.delete(task.name);
      }
    };

    const interval = task.everyMs + Math.floor(Math.random() * (task.jitterMs ?? 0));
    this.timers.push(setInterval(tick, interval));
    void tick();
  }

  /** Consecutive failures per task — a node's health in one number each. */
  health(): Record<string, number> {
    return Object.fromEntries(this.failures);
  }

  stop(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
  }
}
