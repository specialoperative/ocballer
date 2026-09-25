import { readFileSync } from "node:fs";
import { z } from "zod";
import type { Territory } from "./types.js";

const TerritorySchema = z.object({
  id: z.string(),
  town: z.string(),
  state: z.string(),
  trade: z.enum(["Roofing", "HVAC", "Plumbing", "Electrical", "Remodel / GC", "Other"]),
  tier: z.enum(["territory", "premium"]).default("territory"),
  keywords: z.array(z.string()).default([]),
  contractor: z.object({
    name: z.string(),
    businessName: z.string(),
    phone: z.string().regex(/^\+[1-9]\d{7,14}$/, "phone must be E.164, e.g. +19145551234"),
    voiceNote: z.string().optional(),
  }),
  sources: z.array(z.string()).min(1),
  timezone: z.string().default("America/New_York"),
  quietHours: z
    .object({ start: z.number().int().min(0).max(23), end: z.number().int().min(0).max(23) })
    .default({ start: 21, end: 7 }),
  maxAlertsPerDay: z.number().int().positive().default(12),
  trialEndsAt: z.string().optional(),
});

const ConfigSchema = z.object({
  sources: z.array(
    z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("collector"),
        id: z.string(),
        platform: z.enum(["facebook", "nextdoor", "other"]),
        feedId: z.string(),
        groupName: z.string(),
      }),
      z.object({
        kind: z.literal("rss"),
        id: z.string(),
        url: z.string().url(),
        groupName: z.string(),
      }),
      z.object({ kind: z.literal("ingest"), id: z.literal("ingest") }),
    ]),
  ),
  territories: z.array(TerritorySchema),
});

export type SourceConfig = z.infer<typeof ConfigSchema>["sources"][number];

export function loadConfig(path: string): { sources: SourceConfig[]; territories: Territory[] } {
  const parsed = ConfigSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.success) {
    throw new Error(`${path} is invalid:\n${parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`);
  }

  const sourceIds = new Set(parsed.data.sources.map((source) => source.id));
  const duplicates = new Map<string, string>();

  for (const territory of parsed.data.territories) {
    for (const id of territory.sources) {
      if (!sourceIds.has(id)) {
        throw new Error(`Territory ${territory.id} lists unknown source "${id}".`);
      }
    }
    // Exclusivity is the product. Two contractors on one town+trade is not a
    // config mistake to shrug at — it breaks the promise the page sells.
    const slot = `${territory.town}|${territory.state}|${territory.trade}`.toLowerCase();
    const existing = duplicates.get(slot);
    if (existing) {
      throw new Error(
        `${territory.town} ${territory.trade} is claimed twice (${existing} and ${territory.id}). One contractor per town per trade.`,
      );
    }
    duplicates.set(slot, territory.id);
  }

  return parsed.data;
}
