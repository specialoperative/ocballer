import { writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "./territories.js";
import { matchPost } from "./match.js";
import { inQuietHours, quietHoursEnd, localHour, composeAlert } from "./alert.js";
import { claimPost, recordAlert, recordOutcome, scorecard, topAskTerms } from "./db.js";
import type { RawPost } from "./types.js";

const CONFIG = process.env.SMOKE_CONFIG ?? "./config/territories.example.json";
const { territories } = loadConfig(CONFIG);
const t = territories[0]!;
let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures += 1;
};

check("config loads one territory", territories.length === 1, t.id);

// Exclusivity is the promise the page sells; a double-claimed slot must not boot.
const raw = JSON.parse(readFileSync(CONFIG, "utf8"));
const clone = JSON.parse(JSON.stringify(raw.territories[0]));
clone.id = `${clone.id}-2`;
raw.territories.push(clone);
const dupPath = join(tmpdir(), "poach-dup-config.json");
writeFileSync(dupPath, JSON.stringify(raw));
let refused = false;
try {
  loadConfig(dupPath);
} catch {
  refused = true;
}
check("refuses two contractors on one town+trade", refused);

const leak = "Slate roof is leaking after last night. Anyone have a roofer they actually trust?";
const m1 = matchPost(leak, t);
check("catches the roof-leak post", m1.matched && m1.hasAskPhrasing, m1.terms.join(","));

const m2 = matchPost("Anyone know a good preschool in town? Asking for a friend.", t);
check("ignores the preschool post", !m2.matched);

const m3 = matchPost("My roof is leaking, no time to ask around", t);
check("catches symptom without ask phrasing", m3.matched && !m3.hasAskPhrasing);

const m4 = matchPost("Cedar shake quote came in high, is that normal?", t);
check("catches custom keyword (cedar shake)", m4.matched, m4.terms.join(","));

// Quiet hours: 21:00–07:00 America/New_York
const twoAm = new Date("2026-09-02T06:00:00Z");  // 02:00 EDT
const noon = new Date("2026-09-02T16:00:00Z");   // 12:00 EDT
check("2am EDT is quiet", inQuietHours(twoAm, t), `localHour=${localHour(twoAm, t.timezone)}`);
check("noon EDT is not quiet", !inQuietHours(noon, t), `localHour=${localHour(noon, t.timezone)}`);
const end = quietHoursEnd(twoAm, t);
check("quiet window ends at 7am EDT", localHour(end, t.timezone) === 7, end.toISOString());

const post: RawPost = {
  externalId: `smoke-${Date.now()}`,
  source: "ingest",
  platform: "other",
  groupName: "Nextdoor · Scarsdale",
  authorName: "Jane D.",
  text: leak,
  url: "https://example.com/p/1",
  postedAt: new Date(),
};

check("first sighting claims the post", claimPost(post));
check("second sighting is deduped", !claimPost(post));

const classification = {
  isLead: true,
  intentScore: 4,
  urgency: "this_week" as const,
  reason: "Homeowner with active leak seeking a roofer.",
  suggestedReply: "Hi — we handle slate in Scarsdale. I can be out Thursday to take a look, no charge.",
};

const sms = composeAlert(post, t, classification);
check("SMS carries town, score, reply and the 1/2 prompt",
  sms.includes("Scarsdale") && sms.includes("4/5") && sms.includes("slate") && sms.includes("Reply 1 = contacted"));

const sentAt = new Date();
const id = recordAlert({ territoryId: t.id, post, classification, sentAt, holdUntil: null, latencyMs: 41_000 });
recordOutcome(id, true, true, "smoke");
const card = scorecard(t.id, new Date(Date.now() - 86_400_000));
check("scorecard counts the booked job", card.alerts >= 1 && card.booked >= 1, JSON.stringify(card));
check("median latency reported in seconds", card.median_latency_seconds === 41, String(card.median_latency_seconds));
check("top ask terms extracted", topAskTerms(t.id, new Date(Date.now() - 86_400_000)).includes("roof") ||
  topAskTerms(t.id, new Date(Date.now() - 86_400_000)).includes("slate"),
  topAskTerms(t.id, new Date(Date.now() - 86_400_000)).join(","));

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
