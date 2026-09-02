import { classify } from "./classify.js";
import { matchPost } from "./match.js";
import {
  alertsSentSince,
  claimPost,
  dueHeldAlerts,
  markSent,
  recordAlert,
} from "./db.js";
import { composeAlert, inQuietHours, quietHoursEnd, sendSms } from "./alert.js";
import type { RawPost, Source, Territory } from "./types.js";

/** Posts below this never text anyone. Tune per territory once you have data. */
const MIN_INTENT_SCORE = 3;

export interface PipelineDeps {
  sources: Map<string, Source>;
  territories: Territory[];
}

/** One poll of every feed, fanned out to the territories that listen to it. */
export async function runCycle(deps: PipelineDeps, since: Date): Promise<void> {
  const bySource = new Map<string, Territory[]>();
  for (const territory of deps.territories) {
    for (const id of territory.sources) {
      bySource.set(id, [...(bySource.get(id) ?? []), territory]);
    }
  }

  await Promise.all(
    [...bySource.entries()].map(async ([sourceId, territories]) => {
      const source = deps.sources.get(sourceId);
      if (!source) return;

      let posts: RawPost[];
      try {
        posts = await source.fetch(since);
      } catch (error) {
        // One dead feed must never stop the others.
        console.error(`[${sourceId}] fetch failed:`, (error as Error).message);
        return;
      }

      for (const post of posts) {
        // Claim before classifying: two overlapping cycles must not both pay
        // for the same post, or both text the contractor about it.
        if (!claimPost(post)) continue;
        for (const territory of territories) {
          await handlePost(post, territory);
        }
      }
    }),
  );

  await flushHeldAlerts(deps.territories);
}

async function handlePost(post: RawPost, territory: Territory): Promise<void> {
  const match = matchPost(post.text, territory);
  if (!match.matched) return;

  let classification;
  try {
    classification = await classify(post, territory, match);
  } catch (error) {
    console.error(`[${territory.id}] classify failed:`, (error as Error).message);
    return;
  }

  if (!classification.isLead || classification.intentScore < MIN_INTENT_SCORE) {
    console.log(`[${territory.id}] dropped (${classification.intentScore}/5): ${classification.reason}`);
    return;
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (alertsSentSince(territory.id, dayAgo) >= territory.maxAlertsPerDay) {
    console.warn(`[${territory.id}] daily cap reached; holding lead ${post.externalId}.`);
    recordAlert({ territoryId: territory.id, post, classification, sentAt: null, holdUntil: dayAgo, latencyMs: null });
    return;
  }

  const now = new Date();
  if (inQuietHours(now, territory)) {
    // Held, never dropped — a 2am roof leak is still worth $38k at 7am.
    recordAlert({
      territoryId: territory.id,
      post,
      classification,
      sentAt: null,
      holdUntil: quietHoursEnd(now, territory),
      latencyMs: null,
    });
    return;
  }

  const body = composeAlert(post, territory, classification);
  await sendSms(territory.contractor.phone, body);
  const sentAt = new Date();

  recordAlert({
    territoryId: territory.id,
    post,
    classification,
    sentAt,
    holdUntil: null,
    latencyMs: sentAt.getTime() - post.postedAt.getTime(),
  });

  console.log(
    `[${territory.id}] alerted ${territory.contractor.businessName} (${classification.intentScore}/5) in ${
      sentAt.getTime() - post.postedAt.getTime()
    }ms`,
  );
}

/** Send anything whose quiet-hours hold has expired. */
export async function flushHeldAlerts(territories: Territory[]): Promise<void> {
  const now = new Date();
  const byId = new Map(territories.map((territory) => [territory.id, territory]));

  for (const held of dueHeldAlerts(now)) {
    const territory = byId.get(held.territory_id);
    if (!territory) continue;

    const body = [
      `Held overnight · ${territory.town}. Urgency ${held.intent_score}/5.`,
      "",
      `"${held.post_text.slice(0, 217)}"`,
      "",
      held.group_name,
      held.post_url ?? "",
      "",
      "Suggested reply:",
      held.suggested_reply,
      "",
      "Reply 1 = contacted, 2 = booked.",
    ].join("\n");

    await sendSms(territory.contractor.phone, body);
    const sentAt = new Date();
    markSent(held.id, sentAt, sentAt.getTime() - new Date(held.posted_at).getTime());
  }
}
