import { readFileSync } from "node:fs";
import { z } from "zod";

const AccountSchema = z.object({
  id: z.string(),
  label: z.string(),
  platform: z.string(),
  nodeId: z.string(),
  maxPostsPerDay: z.number().int().positive().default(3),
  minMinutesBetweenPosts: z.number().int().positive().default(90),
});

const SurfaceSchema = z.object({
  id: z.string(),
  label: z.string(),
  platform: z.string(),
  accountId: z.string(),
  allowed: z.boolean().default(false),
  rules: z.string().default(""),
  minHoursBetweenPosts: z.number().int().positive().default(168),
});

const BusinessSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/, "phone must be E.164"),
  voice: z.string(),
  facts: z.array(z.string()).default([]),
  neverSay: z.array(z.string()).default([]),
});

const CampaignSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  surfaceIds: z.array(z.string()).min(1),
  postDays: z.array(z.number().int().min(0).max(6)).default([1, 3, 4]),
  postHourRange: z.object({ start: z.number().int(), end: z.number().int() }).default({ start: 9, end: 17 }),
  timezone: z.string().default("America/New_York"),
  themes: z.array(z.string()).default([]),
});

const SystemSchema = z.object({
  accounts: z.array(AccountSchema),
  surfaces: z.array(SurfaceSchema),
  businesses: z.array(BusinessSchema),
  campaigns: z.array(CampaignSchema),
});

export type System = z.infer<typeof SystemSchema>;

export function loadSystem(path: string): System {
  const parsed = SystemSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.success) {
    throw new Error(
      `${path} is invalid:\n${parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`,
    );
  }

  const accounts = new Set(parsed.data.accounts.map((account) => account.id));
  for (const surface of parsed.data.surfaces) {
    if (!accounts.has(surface.accountId)) {
      throw new Error(`Surface ${surface.id} names unknown account "${surface.accountId}".`);
    }
  }

  const surfaces = new Set(parsed.data.surfaces.map((surface) => surface.id));
  for (const campaign of parsed.data.campaigns) {
    for (const id of campaign.surfaceIds) {
      if (!surfaces.has(id)) throw new Error(`Campaign ${campaign.id} names unknown surface "${id}".`);
    }
  }

  return parsed.data;
}
