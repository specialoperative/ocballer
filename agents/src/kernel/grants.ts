import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { consumeGrant, getPost, recordGrant } from "./store.js";

/**
 * A grant is the only thing that crosses from the control node to an edge node.
 * It names one post, one surface, one node; it expires; it works once.
 */
export interface Grant {
  postId: number;
  surfaceId: string;
  nodeId: string;
  nonce: string;
  expiresAt: string;
  signature: string;
}

function secret(): string {
  const value = process.env.GRANT_SECRET;
  if (!value) throw new Error("GRANT_SECRET is not set; refusing to sign grants.");
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function mintGrant(
  postId: number,
  surfaceId: string,
  nodeId: string,
  ttlMinutes = 10,
): Grant {
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
  const payload = `${postId}.${surfaceId}.${nodeId}.${nonce}.${expiresAt}`;
  recordGrant(nonce, postId, nodeId);
  return { postId, surfaceId, nodeId, nonce, expiresAt, signature: sign(payload) };
}

export function verifyGrant(grant: Grant): boolean {
  const payload = `${grant.postId}.${grant.surfaceId}.${grant.nodeId}.${grant.nonce}.${grant.expiresAt}`;
  if (!equal(sign(payload), grant.signature)) return false;
  return new Date(grant.expiresAt).getTime() > Date.now();
}

/** Redeem a grant for exactly one payload. Every failure mode is explicit. */
export function redeem(grant: Grant): { ok: true; body: string; mediaUrl: string | null } | { ok: false; error: string } {
  if (!verifyGrant(grant)) return { ok: false, error: "grant invalid or expired" };

  const post = getPost(grant.postId);
  if (!post) return { ok: false, error: "unknown post" };
  if (post.surfaceId !== grant.surfaceId) return { ok: false, error: "grant surface mismatch" };
  if (post.state !== "claimed" && post.state !== "approved") {
    return { ok: false, error: `post is ${post.state}, not approved` };
  }
  if (!consumeGrant(grant.nonce)) return { ok: false, error: "grant already used" };

  return { ok: true, body: post.body, mediaUrl: post.mediaUrl };
}
