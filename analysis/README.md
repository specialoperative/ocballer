# yield — does this group produce leads?

Takes captured posts and returns the one number that decides whether a set of
groups is worth monitoring: hire-intent posts per 1,000, with an honest
confidence bound.

```bash
npm install
npm run smoke                                   # 14 checks, no keys
npx tsx src/index.ts capture.json               # keyword pass only
ANTHROPIC_API_KEY=sk-ant-... npx tsx src/index.ts capture.json   # full judging
```

Reads the Telegram export the monitor already writes into, or a CSV with a
`text` column (plus `group` / `author` if present).

## Why the confidence bound matters

Zero leads in a sample does not mean the rate is zero. Finding none in 530
posts bounds the true rate at **0.56%** (95%, Clopper-Pearson) — enough to
rule out the 1% break-even, not enough to rule out 0.5%.

| To rule out | Posts needed with zero leads |
| --- | --- |
| 1.0% (break-even for a $500 slot) | 299 |
| 0.5% | 598 |
| 0.2% | 1,497 |

Stopping a test early and calling it zero is the easiest way to kill a product
that works, or keep one that doesn't.

## What counts

- **lead** — someone wants work done on their property. The poster is the buyer.
- **contractor_ad** — a business advertising, or seeking crew. The opposite of a lead.
- **sale** — selling an object, vehicle, or property listing.
- **other** — everything else.

Most posts mentioning a trade are not leads: people sell tools, realtors list
houses, contractors advertise. The keyword pass is generous on purpose — a
false positive costs one model call, a false negative corrupts the number.

## Measured so far

| Group type | Posts | Leads | Rate |
| --- | --- | --- | --- |
| 5 Antelope Valley buy/sell groups | 536 | 0 | < 0.56% |
| Community / town groups | not yet run | — | — |

23% of captured rows were the same post cross-posted to another group, so
content-level dedupe is required before alerting anyone.
