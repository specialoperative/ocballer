import { lastPublishedAt } from "./db.js";
import type { Client, Target } from "./types.js";

/** The cadence from the notes: Mon / Wed / Thu, never all at once. */
const POST_DAYS = [1, 3, 4] as const; // Sun = 0
const WINDOW_START_HOUR = 9;
const WINDOW_END_HOUR = 17;

export interface SlotDecision {
  target: Target;
  scheduledFor: Date;
}

export interface SkipReason {
  targetId: string;
  reason: string;
}

function weekdayName(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: timezone }).format(date);
}

function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    hour12: false,
    timeZone: timezone,
  }).formatToParts(date);
  return {
    weekday: parts.find((p) => p.type === "weekday")?.value ?? "",
    hour: Number.parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10),
  };
}

/**
 * Choose the next posting slot per target for the coming week.
 *
 * Two rules do the work: a group's own cadence floor, and staggering. The same
 * copy hitting six groups inside a minute is the pattern that gets an account
 * flagged, so slots are spread across days and offset within the day.
 */
export function planWeek(
  client: Client,
  targets: Target[],
  now: Date,
): { slots: SlotDecision[]; skipped: SkipReason[] } {
  const slots: SlotDecision[] = [];
  const skipped: SkipReason[] = [];

  const usedDays = new Set<number>();
  let index = 0;
  for (const target of targets) {
    if (!target.allowed) {
      skipped.push({ targetId: target.id, reason: "group not cleared for business posts" });
      continue;
    }

    const last = lastPublishedAt(target.id);
    if (last) {
      const daysSince = (now.getTime() - last.getTime()) / 86_400_000;
      if (daysSince < target.minDaysBetweenPosts) {
        skipped.push({
          targetId: target.id,
          reason: `posted ${Math.floor(daysSince)}d ago, group floor is ${target.minDaysBetweenPosts}d`,
        });
        continue;
      }
    }

    // A group locked to its own promo day takes that day; the rest fill the
    // remaining Mon/Wed/Thu slots, so two posts don't stack on one day.
    const weekday = target.promoWeekday
      ? WEEKDAY_NAMES.indexOf(target.promoWeekday)
      : pickDay(usedDays, index);

    const slot = nextSlot(now, client.timezone, weekday, index);
    if (!slot) {
      skipped.push({ targetId: target.id, reason: `no ${WEEKDAY_NAMES[weekday]} slot in the next 14 days` });
      continue;
    }

    usedDays.add(weekday);
    slots.push({ target, scheduledFor: slot });
    index += 1;
  }

  return { slots, skipped };
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Prefer a posting day nothing else has claimed this week. */
function pickDay(usedDays: Set<number>, index: number): number {
  const free = POST_DAYS.filter((day) => !usedDays.has(day));
  const pool = free.length > 0 ? free : POST_DAYS;
  return pool[index % pool.length]!;
}

/** Next occurrence of `weekday`, at an hour offset by `index`. */
function nextSlot(now: Date, timezone: string, weekday: number, index: number): Date | null {
  const name = WEEKDAY_NAMES[weekday];
  const hour =
    WINDOW_START_HOUR + ((index * 2 + Math.floor(Math.random() * 2)) % (WINDOW_END_HOUR - WINDOW_START_HOUR));

  for (let ahead = 1; ahead <= 14; ahead += 1) {
    const candidate = new Date(now.getTime() + ahead * 86_400_000);
    if (weekdayName(candidate, timezone) !== name) continue;

    // Walk UTC hours to find the one that reads as `hour` locally.
    for (let h = 0; h < 24; h += 1) {
      const at = new Date(candidate);
      at.setUTCHours(h, Math.floor(Math.random() * 50), 0, 0);
      if (localParts(at, timezone).hour === hour && weekdayName(at, timezone) === name) {
        return at;
      }
    }
  }
  return null;
}

export const postDays = POST_DAYS;
