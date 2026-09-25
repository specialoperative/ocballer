/**
 * The domain from the notes, kept generic.
 *
 *   □  agent     — a narrowly scoped worker
 *   ○  business  — the SMB being served
 *   △  surface   — a group or page an agent sits on
 *
 * Nothing here knows about towns, trades or territories. A surface is any place
 * posts appear. That is what lets one runtime serve a roofer, a barber shop and
 * a nonprofit without branching.
 */

export interface Business {
  id: string;
  name: string;
  /** E.164 — where approval requests go. */
  phone: string;
  /** Shapes generated copy: the owner's own words. */
  voice: string;
  /** Facts the copy may use. Anything absent must not be invented. */
  facts: string[];
  /** Claims the copy may never make. */
  neverSay: string[];
}

/** △ — somewhere posts appear. `platform` is a label, not a code path. */
export interface Surface {
  id: string;
  label: string;
  platform: string;
  /** Which account (and therefore which session agent) can reach it. */
  accountId: string;
  allowed: boolean;
  /** The surface's own stated rules, handed to the drafter verbatim. */
  rules: string;
  minHoursBetweenPosts: number;
}

/** An account an edge node holds a session for. Never leaves that node. */
export interface Account {
  id: string;
  label: string;
  platform: string;
  /** Which edge node holds it. One account lives on exactly one node. */
  nodeId: string;
  /** Safety ceiling for this account, independent of how many posts are due. */
  maxPostsPerDay: number;
  minMinutesBetweenPosts: number;
}

/** ○ + △ + cadence — post for this business, here, on this schedule. */
export interface Campaign {
  id: string;
  businessId: string;
  surfaceIds: string[];
  /** 0 = Sunday. The notes said M/W/T; that is config, not law. */
  postDays: number[];
  postHourRange: { start: number; end: number };
  timezone: string;
  themes: string[];
}

export type PostState =
  | "drafted"
  | "approved"
  | "rejected"
  | "claimed"
  | "published"
  | "failed";

export interface Post {
  id: number;
  campaignId: string;
  surfaceId: string;
  accountId: string;
  body: string;
  creativeBrief: string;
  mediaUrl: string | null;
  scheduledFor: string;
  state: PostState;
}
