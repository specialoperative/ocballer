export interface CapturedPost {
  id: string;
  group: string;
  author: string | null;
  text: string;
  capturedAt: string;
}

export type Verdict = "lead" | "contractor_ad" | "sale" | "other";

export interface Judged extends CapturedPost {
  verdict: Verdict;
  reason: string;
  trade?: string;
}
