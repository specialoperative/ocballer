import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { env } from "./env.js";
import type { Client, Target } from "./types.js";

const client = new Anthropic({ apiKey: env.anthropicApiKey });

const DraftSchema = z.object({
  body: z.string().describe("The post itself. Plain text, no hashtags, no emoji."),
  creativeBrief: z
    .string()
    .describe("One sentence describing the photo to pair with it, from work they have actually done."),
  ruleCheck: z
    .string()
    .describe("How this post satisfies the group's stated rules, or why it cannot."),
  compliant: z.boolean().describe("False if the group's rules forbid this post."),
});

export type DraftedPost = z.infer<typeof DraftSchema>;

const SYSTEM = `You write a single post for a local neighborhood group, on behalf of a
home-services business, in the owner's voice.

These groups punish advertising. A post earns its place by being useful or local
first. Write the way a neighbor who happens to own the business would write.

Rules:
- Under 90 words. Short sentences.
- No hashtags, no emoji, no marketing voice, no "reach out", no "we pride ourselves".
- No urgency manufacturing, no discounts unless given in the talking points.
- Never invent licences, certifications, prices, warranties, years in business, or
  reviews. If it is not in the talking points, it does not go in the post.
- Mention the town by name. Sound like it was written this week, not a template.
- Obey the group's own rules exactly. If they forbid business posts outright, set
  compliant to false and explain in ruleCheck rather than writing something clever.`;

export async function draftPost(
  business: Client,
  target: Target,
  seasonalNote: string,
): Promise<DraftedPost> {
  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 2048,
    system: SYSTEM,
    output_config: { format: zodOutputFormat(DraftSchema) },
    messages: [
      {
        role: "user",
        content: [
          `Business: ${business.businessName} — ${business.trade} in ${business.town}, ${business.state}`,
          `Owner's voice: ${business.voiceNote}`,
          `Group: ${target.groupName} (${target.platform})`,
          `Group rules: ${target.rules || "none stated — assume business posts are tolerated but not welcomed"}`,
          business.talkingPoints.length ? `Talking points: ${business.talkingPoints.join("; ")}` : "",
          business.neverSay.length ? `Never say: ${business.neverSay.join("; ")}` : "",
          `Time of year: ${seasonalNote}`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    return {
      body: "",
      creativeBrief: "",
      ruleCheck: "Drafting failed; nothing queued rather than queueing something unreviewed.",
      compliant: false,
    };
  }

  return response.parsed_output;
}

/** Cheap seasonal hook so a week's posts aren't interchangeable. */
export function seasonalNote(now: Date, trade: string): string {
  const month = now.getUTCMonth();
  const season =
    month <= 1 || month === 11
      ? "deep winter — freeze damage, heating strain, storm cleanup"
      : month <= 4
        ? "spring — winter damage showing up, people planning projects"
        : month <= 7
          ? "summer — heat load, storm season, outdoor work weather"
          : "fall — pre-winter checks, people beating the first freeze";
  return `${season}. Trade context: ${trade}.`;
}
