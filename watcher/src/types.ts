/** A post pulled from a public feed, before we know whether it means anything. */
export interface RawPost {
  /** Stable id from the source. Dedupe key, so it must not change between polls. */
  externalId: string;
  /** e.g. "facebook:scarsdale-moms", "nextdoor:scarsdale" */
  source: string;
  platform: "facebook" | "nextdoor" | "other";
  /** The group/feed as a human would name it — goes into the SMS. */
  groupName: string;
  authorName: string | null;
  text: string;
  url: string | null;
  postedAt: Date;
}

export type Trade =
  | "Roofing"
  | "HVAC"
  | "Plumbing"
  | "Electrical"
  | "Remodel / GC"
  | "Other";

/** One town + trade, sold to exactly one contractor. The unit of inventory. */
export interface Territory {
  id: string;
  town: string;
  state: string;
  trade: Trade;
  tier: "territory" | "premium";
  /** Extra terms on top of the trade defaults in match.ts. */
  keywords: string[];
  contractor: {
    name: string;
    businessName: string;
    /** E.164, e.g. +19145551234. Verified at signup. */
    phone: string;
    /** Used to write the suggested reply in their voice. */
    voiceNote?: string;
  };
  /** Source ids this territory listens to. */
  sources: string[];
  timezone: string;
  /** Local hours. Alerts inside the window are held, not dropped. */
  quietHours: { start: number; end: number };
  maxAlertsPerDay: number;
  /** Free week ends; used by the Monday report and the close. */
  trialEndsAt?: string;
}

export interface Classification {
  isLead: boolean;
  /** 1-5, shown to the contractor as "urgency N/5". */
  intentScore: number;
  urgency: "emergency" | "this_week" | "planning" | "none";
  /** Why it was kept or dropped — read this when tuning keywords. */
  reason: string;
  /** Written in the contractor's voice, ready to paste. */
  suggestedReply: string;
}

/** A feed the Watcher can poll. How it is collected is the adapter's business. */
export interface Source {
  id: string;
  platform: RawPost["platform"];
  /** Posts newer than `since`, newest first. Must not throw on an empty feed. */
  fetch(since: Date): Promise<RawPost[]>;
}
