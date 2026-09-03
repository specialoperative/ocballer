import { defineAgent } from "../kernel/agent.js";
import type { Grant } from "../kernel/grants.js";

/**
 * □² poster — submits one approved payload to one surface, then it is done.
 *
 * It holds `publish` alone. The compartment rules mean it can hold neither
 * `session.hold` (so it never has credentials) nor `queue.read` (so it never
 * sees what else is pending). It is handed a body, a surface and a grant that
 * has already been redeemed, and it drives the local session driver.
 */
export interface PublishOutcome {
  ok: boolean;
  permalink?: string;
  error?: string;
}

export const poster = defineAgent<
  { grant: Grant; body: string; mediaUrl: string | null; driverUrl: string; dryRun: boolean },
  PublishOutcome
>({
  name: "poster",
  capabilities: ["publish"],
  async run({ grant, body, mediaUrl, driverUrl, dryRun }, ctx) {
    ctx.require("publish");

    if (dryRun) {
      console.log(`\n--- DRY RUN POST -> ${grant.surfaceId} (post ${grant.postId}) ---\n${body}\n---\n`);
      return { ok: true, permalink: `dry-run://post/${grant.postId}` };
    }

    if (!driverUrl) return { ok: false, error: "no session driver on this node" };

    try {
      const response = await fetch(`${driverUrl}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ surfaceId: grant.surfaceId, body, mediaUrl }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) return { ok: false, error: `driver returned ${response.status}` };

      const result = (await response.json()) as { permalink?: string };
      return { ok: true, permalink: result.permalink };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  },
});
