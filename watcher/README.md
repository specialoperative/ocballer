# Poach — the Watcher

Watches the public feeds in a town, decides which posts are a homeowner actually
looking to hire, and texts the one contractor who owns that town + trade. Under
90 seconds from their post to his phone is the number everything here serves.

```
feed → dedupe → keyword prefilter → intent model → quiet hours → SMS → outcome → Monday report
```

## API keys you need

| Key | What it's for | Where to get it | Required |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | Intent scoring — separates a homeowner with a problem from chatter and contractors advertising | [console.anthropic.com](https://console.anthropic.com/settings/keys) → API keys | Yes |
| `TWILIO_ACCOUNT_SID` | Sending the alert SMS and receiving the 1/2 reply | [console.twilio.com](https://console.twilio.com) → Account Info | Yes (not in dry run) |
| `TWILIO_AUTH_TOKEN` | Same | Same page | Yes (not in dry run) |
| `TWILIO_MESSAGING_SERVICE_SID` | The Messaging Service your A2P 10DLC campaign attaches to | Twilio → Messaging → Services | Yes¹ |
| `FB_COLLECTOR_URL` / `_TOKEN` | Your collector, which supplies public posts | You run it — see below | Only for collector feeds |
| `INGEST_SECRET` | Shared secret protecting `POST /ingest` | Generate: `openssl rand -hex 32` | Recommended |

¹ Or `TWILIO_FROM_NUMBER` for a bare number. Prefer the Messaging Service — carrier
registration attaches to it, and a bare number can't carry a 10DLC campaign.

**Not a key, but on the critical path: A2P 10DLC registration.** Carriers filter
unregistered application-to-person traffic, silently. Register the brand and campaign
in Twilio before real customers depend on the alerts, and note that brand vetting
checks that your business entity, brand name and website domain match — so register
as Poach, on the Poach domain.

Nothing else needs a key. Storage is SQLite on disk; move to Postgres when one box
stops being enough.

## Run it

```bash
npm install
cp .env.example .env                             # fill in the keys above
cp config/territories.example.json config/territories.json
npm run smoke                                    # no keys needed, no SMS sent
npm start                                        # add DRY_RUN=1 to log alerts instead of texting
```

`DRY_RUN=1` prints every alert to the console and needs no Twilio account at all.
Run the first day that way and read what it would have sent — it is the fastest way
to tune keywords before a contractor's phone is on the line.

## Endpoints

| Route | Purpose |
| --- | --- |
| `GET /health` | Liveness, and how many territories are loaded |
| `GET /scorecard?territory=<id>&days=7` | Leads, contacted, booked, median latency |
| `POST /ingest` | Push a post into the pipeline (JSON: `id`, `text`, `group`, `url`, `postedAt`) |
| `POST /sms` | Twilio inbound webhook — contractor texts `1` = contacted, `2` = booked |

Point your Twilio number's messaging webhook at `POST /sms`, or the Monday report
has nothing to count.

## Where collection lives

The Watcher does not log into any platform and does not drive a browser. It reads
publicly visible posts from a collector you run, behind the interface in
`src/sources/collector.ts` — a GET returning `{ posts: [...] }`. That keeps the part
most likely to change, and most sensitive to how you gather public posts, isolated
from the pipeline, and matches what the site promises: read-only, public posts,
never commenting.

Three adapters ship:

- **`collector`** — your feed service, per group or per neighborhood.
- **`rss`** — town boards and municipal feeds. Needs nothing; useful on day one.
- **`ingest`** — anything that can POST. A browser extension, a phone shortcut, or
  you pasting a post by hand during the pilot. This is what makes the manual first
  week work without special-casing it.

## Design decisions worth knowing

**The prefilter is loose, the model is strict.** `match.ts` casts wide because a
missed lead is unrecoverable and a false positive costs one model call. Precision
comes from `classify.ts`, which drops contractors advertising, people answering
someone else's post, and requests for a different trade.

**Quiet-hours alerts are held, not dropped.** A 2am roof leak is still worth $38k at
7am. They queue and go out when the window ends, highest intent first.

**Posts are claimed before classification.** Two overlapping cycles can't both pay to
classify the same post or both text about it. An unstable `id` from a collector is
the one thing that breaks this — it would re-alert every poll.

**Double-claimed slots refuse to boot.** Two contractors on one town + trade is not a
warning, it's the product's promise breaking, so `loadConfig` throws.

**Intent floor is 3/5** (`MIN_INTENT_SCORE` in `pipeline.ts`). Raise it if contractors
say the alerts are noisy; that dial matters more than the keyword list.

## Not built here

Signup, slot availability, Stripe, and the activation queue — that's the backend
behind the Vercel page, a separate service. This is only the Watcher. The Poster
(the `Presence` tier) is also not here.
