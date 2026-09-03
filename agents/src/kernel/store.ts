import Database from "better-sqlite3";
import type { Post, PostState } from "../domain.js";

const path = process.env.DATABASE_PATH ?? "./agents.db";
const db = new Database(path);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id    TEXT NOT NULL,
    surface_id     TEXT NOT NULL,
    account_id     TEXT NOT NULL,
    body           TEXT NOT NULL,
    creative_brief TEXT NOT NULL,
    media_url      TEXT,
    scheduled_for  TEXT NOT NULL,
    state          TEXT NOT NULL DEFAULT 'drafted',
    claimed_by     TEXT,
    claimed_at     TEXT,
    published_at   TEXT,
    permalink      TEXT,
    failure        TEXT,
    created_at     TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS posts_due ON posts (state, scheduled_for);
  CREATE INDEX IF NOT EXISTS posts_account ON posts (account_id, published_at);

  CREATE TABLE IF NOT EXISTS grants (
    nonce       TEXT PRIMARY KEY,
    post_id     INTEGER NOT NULL,
    node_id     TEXT NOT NULL,
    issued_at   TEXT NOT NULL,
    consumed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS nodes (
    id         TEXT PRIMARY KEY,
    label      TEXT NOT NULL,
    last_seen  TEXT NOT NULL,
    agents     INTEGER NOT NULL DEFAULT 0,
    capacity   INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS audit (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    at     TEXT NOT NULL,
    actor  TEXT NOT NULL,
    action TEXT NOT NULL,
    post_id INTEGER,
    detail TEXT
  );
`);

export function audit(actor: string, action: string, postId?: number, detail?: string) {
  db.prepare(`INSERT INTO audit (at, actor, action, post_id, detail) VALUES (?,?,?,?,?)`)
    .run(new Date().toISOString(), actor, action, postId ?? null, detail ?? null);
}

export function insertPost(post: Omit<Post, "id" | "state">): number {
  const result = db
    .prepare(
      `INSERT INTO posts (campaign_id, surface_id, account_id, body, creative_brief,
                          media_url, scheduled_for, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    )
    .run(
      post.campaignId,
      post.surfaceId,
      post.accountId,
      post.body,
      post.creativeBrief,
      post.mediaUrl,
      post.scheduledFor,
      new Date().toISOString(),
    );
  const id = Number(result.lastInsertRowid);
  audit("drafter", "drafted", id, post.surfaceId);
  return id;
}

export function getPost(id: number): Post | undefined {
  return db
    .prepare(
      `SELECT id, campaign_id AS campaignId, surface_id AS surfaceId, account_id AS accountId,
              body, creative_brief AS creativeBrief, media_url AS mediaUrl,
              scheduled_for AS scheduledFor, state
         FROM posts WHERE id = ?`,
    )
    .get(id) as Post | undefined;
}

export function setState(id: number, state: PostState, actor: string, detail?: string) {
  db.prepare(`UPDATE posts SET state = ? WHERE id = ?`).run(state, id);
  audit(actor, state, id, detail);
}

export function pendingApproval(campaignId?: string): Post[] {
  const sql =
    `SELECT id, campaign_id AS campaignId, surface_id AS surfaceId, account_id AS accountId,
            body, creative_brief AS creativeBrief, media_url AS mediaUrl,
            scheduled_for AS scheduledFor, state
       FROM posts WHERE state = 'drafted'` +
    (campaignId ? ` AND campaign_id = ?` : ``) +
    ` ORDER BY scheduled_for`;
  return (campaignId ? db.prepare(sql).all(campaignId) : db.prepare(sql).all()) as Post[];
}

/**
 * Atomically hand one due post to one node. The UPDATE...WHERE state='approved'
 * is the lock: two nodes racing for the same post, only one wins.
 */
export function claimNextForNode(nodeId: string, accountIds: string[], now: Date): Post | undefined {
  if (accountIds.length === 0) return undefined;
  const placeholders = accountIds.map(() => "?").join(",");

  const candidate = db
    .prepare(
      `SELECT id FROM posts
        WHERE state = 'approved' AND scheduled_for <= ? AND account_id IN (${placeholders})
        ORDER BY scheduled_for LIMIT 1`,
    )
    .get(now.toISOString(), ...accountIds) as { id: number } | undefined;
  if (!candidate) return undefined;

  const locked = db
    .prepare(
      `UPDATE posts SET state = 'claimed', claimed_by = ?, claimed_at = ?
        WHERE id = ? AND state = 'approved'`,
    )
    .run(nodeId, now.toISOString(), candidate.id);
  if (locked.changes !== 1) return undefined;

  audit(nodeId, "claimed", candidate.id);
  return getPost(candidate.id);
}

export function markPublished(id: number, permalink: string | null, actor: string) {
  db.prepare(`UPDATE posts SET state='published', published_at=?, permalink=? WHERE id=?`)
    .run(new Date().toISOString(), permalink, id);
  audit(actor, "published", id, permalink ?? undefined);
}

export function markFailed(id: number, error: string, actor: string) {
  db.prepare(`UPDATE posts SET state='failed', failure=? WHERE id=?`).run(error, id);
  audit(actor, "failed", id, error);
}

/** Posts published from one account since a cutoff — the per-account safety rail. */
export function publishedSince(accountId: string, since: Date): { published_at: string }[] {
  return db
    .prepare(
      `SELECT published_at FROM posts
        WHERE account_id = ? AND published_at IS NOT NULL AND published_at >= ?
        ORDER BY published_at DESC`,
    )
    .all(accountId, since.toISOString()) as { published_at: string }[];
}

export function lastPublishedOnSurface(surfaceId: string): Date | null {
  const row = db
    .prepare(
      `SELECT published_at FROM posts WHERE surface_id = ? AND published_at IS NOT NULL
        ORDER BY published_at DESC LIMIT 1`,
    )
    .get(surfaceId) as { published_at: string } | undefined;
  return row ? new Date(row.published_at) : null;
}

export function recordGrant(nonce: string, postId: number, nodeId: string) {
  db.prepare(`INSERT INTO grants (nonce, post_id, node_id, issued_at) VALUES (?,?,?,?)`)
    .run(nonce, postId, nodeId, new Date().toISOString());
}

export function consumeGrant(nonce: string): boolean {
  return (
    db
      .prepare(`UPDATE grants SET consumed_at = ? WHERE nonce = ? AND consumed_at IS NULL`)
      .run(new Date().toISOString(), nonce).changes === 1
  );
}

export function heartbeat(nodeId: string, label: string, agents: number, capacity: number) {
  db.prepare(
    `INSERT INTO nodes (id, label, last_seen, agents, capacity) VALUES (?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET label=excluded.label, last_seen=excluded.last_seen,
                                     agents=excluded.agents, capacity=excluded.capacity`,
  ).run(nodeId, label, new Date().toISOString(), agents, capacity);
}

export function listNodes() {
  return db.prepare(`SELECT id, label, last_seen, agents, capacity FROM nodes`).all() as {
    id: string;
    label: string;
    last_seen: string;
    agents: number;
    capacity: number;
  }[];
}

export function auditTrail(postId: number) {
  return db
    .prepare(`SELECT at, actor, action, detail FROM audit WHERE post_id = ? ORDER BY id`)
    .all(postId) as { at: string; actor: string; action: string; detail: string | null }[];
}

export default db;
