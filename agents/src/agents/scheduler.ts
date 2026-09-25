import { defineAgent } from "../kernel/agent.js";
import { lastPublishedOnSurface } from "../kernel/store.js";
import type { Campaign, Surface } from "../domain.js";

export interface Slot {
  surface: Surface;
  scheduledFor: Date;
}

export interface Skip {
  surfaceId: string;
  reason: string;
}

function weekdayOf(date: Date, timezone: string): number {
  const name = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: timezone }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

function hourOf(date: Date, timezone: string): number {
  return (
    Number.parseInt(
      new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: timezone }).format(date),
      10,
    ) % 24
  );
}

/**
 * □ scheduler — decides when, never what. Holds `schedule` only, so it can
 * place a post in time but cannot write it, approve it or send it.
 *
 * Two rails: the surface's own cadence floor, and day-spreading so several
 * surfaces never fire together.
 */
export const scheduler = defineAgent<
  { campaign: Campaign; surfaces: Surface[]; now: Date },
  { slots: Slot[]; skipped: Skip[] }
>({
  name: "scheduler",
  capabilities: ["schedule"],
  async run({ campaign, surfaces, now }, ctx) {
    ctx.require("schedule");

    const slots: Slot[] = [];
    const skipped: Skip[] = [];
    const usedDays = new Set<number>();
    let index = 0;

    for (const surface of surfaces) {
      if (!surface.allowed) {
        skipped.push({ surfaceId: surface.id, reason: "surface not cleared for posting" });
        continue;
      }

      const last = lastPublishedOnSurface(surface.id);
      if (last) {
        const hours = (now.getTime() - last.getTime()) / 3_600_000;
        if (hours < surface.minHoursBetweenPosts) {
          skipped.push({
            surfaceId: surface.id,
            reason: `posted ${Math.floor(hours)}h ago, floor is ${surface.minHoursBetweenPosts}h`,
          });
          continue;
        }
      }

      const free = campaign.postDays.filter((day) => !usedDays.has(day));
      const pool = free.length > 0 ? free : campaign.postDays;
      const day = pool[index % pool.length]!;
      const span = campaign.postHourRange.end - campaign.postHourRange.start;
      const hour = campaign.postHourRange.start + ((index * 2 + Math.floor(Math.random() * 2)) % Math.max(span, 1));

      const slot = nextOccurrence(now, campaign.timezone, day, hour);
      if (!slot) {
        skipped.push({ surfaceId: surface.id, reason: "no matching slot in the next 14 days" });
        continue;
      }

      usedDays.add(day);
      slots.push({ surface, scheduledFor: slot });
      index += 1;
    }

    return { slots, skipped };
  },
});

function nextOccurrence(now: Date, timezone: string, weekday: number, hour: number): Date | null {
  for (let ahead = 1; ahead <= 14; ahead += 1) {
    const day = new Date(now.getTime() + ahead * 86_400_000);
    if (weekdayOf(day, timezone) !== weekday) continue;

    for (let h = 0; h < 24; h += 1) {
      const at = new Date(day);
      at.setUTCHours(h, Math.floor(Math.random() * 50), 0, 0);
      if (hourOf(at, timezone) === hour && weekdayOf(at, timezone) === weekday) return at;
    }
  }
  return null;
}
