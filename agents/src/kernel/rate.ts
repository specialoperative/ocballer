import { publishedSince } from "./store.js";
import type { Account } from "../domain.js";

/**
 * The per-account safety rail, checked immediately before a grant is minted.
 *
 * This is separate from the surface's cadence floor on purpose: the surface
 * rule protects the group from one business, this rule protects one account
 * from looking automated across every surface it touches.
 */
export function accountMayPost(account: Account, now: Date): { ok: boolean; reason?: string } {
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const recent = publishedSince(account.id, dayAgo);

  if (recent.length >= account.maxPostsPerDay) {
    return { ok: false, reason: `${account.id} hit its daily ceiling (${account.maxPostsPerDay})` };
  }

  const last = recent[0];
  if (last) {
    const minutes = (now.getTime() - new Date(last.published_at).getTime()) / 60_000;
    if (minutes < account.minMinutesBetweenPosts) {
      return {
        ok: false,
        reason: `${account.id} posted ${Math.floor(minutes)}m ago, floor is ${account.minMinutesBetweenPosts}m`,
      };
    }
  }

  return { ok: true };
}
