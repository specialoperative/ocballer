import twilio from "twilio";
import { env } from "./env.js";
import type { Classification, RawPost, Territory } from "./types.js";

let client: ReturnType<typeof twilio> | null = null;

/** Built on first real send, so a dry run needs no Twilio account. */
function twilioClient() {
  if (!client) client = twilio(env.twilio.accountSid, env.twilio.authToken);
  return client;
}

/** Local hour in the territory's timezone, without pulling in a date library. */
export function localHour(now: Date, timezone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: timezone,
  }).format(now);
  return Number.parseInt(hour, 10) % 24;
}

export function inQuietHours(now: Date, territory: Territory): boolean {
  const { start, end } = territory.quietHours;
  const hour = localHour(now, territory.timezone);
  // Windows wrap midnight (21 -> 8).
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** When the quiet window next ends, in real time. */
export function quietHoursEnd(now: Date, territory: Territory): Date {
  const end = new Date(now);
  for (let i = 0; i < 48; i += 1) {
    end.setUTCMinutes(0, 0, 0);
    end.setUTCHours(end.getUTCHours() + 1);
    if (!inQuietHours(end, territory)) return end;
  }
  return end;
}

export function composeAlert(
  post: RawPost,
  territory: Territory,
  classification: Classification,
): string {
  const heat = classification.intentScore >= 5 ? "Emergency" : "Hot lead";
  const excerpt = post.text.length > 220 ? `${post.text.slice(0, 217)}...` : post.text;

  return [
    `${heat} · ${territory.town}. Urgency ${classification.intentScore}/5.`,
    "",
    `"${excerpt}"`,
    "",
    `${post.groupName}${post.authorName ? ` · ${post.authorName}` : ""}`,
    post.url ?? "",
    "",
    "Suggested reply:",
    classification.suggestedReply,
    "",
    "Reply 1 = contacted, 2 = booked.",
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

export async function sendSms(to: string, body: string): Promise<void> {
  if (env.dryRun) {
    console.log(`\n--- DRY RUN SMS -> ${to} ---\n${body}\n---\n`);
    return;
  }

  await twilioClient().messages.create({
    to,
    body,
    ...(env.twilio.messagingServiceSid
      ? { messagingServiceSid: env.twilio.messagingServiceSid }
      : { from: env.twilio.fromNumber! }),
  });
}
