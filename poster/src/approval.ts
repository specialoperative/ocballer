import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env.js";
import { recordGrant } from "./db.js";
import type { PublishGrant } from "./types.js";

/**
 * One-tap approval links, and the single-use grant the posting agent runs on.
 *
 * The design point from the notes: the process holding the account never
 * publishes, and the process that publishes never holds the account. What
 * crosses that line is a signed grant naming exactly one draft and one group,
 * good once, and expiring on its own.
 */
function sign(payload: string): string {
  return createHmac("sha256", env.approvalSecret).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function approvalToken(draftId: number, action: "approve" | "reject", expiresAt: Date): string {
  const payload = `${draftId}.${action}.${expiresAt.getTime()}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyApprovalToken(
  token: string,
): { draftId: number; action: "approve" | "reject" } | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [rawId, action, rawExpiry, signature] = parts as [string, string, string, string];
  if (action !== "approve" && action !== "reject") return null;
  if (!safeEqual(sign(`${rawId}.${action}.${rawExpiry}`), signature)) return null;
  if (Number.parseInt(rawExpiry, 10) < Date.now()) return null;
  return { draftId: Number.parseInt(rawId, 10), action };
}

export function approvalLink(draftId: number, action: "approve" | "reject", expiresAt: Date): string {
  return `${env.publicBaseUrl}/d/${draftId}/${action}?t=${encodeURIComponent(
    approvalToken(draftId, action, expiresAt),
  )}`;
}

/** Minted only after an approval is on record, and only at publish time. */
export function mintGrant(draftId: number, targetId: string, ttlMinutes = 10): PublishGrant {
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
  const payload = `${draftId}.${targetId}.${nonce}.${expiresAt}`;
  recordGrant(nonce, draftId);
  return { draftId, targetId, nonce, expiresAt, signature: sign(payload) };
}

/** Run by the publisher before it touches the account. */
export function verifyGrant(grant: PublishGrant): boolean {
  const payload = `${grant.draftId}.${grant.targetId}.${grant.nonce}.${grant.expiresAt}`;
  if (!safeEqual(sign(payload), grant.signature)) return false;
  return new Date(grant.expiresAt).getTime() > Date.now();
}
