import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { env } from "./env.js";
import type { Classification, RawPost, Territory } from "./types.js";
import type { MatchResult } from "./match.js";

const client = new Anthropic({ apiKey: env.anthropicApiKey });

const ClassificationSchema = z.object({
  isLead: z
    .boolean()
    .describe("True only if a homeowner is looking to hire this trade in this town."),
  intentScore: z
    .number()
    .int()
    .min(1)
    .max(5)
    .describe("1 = idle chatter, 3 = real but unhurried, 5 = emergency happening now."),
  urgency: z.enum(["emergency", "this_week", "planning", "none"]),
  reason: z.string().describe("One sentence. Why this was kept or dropped."),
  suggestedReply: z
    .string()
    .describe("A comment the contractor can paste, in their voice. Two sentences max."),
});

const SYSTEM = `You screen neighborhood posts for a home-services lead service.

A post is a lead ONLY when a homeowner (or renter/landlord) needs work done that
this trade performs, in or near this town, and would plausibly hire someone for it.

Not leads, however much they mention the trade:
- Contractors advertising their own services, or asking for subs and crew.
- People answering someone else's request, or naming a company they already used.
- Complaints, storm chatter, price gossip, "is this a fair quote", town politics.
- Requests for a different trade that happens to share vocabulary.
- Posts already saturated with contractor replies where the poster says they are set.

Scoring intent:
5  active emergency, damage happening now ("water everywhere", "no heat, kids home")
4  needs someone this week, specific job, ready to hire
3  real project, gathering names, no deadline stated
2  vague or early ("someday we want to redo the kitchen")
1  not really hiring

The suggested reply is a public comment, written as the contractor. Local, specific,
plain. Reference the actual problem. Offer a concrete next step. Never invent
credentials, prices, license numbers, or years in business. No emoji, no hard sell.`;

export async function classify(
  post: RawPost,
  territory: Territory,
  match: MatchResult,
): Promise<Classification> {
  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 1024,
    system: SYSTEM,
    // Classification is a narrow task — low effort keeps per-post cost sane at
    // volume. Raise to "medium" if you see intent scores drifting.
    output_config: {
      effort: "low",
      format: zodOutputFormat(ClassificationSchema),
    },
    messages: [
      {
        role: "user",
        content: [
          `Town: ${territory.town}, ${territory.state}`,
          `Trade: ${territory.trade}`,
          `Contractor: ${territory.contractor.businessName}`,
          territory.contractor.voiceNote ? `Their voice: ${territory.contractor.voiceNote}` : "",
          `Feed: ${post.groupName}`,
          `Keyword hits: ${match.terms.join(", ") || "none"}`,
          `Asking phrasing present: ${match.hasAskPhrasing ? "yes" : "no"}`,
          "",
          "Post:",
          post.text,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });

  // Guard before reading content: a refusal returns HTTP 200 with no parsed output.
  if (response.stop_reason === "refusal") {
    return {
      isLead: false,
      intentScore: 1,
      urgency: "none",
      reason: "Model declined to classify this post; skipped rather than guessed at.",
      suggestedReply: "",
    };
  }

  const parsed = response.parsed_output;
  if (!parsed) {
    return {
      isLead: false,
      intentScore: 1,
      urgency: "none",
      reason: "Classification failed to parse; post skipped rather than guessed at.",
      suggestedReply: "",
    };
  }

  return parsed;
}
