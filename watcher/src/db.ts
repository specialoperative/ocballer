import Database from "better-sqlite3";
import { env } from "./env.js";
import type { Classification, RawPost } from "./types.js";

const db = new Database(env.databasePath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS seen_posts (
    source       TEXT NOT NULL,
    external_id  TEXT NOT NULL,
    first_seen   TEXT NOT NULL,
    PRIMARY KEY (source, external_id)
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    territory_id    TEXT NOT NULL,
    source          TEXT NOT NULL,
    external_id     TEXT NOT NULL,
    group_name      TEXT NOT NULL,
    author_name     TEXT,
    post_text       TEXT NOT NULL,
    post_url        TEXT,
    posted_at       TEXT NOT NULL,
    -- NULL while held for quiet hours; set when the SMS actually goes out.
    sent_at         TEXT,
    hold_until      TEXT,
    intent_score    INTEGER NOT NULL,
    urgency         TEXT NOT NULL,
    suggested_reply TEXT NOT NULL,
    -- post timestamp -> SMS accepted by Twilio. This is the "under 90 sec" claim.
    latency_ms      INTEGER,
    -- Contractor texts back 1 = contacted, 2 = booked.
    contacted       INTEGER NOT NULL DEFAULT 0,
    booked          INTEGER NOT NULL DEFAULT 0,
    outcome_note    TEXT
  );

  CREATE INDEX IF NOT EXISTS alerts_territory_sent ON alerts (territory_id, sent_at);
  CREATE INDEX IF NOT EXISTS alerts_pending ON alerts (sent_at, hold_until);
`);

const claimStmt = db.prepare(
  `INSERT OR IGNORE INTO seen_posts (source, external_id, first_seen) VALUES (?, ?, ?)`,
);

/** True the first time a post is seen, false every time after. */
export function claimPost(post: RawPost): boolean {
  return claimStmt.run(post.source, post.externalId, new Date().toISOString()).changes === 1;
}

const countSentStmt = db.prepare(
  `SELECT COUNT(*) AS n FROM alerts WHERE territory_id = ? AND sent_at >= ?`,
);

export function alertsSentSince(territoryId: string, since: Date): number {
  return (countSentStmt.get(territoryId, since.toISOString()) as { n: number }).n;
}

const insertAlertStmt = db.prepare(
  `INSERT INTO alerts (
     territory_id, source, external_id, group_name, author_name, post_text, post_url,
     posted_at, sent_at, hold_until, intent_score, urgency, suggested_reply, latency_ms
   ) VALUES (
     @territoryId, @source, @externalId, @groupName, @authorName, @postText, @postUrl,
     @postedAt, @sentAt, @holdUntil, @intentScore, @urgency, @suggestedReply, @latencyMs
   )`,
);

export function recordAlert(args: {
  territoryId: string;
  post: RawPost;
  classification: Classification;
  sentAt: Date | null;
  holdUntil: Date | null;
  latencyMs: number | null;
}): number {
  const result = insertAlertStmt.run({
    territoryId: args.territoryId,
    source: args.post.source,
    externalId: args.post.externalId,
    groupName: args.post.groupName,
    authorName: args.post.authorName,
    postText: args.post.text,
    postUrl: args.post.url,
    postedAt: args.post.postedAt.toISOString(),
    sentAt: args.sentAt?.toISOString() ?? null,
    holdUntil: args.holdUntil?.toISOString() ?? null,
    intentScore: args.classification.intentScore,
    urgency: args.classification.urgency,
    suggestedReply: args.classification.suggestedReply,
    latencyMs: args.latencyMs,
  });
  return Number(result.lastInsertRowid);
}

export interface HeldAlert {
  id: number;
  territory_id: string;
  group_name: string;
  post_text: string;
  post_url: string | null;
  posted_at: string;
  intent_score: number;
  urgency: string;
  suggested_reply: string;
}

/** Alerts whose quiet-hours hold has expired and that still need sending. */
export function dueHeldAlerts(now: Date): HeldAlert[] {
  return db
    .prepare(
      `SELECT id, territory_id, group_name, post_text, post_url, posted_at,
              intent_score, urgency, suggested_reply
         FROM alerts
        WHERE sent_at IS NULL AND hold_until IS NOT NULL AND hold_until <= ?
        ORDER BY intent_score DESC, posted_at ASC`,
    )
    .all(now.toISOString()) as HeldAlert[];
}

const markSentStmt = db.prepare(
  `UPDATE alerts SET sent_at = ?, hold_until = NULL, latency_ms = ? WHERE id = ?`,
);

export function markSent(id: number, sentAt: Date, latencyMs: number) {
  markSentStmt.run(sentAt.toISOString(), latencyMs, id);
}

/** Most recent alert sent to a phone — the one "1" or "2" refers to. */
export function latestAlertForPhone(territoryIds: string[]): { id: number } | undefined {
  if (territoryIds.length === 0) return undefined;
  const placeholders = territoryIds.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT id FROM alerts
        WHERE territory_id IN (${placeholders}) AND sent_at IS NOT NULL
        ORDER BY sent_at DESC LIMIT 1`,
    )
    .get(...territoryIds) as { id: number } | undefined;
}

export function recordOutcome(id: number, contacted: boolean, booked: boolean, note?: string) {
  db.prepare(
    `UPDATE alerts
        SET contacted = MAX(contacted, ?), booked = MAX(booked, ?), outcome_note = COALESCE(?, outcome_note)
      WHERE id = ?`,
  ).run(contacted ? 1 : 0, booked ? 1 : 0, note ?? null, id);
}

export interface Scorecard {
  alerts: number;
  contacted: number;
  booked: number;
  median_latency_seconds: number | null;
}

/** The Monday report, and the end-of-free-week close, in one query. */
export function scorecard(territoryId: string, since: Date): Scorecard {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS alerts,
              COALESCE(SUM(contacted), 0) AS contacted,
              COALESCE(SUM(booked), 0) AS booked
         FROM alerts
        WHERE territory_id = ? AND sent_at IS NOT NULL AND sent_at >= ?`,
    )
    .get(territoryId, since.toISOString()) as Omit<Scorecard, "median_latency_seconds">;

  const latencies = db
    .prepare(
      `SELECT latency_ms FROM alerts
        WHERE territory_id = ? AND sent_at >= ? AND latency_ms IS NOT NULL
        ORDER BY latency_ms`,
    )
    .all(territoryId, since.toISOString()) as { latency_ms: number }[];

  const mid = latencies[Math.floor(latencies.length / 2)];
  return {
    ...row,
    median_latency_seconds: mid ? Math.round(mid.latency_ms / 100) / 10 : null,
  };
}

/** "What your neighbors keep asking for" — the Monday report's last line. */
export function topAskTerms(territoryId: string, since: Date, limit = 5): string[] {
  const rows = db
    .prepare(
      `SELECT post_text FROM alerts WHERE territory_id = ? AND sent_at >= ?`,
    )
    .all(territoryId, since.toISOString()) as { post_text: string }[];

  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const word of row.post_text.toLowerCase().match(/[a-z]{4,}/g) ?? []) {
      if (STOP_WORDS.has(word)) continue;
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

const STOP_WORDS = new Set([
  "anyone", "know", "good", "have", "does", "with", "that", "this", "just", "need",
  "looking", "recommend", "recommendations", "someone", "would", "there", "about",
  "really", "thanks", "please", "could", "your", "from", "they", "been", "much",
]);

export default db;
