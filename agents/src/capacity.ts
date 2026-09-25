import { cpus, totalmem, freemem } from "node:os";

/**
 * How many agents this machine can actually carry.
 *
 * Two ceilings matter, and they are not the same number:
 *
 *   machine ceiling — how many session agents fit in RAM and cores. Only
 *                     session agents cost anything real; a session that drives
 *                     a browser is the expensive object. Drafters, schedulers
 *                     and approvers are close to free.
 *
 *   account ceiling — how many posts the accounts can safely carry per day.
 *                     This is almost always the binding one, and adding
 *                     machines does not move it. Adding accounts does.
 *
 * The per-agent costs below are starting estimates. `measure()` reports what
 * the machine actually has so they can be calibrated against a real run.
 */
export const COST = {
  /** A session agent holding a real browser profile. */
  sessionRamMb: 400,
  sessionCores: 0.25,
  /** Control-plane agents: drafter, scheduler, approver. */
  controlRamMb: 40,
  controlCores: 0.02,
  /** Headroom left for the OS and everything else. */
  reservedRamMb: 2048,
} as const;

export interface Capacity {
  cores: number;
  totalRamMb: number;
  freeRamMb: number;
  /** Session agents this machine can hold, by RAM and by CPU. */
  sessionsByRam: number;
  sessionsByCpu: number;
  maxSessionAgents: number;
  /** Control agents on top, if this node also runs the control plane. */
  maxControlAgents: number;
}

export function measure(): Capacity {
  const cores = cpus().length;
  const totalRamMb = Math.round(totalmem() / 1024 / 1024);
  const freeRamMb = Math.round(freemem() / 1024 / 1024);

  const usableRamMb = Math.max(totalRamMb - COST.reservedRamMb, 0);
  const sessionsByRam = Math.floor(usableRamMb / COST.sessionRamMb);
  const sessionsByCpu = Math.floor(cores / COST.sessionCores);

  return {
    cores,
    totalRamMb,
    freeRamMb,
    sessionsByRam,
    sessionsByCpu,
    maxSessionAgents: Math.max(Math.min(sessionsByRam, sessionsByCpu), 0),
    maxControlAgents: Math.floor(usableRamMb / COST.controlRamMb),
  };
}

/**
 * The ceiling that actually decides throughput: accounts, not machines.
 * One account can only post so often before it looks like what it is.
 */
export function accountCeiling(accounts: { maxPostsPerDay: number }[]): {
  accounts: number;
  postsPerDay: number;
  surfacesServed: number;
} {
  const postsPerDay = accounts.reduce((sum, account) => sum + account.maxPostsPerDay, 0);
  return {
    accounts: accounts.length,
    postsPerDay,
    // A surface posted to twice a week consumes 2/7 of a post-day.
    surfacesServed: Math.floor(postsPerDay / (2 / 7)),
  };
}

export function report(accounts: { maxPostsPerDay: number }[]): string {
  const machine = measure();
  const ceiling = accountCeiling(accounts);

  return [
    `Machine: ${machine.cores} cores, ${machine.totalRamMb}MB RAM (${machine.freeRamMb}MB free)`,
    `  session agents: ${machine.maxSessionAgents}  (RAM allows ${machine.sessionsByRam}, CPU allows ${machine.sessionsByCpu})`,
    `  control agents: ${machine.maxControlAgents} (cheap — never the constraint)`,
    ``,
    `Accounts: ${ceiling.accounts}, ${ceiling.postsPerDay} posts/day combined`,
    `  surfaces servable at 2 posts/week: ~${ceiling.surfacesServed}`,
    ``,
    machine.maxSessionAgents < ceiling.accounts
      ? `Binding constraint: this machine (${machine.maxSessionAgents} sessions < ${ceiling.accounts} accounts). Add a node.`
      : `Binding constraint: accounts (${ceiling.postsPerDay} posts/day). More machines will not help; more accounts will.`,
  ].join("\n");
}
