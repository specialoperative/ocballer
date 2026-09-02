# Poach — the Poster

Drafts localized group posts for a client, holds every one of them until the owner
approves it, then publishes on a staggered Mon / Wed / Thu schedule. Sold as the
**Presence** add-on.

```
weekly batch → drafts → owner approves or edits → scheduled → single-use grant → published → comments → Watcher
```

The two rules the whole design serves, both from the original notes: **nothing
publishes without an explicit approval**, and **the process that holds the account
is not the process that posts**.

## API keys you need

| Key | For | Where |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Drafting the posts | console.anthropic.com → API keys |
| `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` | The "N posts ready to review" SMS | console.twilio.com |
| `TWILIO_MESSAGING_SERVICE_SID` | Same 10DLC campaign as the Watcher | Twilio → Messaging → Services |
| `APPROVAL_SECRET` | Signs one-tap approve/reject links and publish grants | `openssl rand -hex 32` |
| `PUBLISHER_TOKEN` | Authenticates the posting-only agent to this service | `openssl rand -hex 32` |
| `PUBLISHER_URL` | Where that agent listens | You run it |

No account credentials appear in this list, and that is the point — see below.

## The □² separation, concretely

Your notes said the agent with the login should spawn a second agent strictly for
posting. Here is what that is in code:

- This service holds **no session and no credentials**. It cannot post.
- At publish time it mints a **grant**: an HMAC-signed token naming exactly one
  draft and one group, valid ~10 minutes, usable once.
- The posting agent — a separate process you run, the only thing holding the
  account — calls `POST /publish/authorize` with that grant and gets back **one
  body**. Not the queue, not another draft, not a credential.
- The nonce is burned on first use. A replayed grant is refused (`consumeGrant`).

So a compromised or misbehaving publisher can post one already-approved body to one
already-approved group, once. That is the entire blast radius.

## The approval gate

Nothing reaches a group unreviewed:

- The weekly batch drafts and queues; it never schedules anything as approved.
- The owner gets one SMS with a review link. The page shows each post, the group,
  the scheduled time, and the photo brief — editable in place.
- Approve, edit-then-approve, or reject. Rejected posts are not redrafted that week.
- `authorizePublish` refuses anything not in `approved` state, so an unapproved
  draft cannot publish even if the scheduler is wrong.
- Every transition is written to an append-only `audit` table: what was drafted,
  what the owner changed, who approved, what went live. `GET /d/:id/audit`.

## Group rules are opt-in

A group is off-limits (`allowed: false`) unless you have explicitly cleared it. Each
target carries its own stated rules, a promo-weekday restriction, and a hard floor on
posting frequency — and the group's rules go to the drafter verbatim. A group that
forbids business posts produces **no draft at all** rather than a draft the owner has
to catch.

## Run it

```bash
npm install
cp .env.example .env
cp config/clients.example.json config/clients.json
npm run smoke                  # 20 checks, no keys, nothing published
npm run draft -- deluca-roofing   # draft this week's batch
npm start                      # scheduler + review server
```

`DRY_RUN=1` drafts and logs, but never texts and never publishes. Run the first
several weeks that way and read what it would have posted.

## Endpoints

| Route | Purpose |
| --- | --- |
| `GET /review/:clientId` | The owner's review page — edit, approve, reject |
| `GET /d/:id/approve\|reject?t=` | One-tap from the SMS, signed and expiring |
| `POST /d/:id/edit` | Save the owner's wording, optionally approving |
| `POST /publish/authorize` | The posting agent redeems a grant for one body |
| `POST /comments` | Comments on published posts, forwarded to the Watcher |
| `GET /d/:id/audit` | The full trail for one post |

## Honest risk

The Watcher is read-only and stays inside what the site promises visitors. The Poster
is not: it acts on a business's account, which is against the platform's automation
rules whatever the architecture. The separation above limits damage and gives you a
defensible record of consent — it does not make the account durable. Price and pitch
Presence knowing an account can be lost, and decide in advance what a customer's
coverage looks like when one is.
