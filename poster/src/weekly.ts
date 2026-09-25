import { draftPost, seasonalNote } from "./draft.js";
import { planWeek } from "./schedule.js";
import { audit, insertDraft } from "./db.js";
import { approvalLink } from "./approval.js";
import { sendSms } from "./notify.js";
import { env } from "./env.js";
import type { Client, Target } from "./types.js";

const REVIEW_WINDOW_DAYS = 5;

/**
 * The weekly batch: draft one post per eligible group, queue them all as
 * pending, and send the owner one review link. Nothing here publishes, and
 * nothing becomes publishable without a decision.
 */
export async function runWeeklyBatch(
  client: Client,
  targets: Map<string, Target>,
  now = new Date(),
): Promise<{ drafted: number; skipped: string[] }> {
  const clientTargets = client.targets
    .map((id) => targets.get(id))
    .filter((target): target is Target => Boolean(target));

  const { slots, skipped } = planWeek(client, clientTargets, now);
  const note = seasonalNote(now, client.trade);
  const skipNotes = skipped.map((skip) => `${skip.targetId}: ${skip.reason}`);

  let drafted = 0;
  for (const slot of slots) {
    const post = await draftPost(client, slot.target, note);

    if (!post.compliant || !post.body.trim()) {
      // A group whose rules forbid the post produces no draft at all, rather
      // than a draft the owner has to catch.
      audit("drafter", "skipped", undefined, `${slot.target.id}: ${post.ruleCheck}`);
      skipNotes.push(`${slot.target.id}: ${post.ruleCheck}`);
      continue;
    }

    insertDraft({
      clientId: client.id,
      targetId: slot.target.id,
      body: post.body,
      creativeBrief: post.creativeBrief,
      scheduledFor: slot.scheduledFor,
    });
    drafted += 1;
  }

  if (drafted > 0) {
    await sendSms(
      client.approverPhone,
      [
        `${drafted} post${drafted === 1 ? "" : "s"} drafted for ${client.town} this week.`,
        "",
        `Review, edit or reject: ${env.publicBaseUrl}/review/${client.id}`,
        "",
        "Nothing posts until you approve it.",
      ].join("\n"),
    );
  }

  return { drafted, skipped: skipNotes };
}

export function reviewDeadline(now = new Date()): Date {
  return new Date(now.getTime() + REVIEW_WINDOW_DAYS * 86_400_000);
}

export { approvalLink };
