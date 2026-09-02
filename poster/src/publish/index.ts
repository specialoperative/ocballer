import { env } from "../env.js";
import { consumeGrant, getDraft } from "../db.js";
import { verifyGrant } from "../approval.js";
import type { PublishGrant, PublishResult, Publisher } from "../types.js";

/**
 * Hands an approved draft to the posting-only agent.
 *
 * This service never logs into an account and holds no session. The publisher
 * is a separate process you run that does exactly one thing — post the body it
 * is handed, for the grant it can verify — and nothing else. Swapping how
 * publishing happens changes only this file's counterpart, never the approval
 * chain above it.
 */
export function relayPublisher(): Publisher {
  return {
    name: "relay",
    async publish(grant: PublishGrant, body: string): Promise<PublishResult> {
      if (!env.publisherUrl) {
        return { ok: false, error: "PUBLISHER_URL is not set; nothing was published." };
      }

      const response = await fetch(env.publisherUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(env.publisherToken ? { authorization: `Bearer ${env.publisherToken}` } : {}),
        },
        body: JSON.stringify({ grant, body }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        return { ok: false, error: `publisher returned ${response.status}` };
      }
      const result = (await response.json()) as { permalink?: string };
      return { ok: true, permalink: result.permalink };
    },
  };
}

export function dryRunPublisher(): Publisher {
  return {
    name: "dry-run",
    async publish(grant: PublishGrant, body: string): Promise<PublishResult> {
      console.log(`\n--- DRY RUN POST -> ${grant.targetId} (draft ${grant.draftId}) ---\n${body}\n---\n`);
      return { ok: true, permalink: `dry-run://draft/${grant.draftId}` };
    },
  };
}

export function publisher(): Publisher {
  return env.dryRun ? dryRunPublisher() : relayPublisher();
}

/**
 * The check the posting agent runs. Exported here so the publisher process can
 * import it directly rather than reimplementing the rules.
 */
export function authorizePublish(grant: PublishGrant): { ok: boolean; body?: string; error?: string } {
  if (!verifyGrant(grant)) return { ok: false, error: "grant signature invalid or expired" };

  const draft = getDraft(grant.draftId);
  if (!draft) return { ok: false, error: "unknown draft" };
  if (draft.status !== "approved") return { ok: false, error: `draft is ${draft.status}, not approved` };
  if (draft.targetId !== grant.targetId) return { ok: false, error: "grant target does not match draft" };
  if (!consumeGrant(grant.nonce)) return { ok: false, error: "grant already used" };

  return { ok: true, body: draft.body };
}
