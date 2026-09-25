import type { Territory, Trade } from "./types.js";

/**
 * Cheap keyword prefilter. Runs on every post before the model does, because
 * classifying every post in every group would cost more than the subscription.
 *
 * Deliberately loose: it is a funnel, not a decision. Precision comes from
 * classify.ts. Missing a lead here is unrecoverable; a false positive costs
 * one model call.
 */
const TRADE_TERMS: Record<Trade, string[]> = {
  Roofing: [
    "roof", "roofer", "roofing", "shingle", "shingles", "slate", "gutter", "gutters",
    "soffit", "fascia", "flashing", "skylight", "ice dam", "leak", "leaking", "chimney",
  ],
  HVAC: [
    "hvac", "furnace", "boiler", "heat", "heating", "no heat", "ac", "a/c", "air conditioner",
    "air conditioning", "central air", "mini split", "ductless", "duct", "thermostat",
    "heat pump", "not cooling", "not heating",
  ],
  Plumbing: [
    "plumber", "plumbing", "no hot water", "hot water", "water heater", "burst", "pipe",
    "pipes", "clog", "clogged", "drain", "sewer", "septic", "toilet", "faucet", "sump pump",
    "water everywhere", "flooding", "leak",
  ],
  Electrical: [
    "electrician", "electrical", "outlet", "outlets", "breaker", "panel", "fuse", "wiring",
    "rewire", "generator", "ev charger", "recessed", "no power", "sparking", "flickering",
  ],
  "Remodel / GC": [
    "contractor", "general contractor", "remodel", "renovation", "renovate", "addition",
    "kitchen", "bathroom", "basement", "finish", "framing", "drywall", "permit", "architect",
  ],
  Other: [],
};

/** Phrasings that signal someone is asking for a person, not chatting. */
const ASK_TERMS = [
  // "anyone have" also covers "does anyone have"; keep the shorter form.
  "anyone know", "anyone have", "anyone used", "anyone recommend", "can anyone recommend",
  "any recommendations", "recommendations for", "recommend a", "recommend someone",
  "looking for", "in need of", "need someone", "need a", "know a good", "any good",
  "who do you use", "who did you use", "who should i call", "who do i call",
  "any suggestions", "asking for a friend", "reputable", "trustworthy", "quotes",
  "estimate", "asap",
];

export interface MatchResult {
  matched: boolean;
  /** Terms that hit — carried into the model prompt and into keyword tuning. */
  terms: string[];
  hasAskPhrasing: boolean;
}

export function matchPost(text: string, territory: Territory): MatchResult {
  const haystack = ` ${text.toLowerCase().replace(/\s+/g, " ")} `;

  const candidates = [
    ...TRADE_TERMS[territory.trade],
    ...territory.keywords.map((keyword) => keyword.toLowerCase()),
  ];

  const terms = candidates.filter((term) => haystack.includes(` ${term} `) || haystack.includes(`${term} `));
  const hasAskPhrasing = ASK_TERMS.some((phrase) => haystack.includes(phrase));

  // A trade term alone is enough to reach the model — "roof is leaking" never
  // says "anyone know". Ask phrasing alone is not: it is usually a plumber
  // being recommended in a thread about something else.
  return { matched: terms.length > 0, terms, hasAskPhrasing };
}

export function tradeTerms(trade: Trade): string[] {
  return TRADE_TERMS[trade];
}
