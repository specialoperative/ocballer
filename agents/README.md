# Agent runtime — automated posting

Built from the notes, not the landing page. □ = agent, ○ = business, △ = surface.
Nothing here knows about towns, trades or territories: a *surface* is any group
or page, so the same runtime serves a roofer, a barber shop or a nonprofit.

```
scheduler □ ──▶ drafter □ ──▶ [ business ○ approves ] ──▶ grant ──▶ poster □²
                                                                      │
control node (no credentials)                       edge node ────────┘
                                                    (holds the account)
```

## The agents

| Agent | Capabilities | Job |
| --- | --- | --- |
| `scheduler` | `schedule` | Decides *when*. Cannot write, approve or publish. |
| `drafter` | `draft` | Writes copy + a photo brief. Cannot approve its own output. |
| `approver` | `approve` `notify` `queue.*` | Records the business's decision. Cannot draft. |
| `session` □ | `session.hold` `session.read` | Holds one account's session on one machine. **Cannot publish.** |
| `poster` □² | `publish` | Submits one approved body to one surface. No credentials, no queue. |

## Compartments are enforced, not documented

`defineAgent` refuses to construct an agent holding a forbidden pair, and each
pair carries the reason it exists:

- `session.hold` + `publish` — the credential holder must not be the publisher. This is the □² split.
- `draft` + `approve` — a drafter blessing its own copy is not an approval gate.
- `publish` + `queue.read` — a publisher sees one payload, never the queue it came from.

The smoke test asserts all three are refused. Adding a fourth means editing one
array, not auditing the codebase.

## Two machines

Roles are set by `ROLE`. Your second computer is an edge node.

**Control** (laptop or cloud) — plans, drafts, holds approvals, mints grants.
Never holds an account, never publishes. Needs `ANTHROPIC_API_KEY`, `GRANT_SECRET`.

**Edge** (computer 2) — holds accounts, runs session + poster agents. Polls control
for work, gets back **one grant**, redeems it for **one body**, posts, reports the
outcome. Needs neither the API key nor the queue. Credentials never leave the box:
the session driver is local at `DRIVER_URL`.

```bash
# control
ROLE=control PORT=8090 npm start

# second computer
ROLE=edge NODE_ID=edge-2 CONTROL_URL=http://<control-host>:8090 \
  DRIVER_URL=http://localhost:9222 npm start
```

Work is claimed with an atomic `UPDATE ... WHERE state='approved'`, so two nodes
racing for the same post — only one wins.

## How many agents can we run

```bash
ROLE=capacity npm start
```

Measured on a 4-core / 16GB box:

```
session agents: 16   (RAM allows 35, CPU allows 16)
control agents: 350  (cheap — never the constraint)
```

Only **session agents** cost anything real — one holds a browser profile, ~400MB
and ~0.25 core. Drafters, schedulers and approvers are ~40MB and rounding error.
So a normal laptop carries 10–20 session agents, and two machines carry 20–40.

**That number is almost never your limit.** The real ceiling is accounts:

```
Accounts: 2, 6 posts/day combined
  surfaces servable at 2 posts/week: ~21
Binding constraint: accounts. More machines will not help; more accounts will.
```

One account can only post so often before it looks like what it is. At 3 posts
a day with a 2-hour gap, one account serves ~10 surfaces at twice a week. Two
accounts, ~21. The second computer matters because it lets a **second account**
live somewhere with its own IP and its own machine fingerprint — not because
you needed the CPU.

The rails are in `kernel/rate.ts` and checked *before* a grant is minted:
`maxPostsPerDay` and `minMinutesBetweenPosts`, per account, across every surface
it touches. A surface's own `minHoursBetweenPosts` is separate — that one
protects the group from one business; the account rule protects the account.

## Running it

```bash
npm install
cp .env.example .env            # set GRANT_SECRET, ANTHROPIC_API_KEY
cp config/system.example.json config/system.json
npm run smoke                   # 25 checks, no keys, nothing published
ROLE=capacity npm start         # what this machine can carry
ROLE=control npm start
```

`DRY_RUN=1` plans, drafts, approves and claims work but never publishes.

| Route | Purpose |
| --- | --- |
| `POST /plan` | Schedule + draft a campaign's next batch |
| `GET /pending` | Everything awaiting the business's decision |
| `POST /decide` | Approve, edit-and-approve, or reject |
| `POST /work` | An edge node claims one post, gets one grant |
| `POST /result` | Edge reports what happened |
| `GET /capacity` | This machine's agent budget |
| `GET /post/:id` | One post and its full audit trail |

## What isn't here

The **session driver** — the local process that actually drives a platform with
a logged-in account. It sits behind `DRIVER_URL` on the edge node and speaks two
routes: `GET /health` and `POST /publish {surfaceId, body, mediaUrl}`. Everything
above it is finished and tested; that piece is the one that carries platform risk,
and it stays a deliberate, swappable boundary — a real driver, a VA-assisted
queue, or an official API, all fit the same two routes.
