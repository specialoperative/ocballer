import { sessionAgent } from "../agents/session.js";
import { poster } from "../agents/poster.js";
import { redeem, type Grant } from "../kernel/grants.js";
import { Supervisor } from "../kernel/supervisor.js";
import { measure } from "../capacity.js";
import type { System } from "../config.js";

/**
 * An edge node — the machine that holds accounts. Your second computer is one.
 *
 * It pulls work from control, redeems the grant for exactly one body, and hands
 * that to the poster. It never receives the queue, and credentials never leave
 * the box: the session driver is local.
 */
export async function startEdge(
  system: System,
  options: {
    nodeId: string;
    controlUrl: string;
    driverUrl?: string;
    dryRun: boolean;
    pollSeconds: number;
  },
) {
  const mine = system.accounts.filter((account) => account.nodeId === options.nodeId);
  const machine = measure();

  console.log(
    `edge node "${options.nodeId}" — ${mine.length} account(s), ` +
      `machine holds ${machine.maxSessionAgents} session agents` +
      (options.dryRun ? " [DRY RUN]" : ""),
  );

  if (mine.length > machine.maxSessionAgents) {
    console.warn(
      `WARNING: ${mine.length} accounts assigned but only ${machine.maxSessionAgents} sessions fit here. ` +
        `Move some to another node.`,
    );
  }

  const sessions = new Map<string, string>();
  for (const account of mine) {
    const handle = await sessionAgent.run({ account, driverUrl: options.driverUrl });
    sessions.set(account.id, handle.driverUrl);
    console.log(`  session[${account.id}] ${handle.healthy ? "ok" : "DEGRADED"} — ${handle.detail}`);
  }

  const supervisor = new Supervisor(Math.max(machine.maxSessionAgents, 1));

  supervisor.start({
    name: "claim-and-post",
    everyMs: options.pollSeconds * 1000,
    jitterMs: 5_000,
    async run() {
      const response = await fetch(`${options.controlUrl}/work`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nodeId: options.nodeId,
          label: options.nodeId,
          agents: sessions.size,
          capacity: machine.maxSessionAgents,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`control returned ${response.status}`);

      const { work } = (await response.json()) as { work: { grant: Grant } | null };
      if (!work) return;

      // Redeemed here, on the node, once.
      const payload = redeem(work.grant);
      if (!payload.ok) {
        await send(options.controlUrl, work.grant.postId, false, undefined, payload.error, options.nodeId);
        return;
      }

      const accountId = system.surfaces.find((s) => s.id === work.grant.surfaceId)?.accountId ?? "";
      const outcome = await poster.run({
        grant: work.grant,
        body: payload.body,
        mediaUrl: payload.mediaUrl,
        driverUrl: sessions.get(accountId) ?? options.driverUrl ?? "",
        dryRun: options.dryRun,
      });

      await send(
        options.controlUrl,
        work.grant.postId,
        outcome.ok,
        outcome.permalink,
        outcome.error,
        options.nodeId,
      );
    },
  });

  return supervisor;
}

async function send(
  controlUrl: string,
  postId: number,
  ok: boolean,
  permalink: string | undefined,
  error: string | undefined,
  nodeId: string,
) {
  await fetch(`${controlUrl}/result`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ postId, ok, permalink, error, nodeId }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => undefined);
}
