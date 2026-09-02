# BirdDog — Build Brief

*Two agents, one pilot. Drafted 2 Sep 2026. Supersedes the Facebook-cycle notes.*

A watcher that texts a contractor the second someone in their town asks for their
trade — and a poster that keeps them visible in the groups the rest of the week.

---

## 1. Two agents, not one product

The legend in the notes — □ agent, ○ business, △ group — describes two separate
machines that share plumbing. Only one is sellable this month.

- **The Poster (□ → △).** Scheduled posting into neighborhood groups on behalf of a
  business, with the business approving copy and creative before anything goes out.
- **The Watcher (□ sits on △).** Sits on group feeds, reloads, scans for keywords,
  texts the business when someone asks for their trade. This is the speed-to-lead
  product wearing a different hat.

ICP: home services, restaurants, tattoo and barber shops, nonprofits. The Watcher is
much stronger for home services — "anyone know a good roofer in Scarsdale?" is a
question people actually type into neighborhood groups; a plate of food is not.

**Sequencing:** lead with the Watcher. It demos in one text message, shows ROI the
first week, and needs no credentials from the customer. The Poster requires the
business's login on day one — the hardest ask in the product and the riskiest thing
you can hold. Sell the Watcher, earn the trust, then offer posting.

---

## 2. The name

A "bird dog" is already trade vernacular for the person who finds you work and brings
it to you. It needs no explanation to this ICP, and it literally describes the
Watcher: sits, watches, flushes out the lead, retrieves it.

| Name | Read |
| --- | --- |
| **BirdDog** *(recommended)* | Trade-native, describes the mechanism. `birddog.com` / `.tv` are gone to a video hardware brand — take `getbirddog.com` or `birddogleads.com`, register as **BirdDog Leads**. |
| First Knock | Pure speed positioning — be first at the door. Cleaner for a cold text, weaker once the Poster joins. |
| Territory | Sells the exclusivity (one contractor per town per trade), which is the real moat. Says nothing about leads. |

### Rules the name has to survive

- **No Facebook, FB, Meta, Group or Book in it.** Trademark exposure aside, don't name
  the company after the platform you're scraping — and it becomes a liability the day
  you add Nextdoor, Craigslist and town boards.
- **No "AI" or "Agent."** This ICP discounts it, and it advertises automation to the
  platform you'd rather stay boring to.
- **Own the .com.** A `.io` or `.ai` reads as a scam to a contractor already primed to
  expect one.
- **Name the outcome, not the mechanism.** The mechanism is what's most likely to
  change under you.

### Why this settles now, not after the pilot

SMS *is* the product, so you need A2P 10DLC registration with the carriers through
Twilio. That vetting checks that your brand name, registered business entity and
website domain all match. Pick the name → register the LLC → buy the matching .com →
put the site up → then file the 10DLC campaign. Renaming after registration means
re-vetting, and unregistered traffic gets filtered or dropped silently, which kills the
product without an error message.

Whatever the company is called, keep the internal names **the Watcher** and **the
Poster**. Clear on an ops board, and they let you sell monitoring standalone without
the brand implying you also auto-post.

---

## 3. Agent 2 — the Watcher (build sequence)

Goal: under 90 seconds from someone posting "need a plumber in Rye" to that plumber's
phone buzzing. Everything below serves that number.

1. **Define the territory grid.** Town × trade is the unit of inventory and the unit of
   sale. Seed with towns you can actually get into, not the whole county.
2. **Get into the groups — start now.** A warmed, human-looking account requesting to
   join each neighborhood group. Admin approval takes days to weeks and some never
   approve. This is the long pole of the entire business; every week of delay is a week
   of dead inventory.
3. **Write the keyword list per trade.** Not just the noun — the ask-phrasings and the
   symptoms: "roofer", "roof leak", "shingles", "anyone know a good", "recommendations
   for", plus common misspellings. People describe the problem more often than the trade.
4. **Build the poll loop.** Persistent browser session, each group's feed sorted by
   recent, on an interval with jitter so the cadence isn't machine-regular. Dedupe on
   post ID so one post never fires twice.
5. **Classify before alerting.** An LLM pass on each new post: real hire intent, this
   trade, this town? This is what separates a product from a keyword firehose — it kills
   "anyone have a recommendation for a good preschool" before it reaches the phone.
6. **Fire the SMS.** What was asked, which group, who asked, a direct link, and a
   suggested reply they can paste. The suggested reply is what turns a notification into
   a closed job.
7. **Quiet hours and a daily cap.** No 2am texts, ceiling on alerts per day. One
   irrelevant 11pm buzz costs more trust than three good leads earn.
8. **The business replies — not the agent.** They comment in the group themselves, in
   their own voice. Auto-replying is the fastest way to get an account killed and the
   customer's name attached to spam. Hold this line even when customers ask you to
   cross it.
9. **Log every outcome.** Alert sent, replied or not, job won or not. At the end of the
   free week this log *is* the close: "we sent you eleven, you replied to four, you
   booked two."

---

## 4. Agent 1 — the Poster (build sequence)

The notes already contain the important architectural instinct: the agent that holds
the credentials is not the agent that posts.

1. **Credential handoff — the hard ask.** Prefer a Page role invite or delegated access
   over holding a password wherever the platform allows it; a stored customer password
   is a liability you carry indefinitely, including after they churn.
2. **Spawn the posting-only agent (□²).** The separation of duties from the notes. The
   credential-holder never posts; a second, narrowly scoped agent does nothing but
   publish already-approved copy. If it misbehaves or is compromised, the blast radius
   is one post, not one account.
3. **Generate copy and creative into a queue.** Drafted per business, per group, held
   for review. Nothing reaches a group unreviewed.
4. **Business approves — hard gate.** Explicit approval of both copy and creative before
   anything publishes. Non-negotiable: it's the liability shield and the reason a
   business will trust you with the account at all.
5. **Schedule Mon / Wed / Thu.** Per-group cadence caps, staggered times. The same post
   hitting six groups within a minute is the signature that gets accounts flagged.
6. **Check each group's own rules.** Promo rules differ per group — some ban business
   posts outright, some allow one day a week. Keep a per-group allow/deny list or you'll
   get the customer banned from their own neighborhood.
7. **Publish and capture the permalink.** For the report, and so the business can go
   engage with replies themselves.
8. **Decide the comment question.** The margin note flagged boosting comments as
   possibly unwanted. Recommendation: don't. Auto-commenting to boost reach is the
   highest-risk, lowest-trust behavior in the system.

---

## 5. Signup — three slot states

Town and trade come first on the form, before name or email, because that determines
whether they can sign up at all. The server answers one of three ways:

| State | Means | What they see |
| --- | --- | --- |
| **Open** | You watch that town, slot is free | "Scarsdale roofing is open. Claim it." Straight through to details. |
| **Taken** | Someone holds that town × trade | "Scarsdale roofing is claimed." Waitlist or a nearby town. The exclusivity promise doing its job in public. |
| **Uncovered** | Not in that town's groups yet | "We're not live in Rye yet — reserve your slot, live in about two weeks." Loud, on the payment screen, not in fine print. |

Then name, business, cell, email — and verify the cell with a one-time code right
there. The entire product is SMS, so a wrong or fake number means they get nothing and
churn on day one. Catch it at signup.

Then a light contractor check. Because a slot is exclusive, you can't let a tire-kicker
— or a competitor blocking a rival — lock Scarsdale roofing. Business name, a website or
business page, confirm they do that trade in that area. Eyeball it yourself early,
automate later.

**Card up front? Not for the pilot.** Contractors are card-shy, the free week is the
whole pitch, and you're closing by text or call at the end anyway. A card adds friction
for no benefit while onboarding is manual. Flip to card-on-file with a Stripe trial once
the human close stops scaling.

---

## 6. Architecture — the page is the storefront, not the store

The Vercel page handles marketing, the slot board, the form and checkout handoff. What
it cannot do alone: know that Scarsdale roofing is taken, verify a phone, charge a card
safely, or turn the Watcher on. Anything involving money, real availability or account
access runs server-side where a visitor can't tamper with it — if availability lived in
the page's code, two people could claim the same slot and you'd never know.

```
Vercel page  →  API + database  →  Stripe Checkout  →  Activation queue
(asks the       (the truth:        (hosted, cards      (covered town: auto
 server,         slots, claims,     never touch          uncovered: ops list)
 never decides)  verification)      your code)
```

Vercel can host both halves — marketing front end plus serverless API routes against a
Postgres database — so it isn't a second stack, but the server layer has to exist.

**Don't build this first.** For the pilot, the form can just email you the signup. You
check the slot by hand, verify and onboard by text — no Stripe, no availability API.
That's a legitimate signup for the first three to five customers and it launches this
week instead of after the backend. Build the machine once you've proven by hand that
people want to get on it, and once the scraper has proven durable enough to automate
around.

---

## 7. Open items

- **Platform automation rules.** Both agents operate against Facebook's automation
  policy. Account durability is an operational cost, not an edge case — budget for
  accounts dying and plan how a customer's coverage survives it.
- **Credential custody.** Holding a customer's login for the Poster is a real liability.
  Decide storage, rotation and offboarding before the first customer hands one over.
- **Carrier registration.** 10DLC brand vetting gates the entire SMS channel and takes
  time. It's on the critical path alongside group approvals — start both now.
- **Exclusivity integrity.** The moment you sell a second roofer in the same town, the
  promise is dead and the story travels. The slot table is the single source of truth,
  server-side, no manual overrides.
- **Honest wait times.** Taking money for an uncovered town and going quiet for two
  weeks is the fastest way to torch the brand with an audience already expecting a scam.
