import { readFileSync } from "node:fs";
import { z } from "zod";
import type { Client, Target } from "./types.js";

const TargetSchema = z.object({
  id: z.string(),
  groupName: z.string(),
  platform: z.enum(["facebook", "nextdoor", "other"]),
  // Opt-in, never opt-out: a group you have not confirmed is off-limits.
  allowed: z.boolean().default(false),
  promoWeekday: z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]).optional(),
  minDaysBetweenPosts: z.number().int().min(1).default(7),
  rules: z.string().default(""),
});

const ClientSchema = z.object({
  id: z.string(),
  businessName: z.string(),
  town: z.string(),
  state: z.string(),
  trade: z.string(),
  approverPhone: z.string().regex(/^\+[1-9]\d{7,14}$/, "approverPhone must be E.164"),
  voiceNote: z.string(),
  talkingPoints: z.array(z.string()).default([]),
  neverSay: z.array(z.string()).default([]),
  targets: z.array(z.string()).min(1),
  timezone: z.string().default("America/New_York"),
});

const ConfigSchema = z.object({
  targets: z.array(TargetSchema),
  clients: z.array(ClientSchema),
});

export function loadClients(path: string): { targets: Map<string, Target>; clients: Client[] } {
  const parsed = ConfigSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.success) {
    throw new Error(
      `${path} is invalid:\n${parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`,
    );
  }

  const targets = new Map(parsed.data.targets.map((target) => [target.id, target]));
  for (const client of parsed.data.clients) {
    for (const id of client.targets) {
      if (!targets.has(id)) throw new Error(`Client ${client.id} lists unknown target "${id}".`);
    }
  }
  return { targets, clients: parsed.data.clients };
}
