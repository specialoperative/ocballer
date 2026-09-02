/** A business paying for the Presence add-on. */
export interface Client {
  id: string;
  businessName: string;
  town: string;
  state: string;
  trade: string;
  /** Where approval requests go. E.164. */
  approverPhone: string;
  /** Shapes the copy. Their words, not marketing voice. */
  voiceNote: string;
  /** Things they actually want mentioned — services, service area, offers. */
  talkingPoints: string[];
  /** Claims the copy may never make, e.g. licence numbers, warranties, prices. */
  neverSay: string[];
  targets: string[];
  timezone: string;
}

/** One group we may post into, and the rules that group enforces. */
export interface Target {
  id: string;
  groupName: string;
  platform: "facebook" | "nextdoor" | "other";
  /** False keeps a group in config but off-limits — the common case. */
  allowed: boolean;
  /** Some groups permit business posts only on a given weekday. */
  promoWeekday?: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
  /** Hard floor on how often anyone may post here. */
  minDaysBetweenPosts: number;
  /** Notes from the group's own pinned rules, given to the drafter verbatim. */
  rules: string;
}

export type DraftStatus =
  | "drafted"
  | "approved"
  | "rejected"
  | "published"
  | "failed"
  | "expired";

export interface Draft {
  id: number;
  clientId: string;
  targetId: string;
  body: string;
  /** What the image should show. Creative is approved alongside the copy. */
  creativeBrief: string;
  scheduledFor: string;
  status: DraftStatus;
}

/**
 * A single-use, scope-limited permission to publish exactly one draft to
 * exactly one group. This is what the posting-only agent receives — never
 * credentials, never a second draft, never a second attempt.
 */
export interface PublishGrant {
  draftId: number;
  targetId: string;
  nonce: string;
  expiresAt: string;
  signature: string;
}

export interface PublishResult {
  ok: boolean;
  permalink?: string;
  error?: string;
}

export interface Publisher {
  name: string;
  publish(grant: PublishGrant, body: string): Promise<PublishResult>;
}
