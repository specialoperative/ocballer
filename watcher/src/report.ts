import { scorecard, topAskTerms } from "./db.js";
import { sendSms } from "./alert.js";
import type { Territory } from "./types.js";

/**
 * The Monday report the page promises: leads flagged, how fast each reached
 * them, jobs booked, and what neighbors keep asking for.
 */
export function composeWeeklyReport(territory: Territory, since: Date): string {
  const card = scorecard(territory.id, since);
  const terms = topAskTerms(territory.id, since);

  if (card.alerts === 0) {
    return [
      `${territory.town} ${territory.trade} — week in review.`,
      "",
      "No qualified leads this week. That happens in slow weeks; we're widening your keyword set.",
      "Reply TUNE if there's a job type you want caught that we're missing.",
    ].join("\n");
  }

  return [
    `${territory.town} ${territory.trade} — week in review.`,
    "",
    `${card.alerts} lead${card.alerts === 1 ? "" : "s"} flagged`,
    `${card.contacted} contacted · ${card.booked} booked`,
    card.median_latency_seconds !== null
      ? `Median ${card.median_latency_seconds}s from their post to your phone`
      : "",
    terms.length ? `Neighbors kept asking about: ${terms.join(", ")}` : "",
    "",
    "Reply 1 = contacted, 2 = booked, on any alert.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function sendWeeklyReports(territories: Territory[]): Promise<void> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  for (const territory of territories) {
    await sendSms(territory.contractor.phone, composeWeeklyReport(territory, since));
  }
}

/** True at the top of Monday morning in the territory's timezone. */
export function isMondayReportHour(now: Date, timezone: string): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    hour12: false,
    timeZone: timezone,
  }).formatToParts(now);

  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number.parseInt(parts.find((part) => part.type === "hour")?.value ?? "-1", 10);
  return weekday === "Mon" && hour === 8;
}
