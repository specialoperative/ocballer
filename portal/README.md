# Poach Studio — the operator portal

Log in, drop copy in one column and photos in the other, pair them, and queue the
result for the Poster. Deployed on Vercel.

## Two columns

- **Copy** — paste text, or upload a `.txt` / `.md` / `.csv`. A block separated by
  blank lines splits into separate posts, so a week's copy pastes in one go.
- **Photos** — drop images in. The browser resizes to 1600px before upload, so a
  phone photo doesn't hit the serverless upload limit.

Click one of each, name the group or town, and **Queue post**. The queue below runs
`queued → approved → posted`. Approval here is yours as the operator; the
contractor's own approval still happens in the Poster before anything publishes.

## Setting it up on Vercel

Three environment variables, then one storage click:

| Variable | Value |
| --- | --- |
| `PORTAL_PASSWORD` | Whatever you want to type to get in |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `BLOB_READ_WRITE_TOKEN` | Set for you when you create the Blob store |

1. Project → **Settings → Environment Variables** → add `PORTAL_PASSWORD` and
   `SESSION_SECRET` for Production and Preview.
2. Project → **Storage → Create → Blob**, connect it to this project. Vercel injects
   `BLOB_READ_WRITE_TOKEN` itself.
3. Redeploy.

Until the Blob store exists, the portal loads and shows a setup banner rather than
failing — but nothing you add will save.

## How auth works

One password, one operator. The cookie is an HMAC of its own expiry, signed with
`SESSION_SECRET` and verified in middleware on the Edge, so there is no user table
and no session store to leak. Rotating `SESSION_SECRET` signs everyone out. Sessions
last 12 hours.

This is deliberately the simplest thing that holds: it is right for you and a VA,
and wrong the moment contractors need their own logins. That's when you add real
accounts — the middleware is the only place that assumption lives.

## Storage note

Everything sits in one Vercel Blob store: `data/index.json` for the records, plus
the photos. Blob objects are public-URL addressable, so treat anything uploaded as
publicly reachable by anyone holding the URL — fine for marketing copy and job
photos, not for anything private. The index is read-modify-write and assumes a
single operator; two people editing at once means the later write wins. Move the
index to Postgres before that stops being true.
