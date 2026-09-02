import Database from "better-sqlite3";
import { env } from "./env.js";
import type { Draft, DraftStatus } from "./types.js";

const db = new Database(env.databasePath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS drafts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id      TEXT NOT NULL,
    target_id      TEXT NOT NULL,
    body           TEXT NOT NULL,
    creative_brief TEXT NOT NULL,
    scheduled_for  TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'drafted',
    created_at     TEXT NOT NULL,
    decided_at     TEXT,
    published_at   TEXT,
    permalink      TEXT,
    failure        TEXT
  );

  CREATE INDEX IF NOT EXISTS drafts_due ON drafts (status, scheduled_for);
  CREATE INDEX IF NOT EXISTS drafts_target ON drafts (target_id, published_at);

  -- Single-use publish grants. A consumed nonce can never be replayed.
  CREATE TABLE IF NOT EXISTS grants (
    nonce      TEXT PRIMARY KEY,
    draft_id   INTEGER NOT NULL,
    issued_at  TEXT NOT NULL,
    consumed_at TEXT
  );

  -- Every state change, append-only. This is the liability record: it shows
  -- exactly what was approved, by whom, and what was published.
  CREATE TABLE IF NOT EXISTS audit (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    at        TEXT NOT NULL,
    draft_id  INTEGER,
    actor     TEXT NOT NULL,
    action    TEXT NOT NULL,
    detail    TEXT
  );
`);

export function audit(actor: string, action: string, draftId?: number, detail?: string) {
  db.prepare(`INSERT INTO audit (at, draft_id, actor, action, detail) VALUES (?, ?, ?, ?, ?)`)
    .run(new Date().toISOString(), draftId ?? null, actor, action, detail ?? null);
}

export function insertDraft(draft: {
  clientId: string;
  targetId: string;
  body: string;
  creativeBrief: string;
  scheduledFor: Date;
}): number {
  const result = db
    .prepare(
      `INSERT INTO drafts (client_id, target_id, body, creative_brief, scheduled_for, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      draft.clientId,
      draft.targetId,
      draft.body,
      draft.creativeBrief,
      draft.scheduledFor.toISOString(),
      new Date().toISOString(),
    );
  const id = Number(result.lastInsertRowid);
  audit("drafter", "drafted", id, draft.targetId);
  return id;
}

export function getDraft(id: number): Draft | undefined {
  const row = db
    .prepare(
      `SELECT id, client_id AS clientId, target_id AS targetId, body,
              creative_brief AS creativeBrief, scheduled_for AS scheduledFor, status
         FROM drafts WHERE id = ?`,
    )
    .get(id) as Draft | undefined;
  return row;
}

export function draftsForClient(clientId: string, status?: DraftStatus): Draft[] {
  const sql =
    `SELECT id, client_id AS clientId, target_id AS targetId, body,
            creative_brief AS creativeBrief, scheduled_for AS scheduledFor, status
       FROM drafts WHERE client_id = ?` +
    (status ? ` AND status = ?` : ``) +
    ` ORDER BY scheduled_for`;
  const params = status ? [clientId, status] : [clientId];
  return db.prepare(sql).all(...params) as Draft[];
}

export function setStatus(id: number, status: DraftStatus, actor: string, detail?: string) {
  db.prepare(`UPDATE drafts SET status = ?, decided_at = ? WHERE id = ?`)
    .run(status, new Date().toISOString(), id);
  audit(actor, status, id, detail);
}

export function editBody(id: number, body: string, actor: string) {
  db.prepare(`UPDATE drafts SET body = ? WHERE id = ?`).run(body, id);
  audit(actor, "edited", id, body.slice(0, 120));
}

/** Approved drafts whose scheduled time has arrived. */
export function dueDrafts(now: Date): Draft[] {
  return db
    .prepare(
      `SELECT id, client_id AS clientId, target_id AS targetId, body,
              creative_brief AS creativeBrief, scheduled_for AS scheduledFor, status
         FROM drafts
        WHERE status = 'approved' AND scheduled_for <= ?
        ORDER BY scheduled_for`,
    )
    .all(now.toISOString()) as Draft[];
}

export function markPublished(id: number, permalink: string | undefined) {
  db.prepare(`UPDATE drafts SET status = 'published', published_at = ?, permalink = ? WHERE id = ?`)
    .run(new Date().toISOString(), permalink ?? null, id);
  audit("publisher", "published", id, permalink);
}

export function markFailed(id: number, error: string) {
  db.prepare(`UPDATE drafts SET status = 'failed', failure = ? WHERE id = ?`).run(error, id);
  audit("publisher", "failed", id, error);
}

/** Most recent publish into a group — enforces the group's own cadence rule. */
export function lastPublishedAt(targetId: string): Date | null {
  const row = db
    .prepare(
      `SELECT published_at FROM drafts
        WHERE target_id = ? AND published_at IS NOT NULL
        ORDER BY published_at DESC LIMIT 1`,
    )
    .get(targetId) as { published_at: string } | undefined;
  return row ? new Date(row.published_at) : null;
}

export function recordGrant(nonce: string, draftId: number) {
  db.prepare(`INSERT INTO grants (nonce, draft_id, issued_at) VALUES (?, ?, ?)`)
    .run(nonce, draftId, new Date().toISOString());
}

/** True only the first time. A replayed grant is refused here. */
export function consumeGrant(nonce: string): boolean {
  const result = db
    .prepare(`UPDATE grants SET consumed_at = ? WHERE nonce = ? AND consumed_at IS NULL`)
    .run(new Date().toISOString(), nonce);
  return result.changes === 1;
}

export function auditTrail(draftId: number) {
  return db
    .prepare(`SELECT at, actor, action, detail FROM audit WHERE draft_id = ? ORDER BY id`)
    .all(draftId) as { at: string; actor: string; action: string; detail: string | null }[];
}

export default db;
