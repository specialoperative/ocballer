import { createHash } from "node:crypto";
import type { Judged } from "./types.js";

/**
 * Clopper-Pearson upper bound for k=0. With no leads observed, this is the
 * honest ceiling on the true rate — not zero, and not 1/n.
 */
export function upperBoundZero(n: number, confidence = 0.95): number {
  if (n === 0) return 1;
  return 1 - Math.pow(1 - confidence, 1 / n);
}

/** Posts needed to rule out a rate, assuming none are found. */
export function samplesToRuleOut(rate: number, confidence = 0.95): number {
  return Math.ceil(Math.log(1 - confidence) / Math.log(1 - rate));
}

const fingerprint = (text: string) =>
  createHash("md5").update(text.replace(/\s+/g, " ").slice(0, 120).toLowerCase()).digest("hex");

export interface Report {
  posts: number;
  unique: number;
  duplicateRate: number;
  leads: number;
  contractorAds: number;
  rate: number;
  upperBound: number;
  verdict: string;
  byGroup: { group: string; posts: number; leads: number }[];
  leadExamples: Judged[];
}

/** 8 qualified leads a month for one trade is the $500 slot's break-even. */
const BREAK_EVEN = 0.01;

export function report(judged: Judged[]): Report {
  const unique = new Set(judged.map((post) => fingerprint(post.text))).size;
  const leads = judged.filter((post) => post.verdict === "lead");
  const rate = judged.length ? leads.length / judged.length : 0;

  const groups = new Map<string, { posts: number; leads: number }>();
  for (const post of judged) {
    const entry = groups.get(post.group) ?? { posts: 0, leads: 0 };
    entry.posts += 1;
    if (post.verdict === "lead") entry.leads += 1;
    groups.set(post.group, entry);
  }

  const upperBound = leads.length === 0 ? upperBoundZero(judged.length) : rate;

  let verdict: string;
  if (leads.length === 0) {
    verdict =
      upperBound < BREAK_EVEN
        ? `No leads in ${judged.length} posts. True rate is below ${(upperBound * 100).toFixed(2)}% — under the 1% break-even. These groups cannot carry a $500 slot.`
        : `No leads yet, but ${judged.length} posts only rules out rates above ${(upperBound * 100).toFixed(2)}%. Need ${samplesToRuleOut(BREAK_EVEN)} posts to rule out 1%. Keep capturing.`;
  } else if (rate >= BREAK_EVEN) {
    verdict = `${leads.length} leads in ${judged.length} posts (${(rate * 100).toFixed(2)}%) — at or above the 1% break-even. These groups are worth monitoring.`;
  } else {
    verdict = `${leads.length} leads in ${judged.length} posts (${(rate * 100).toFixed(2)}%) — below the 1% break-even. Thin unless you add groups per contractor or lower the price.`;
  }

  return {
    posts: judged.length,
    unique,
    duplicateRate: judged.length ? 1 - unique / judged.length : 0,
    leads: leads.length,
    contractorAds: judged.filter((post) => post.verdict === "contractor_ad").length,
    rate,
    upperBound,
    verdict,
    byGroup: [...groups.entries()]
      .map(([group, entry]) => ({ group, ...entry }))
      .sort((a, b) => b.posts - a.posts),
    leadExamples: leads.slice(0, 10),
  };
}

export function render(result: Report): string {
  const lines = [
    `posts captured      ${result.posts}`,
    `unique posts        ${result.unique}  (${(result.duplicateRate * 100).toFixed(0)}% duplicates across groups)`,
    `hire-intent leads   ${result.leads}`,
    `contractor ads      ${result.contractorAds}`,
    ``,
    `VERDICT: ${result.verdict}`,
    ``,
    `by group:`,
    ...result.byGroup.map(
      (row) => `  ${String(row.leads).padStart(3)} leads / ${String(row.posts).padStart(4)} posts   ${row.group}`,
    ),
  ];

  if (result.leadExamples.length) {
    lines.push("", "leads found:");
    for (const lead of result.leadExamples) {
      lines.push(`  [${lead.trade ?? "?"}] ${lead.text.slice(0, 100).replace(/\n/g, " ")}`);
    }
  }
  return lines.join("\n");
}
