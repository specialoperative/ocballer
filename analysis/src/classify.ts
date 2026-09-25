import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { CapturedPost, Judged, Verdict } from "./types.js";

/**
 * Two passes. The keyword pass is free and catches anything that could
 * conceivably be a lead; the model pass decides. Only posts the keyword pass
 * lets through cost money, which is what makes running this over thousands of
 * posts affordable.
 *
 * The keyword pass is deliberately generous: a false positive costs one model
 * call, a false negative corrupts the measurement.
 */
const TRADE =
  /roof|plumb|hvac|\ba\/?c\b|air condition|furnace|heat(?:ing|er)|electric|handyman|contractor|landscap|lawn|tree (?:trim|remov|serv)|fence|concrete|drywall|paint(?:er|ing)|remodel|renovat|floor(?:ing)?|garage door|pest|mold|septic|water heater|pool (?:clean|serv)|clean(?:er|ing)|mov(?:er|ing)|haul|repair|install|leak|clog|broken/i;

const ASK =
  /anyone know|any ?one know|recommend|referral|looking for|need (?:a|an|some)|who (?:do|did|can)|any good|in need of|suggestion|help me find|know (?:a|any) good|quote|estimate|asap|emergency|does anyone/i;

export function couldBeLead(text: string): boolean {
  return TRADE.test(text) || ASK.test(text);
}

const JudgementSchema = z.object({
  verdict: z.enum(["lead", "contractor_ad", "sale", "other"]),
  trade: z.string().describe("The trade wanted, or empty when not a lead."),
  reason: z.string().describe("One short clause."),
});

const SYSTEM = `You label neighborhood-group posts for a lead-generation study.
Accuracy of the count matters more than being generous.

- "lead": someone wants work done on their home or property and would plausibly
  hire for it. Asking for a recommendation, describing a problem needing a trade,
  or requesting quotes all count. The poster is the buyer.
- "contractor_ad": a business advertising its own services, or seeking crew/subs.
  The poster is the seller. This is the opposite of a lead.
- "sale": selling or giving away an object, a vehicle, or a property listing.
- "other": anything else — chatter, events, lost pets, questions with no trade.

A post mentioning a trade is usually NOT a lead: most are people selling tools,
realtors listing houses, or contractors advertising. Label "lead" only when
someone wants work performed for them.`;

export async function judge(posts: CapturedPost[], apiKey?: string): Promise<Judged[]> {
  const out: Judged[] = [];
  const candidates: CapturedPost[] = [];

  for (const post of posts) {
    if (couldBeLead(post.text)) candidates.push(post);
    else out.push({ ...post, verdict: "other", reason: "no trade or asking language" });
  }

  if (!apiKey) {
    // Keyword-only mode: honest but coarse. Flags candidates rather than
    // asserting they are leads, so the count is reported as an upper bound.
    for (const post of candidates) {
      out.push({ ...post, verdict: "other", reason: "keyword candidate; not judged (no API key)" });
    }
    return out;
  }

  const client = new Anthropic({ apiKey });
  for (const post of candidates) {
    try {
      const response = await client.messages.parse({
        model: "claude-opus-5",
        max_tokens: 512,
        system: SYSTEM,
        output_config: { effort: "low", format: zodOutputFormat(JudgementSchema) },
        messages: [{ role: "user", content: `Group: ${post.group}\n\nPost:\n${post.text.slice(0, 2000)}` }],
      });

      const parsed = response.stop_reason === "refusal" ? null : response.parsed_output;
      out.push({
        ...post,
        verdict: (parsed?.verdict ?? "other") as Verdict,
        reason: parsed?.reason ?? "unjudged",
        trade: parsed?.trade || undefined,
      });
    } catch (error) {
      out.push({ ...post, verdict: "other", reason: `judge failed: ${(error as Error).message}` });
    }
  }
  return out;
}

export function candidateCount(posts: CapturedPost[]): number {
  return posts.filter((post) => couldBeLead(post.text)).length;
}
