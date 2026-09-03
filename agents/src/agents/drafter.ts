import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { defineAgent } from "../kernel/agent.js";
import type { Business, Campaign, Surface } from "../domain.js";

const DraftSchema = z.object({
  body: z.string().describe("The post. Plain text, no hashtags, no emoji."),
  creativeBrief: z.string().describe("One sentence describing the photo to pair with it."),
  compliant: z.boolean().describe("False if the surface's rules forbid this post."),
  ruleCheck: z.string().describe("How it meets the surface's rules, or why it cannot."),
});

export type Draft = z.infer<typeof DraftSchema>;

const SYSTEM = `You write one post for a local community group, on behalf of a small
business, in the owner's voice.

These groups punish advertising. A post earns its place by being useful or local
first. Write the way a neighbor who happens to own the business would write.

Rules:
- Under 90 words. Short sentences.
- No hashtags, no emoji, no marketing voice.
- Never invent licences, prices, warranties, years in business or reviews. If it
  is not in the supplied facts, it does not go in the post.
- Obey the surface's stated rules exactly. If they forbid business posts, set
  compliant to false and say so in ruleCheck rather than writing something clever.`;

/**
 * □ drafter — writes copy. Holds `draft` and nothing else: it cannot approve
 * its own output, cannot schedule it, and cannot publish it.
 */
export const drafter = defineAgent<
  { business: Business; surface: Surface; campaign: Campaign; theme: string },
  Draft
>({
  name: "drafter",
  capabilities: ["draft"],
  async run({ business, surface, campaign, theme }, ctx) {
    ctx.require("draft");

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 2048,
      system: SYSTEM,
      output_config: { format: zodOutputFormat(DraftSchema) },
      messages: [
        {
          role: "user",
          content: [
            `Business: ${business.name}`,
            `Owner's voice: ${business.voice}`,
            `Surface: ${surface.label} (${surface.platform})`,
            `Surface rules: ${surface.rules || "none stated — assume business posts are tolerated, not welcomed"}`,
            business.facts.length ? `Facts available: ${business.facts.join("; ")}` : "",
            business.neverSay.length ? `Never say: ${business.neverSay.join("; ")}` : "",
            `Theme: ${theme}`,
            `Campaign: ${campaign.id}`,
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
        compliant: false,
        ruleCheck: "Drafting failed; nothing queued rather than queueing something unreviewed.",
      };
    }
    return response.parsed_output;
  },
});
