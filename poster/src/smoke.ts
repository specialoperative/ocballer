import { loadClients } from "./clients.js";
import { planWeek } from "./schedule.js";
import { insertDraft, setStatus, getDraft, auditTrail, markPublished } from "./db.js";
import { mintGrant, verifyGrant, approvalToken, verifyApprovalToken } from "./approval.js";
import { authorizePublish } from "./publish/index.js";
import { startServer } from "./server.js";
import type { PublishGrant } from "./types.js";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures += 1;
};

const CONFIG = process.env.CLIENTS_CONFIG ?? "./config/clients.example.json";
const { clients, targets } = loadClients(CONFIG);
const client = clients[0]!;

// ---- scheduling ------------------------------------------------------------
const clientTargets = client.targets.map((id) => targets.get(id)!).filter(Boolean);
const { slots, skipped } = planWeek(client, clientTargets, new Date("2026-09-02T12:00:00Z"));

check("group that forbids business posts is skipped",
  skipped.some((s) => s.targetId === "fb:scarsdale-moms"),
  skipped.map((s) => s.targetId).join(","));
check("allowed groups get slots", slots.length === 2, slots.map((s) => s.target.id).join(","));

const promoSlot = slots.find((s) => s.target.id === "fb:scarsdale-neighbors");
const promoDay = promoSlot
  ? new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: client.timezone }).format(promoSlot.scheduledFor)
  : "";
check("promo-day-only group lands on its Wednesday", promoDay === "Wed", promoDay);

const days = slots.map((s) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: client.timezone }).format(s.scheduledFor));
check("every slot is Mon/Wed/Thu", days.every((d) => ["Mon", "Wed", "Thu"].includes(d)), days.join(","));
check("slots are staggered, not simultaneous",
  new Set(slots.map((s) => s.scheduledFor.toISOString())).size === slots.length);
check("slots spread across different days", new Set(days).size === slots.length, days.join(","));

// ---- the approval gate -----------------------------------------------------
const draftId = insertDraft({
  clientId: client.id,
  targetId: "nd:scarsdale",
  body: "Storm last night took shingles off a few roofs on Fox Meadow. Happy to take a look at anyone's.",
  creativeBrief: "Photo of a repaired slate section on a local street.",
  scheduledFor: new Date(Date.now() - 60_000),
});

const unapproved = authorizePublish(mintGrant(draftId, "nd:scarsdale"));
check("an unapproved draft cannot be published", !unapproved.ok, unapproved.error);

setStatus(draftId, "approved", "smoke");
const grant = mintGrant(draftId, "nd:scarsdale");
const first = authorizePublish(grant);
check("an approved draft publishes once", first.ok && Boolean(first.body));

const replay = authorizePublish(grant);
check("the same grant cannot be replayed", !replay.ok, replay.error);

// ---- grant integrity -------------------------------------------------------
const tampered: PublishGrant = { ...mintGrant(draftId, "nd:scarsdale"), targetId: "fb:scarsdale-neighbors" };
check("a grant retargeted to another group is refused", !verifyGrant(tampered));

const expired = mintGrant(draftId, "nd:scarsdale", -1);
check("an expired grant is refused", !verifyGrant(expired));

const rejectedId = insertDraft({
  clientId: client.id,
  targetId: "nd:scarsdale",
  body: "Rejected copy.",
  creativeBrief: "n/a",
  scheduledFor: new Date(),
});
setStatus(rejectedId, "rejected", "smoke");
const rejected = authorizePublish(mintGrant(rejectedId, "nd:scarsdale"));
check("a rejected draft can never publish", !rejected.ok, rejected.error);

// ---- approval links --------------------------------------------------------
const good = approvalToken(draftId, "approve", new Date(Date.now() + 60_000));
check("a valid approval link verifies", verifyApprovalToken(good)?.draftId === draftId);
check("a forged approval link is refused", verifyApprovalToken(`${draftId}.approve.9999999999999.deadbeef`) === null);
check("an expired approval link is refused",
  verifyApprovalToken(approvalToken(draftId, "approve", new Date(Date.now() - 1000))) === null);

// ---- audit trail -----------------------------------------------------------
markPublished(draftId, "https://example.com/p/1");
const trail = auditTrail(draftId).map((entry) => entry.action);
check("audit trail records drafted -> approved -> published",
  trail.includes("drafted") && trail.includes("approved") && trail.includes("published"),
  trail.join(" > "));

// ---- HTTP round trip -------------------------------------------------------
const httpDraft = insertDraft({
  clientId: client.id,
  targetId: "nd:scarsdale",
  body: "Original copy.",
  creativeBrief: "brief",
  scheduledFor: new Date(Date.now() + 86_400_000),
});
const server = startServer(clients, targets);

setTimeout(async () => {
  const base = `http://localhost:${process.env.PORT ?? 8081}`;

  const review = await fetch(`${base}/review/${client.id}`);
  const reviewHtml = await review.text();
  check("review page lists the pending draft",
    review.status === 200 && reviewHtml.includes("Original copy."));
  check("review page does not list the rejected draft", !reviewHtml.includes("Rejected copy."));

  const edited = await fetch(`${base}/d/${httpDraft}/edit`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ body: "Owner's edited copy.", action: "approve" }).toString(),
  });
  const after = getDraft(httpDraft);
  check("edit-then-approve saves the owner's words and approves",
    edited.status === 200 && after?.body === "Owner's edited copy." && after?.status === "approved",
    `${after?.status}: ${after?.body}`);

  const forged = await fetch(`${base}/d/${httpDraft}/approve?t=bad.token.here.now`);
  check("a forged one-tap link is refused over HTTP", forged.status === 403);

  server.close();
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}, 500);
