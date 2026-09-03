import { loadSystem } from "./config.js";
import { scheduler } from "./agents/scheduler.js";
import { poster } from "./agents/poster.js";
import { sessionAgent } from "./agents/session.js";
import { approver } from "./agents/approver.js";
import { defineAgent } from "./kernel/agent.js";
import { CompartmentViolation, forbiddenPairs } from "./kernel/capabilities.js";
import { mintGrant, redeem, verifyGrant } from "./kernel/grants.js";
import { accountMayPost } from "./kernel/rate.js";
import { insertPost, setState, getPost, auditTrail } from "./kernel/store.js";
import { measure, accountCeiling, report } from "./capacity.js";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures += 1;
};

const system = loadSystem(process.env.SYSTEM_CONFIG ?? "./config/system.example.json");

// ---- compartments ----------------------------------------------------------
for (const [left, right] of forbiddenPairs()) {
  let refused = false;
  try {
    defineAgent({ name: `bad-${left}-${right}`, capabilities: [left, right], run: async () => null });
  } catch (error) {
    refused = error instanceof CompartmentViolation;
  }
  check(`refuses an agent holding both ${left} and ${right}`, refused);
}
check("poster holds publish and nothing else", 
  poster.capabilities.length === 1 && poster.capabilities[0] === "publish",
  poster.capabilities.join(","));
check("session agent never holds publish", !sessionAgent.capabilities.includes("publish"),
  sessionAgent.capabilities.join(","));
check("approver cannot draft", !approver.capabilities.includes("draft"),
  approver.capabilities.join(","));

// ---- scheduling ------------------------------------------------------------
const campaign = system.campaigns[0]!;
const surfaces = campaign.surfaceIds.map((id) => system.surfaces.find((s) => s.id === id)!);
const { slots, skipped } = await scheduler.run({ campaign, surfaces, now: new Date("2026-09-02T12:00:00Z") });

check("surface that forbids posting is skipped", skipped.some((s) => s.surfaceId === "grp-moms"),
  skipped.map((s) => s.surfaceId).join(","));
check("allowed surfaces get slots", slots.length === 2, slots.map((s) => s.surface.id).join(","));
const days = slots.map((s) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: campaign.timezone }).format(s.scheduledFor));
check("slots land on configured days", days.every((d) => ["Mon", "Wed", "Thu"].includes(d)), days.join(","));
check("slots spread across days", new Set(days).size === slots.length, days.join(","));

// ---- the gate --------------------------------------------------------------
const postId = insertPost({
  campaignId: campaign.id,
  surfaceId: "grp-neighbors",
  accountId: "acct-main",
  body: "Two chairs open Saturday morning on Elm.",
  creativeBrief: "Shot of the shopfront.",
  mediaUrl: null,
  scheduledFor: new Date(Date.now() - 60_000).toISOString(),
});

const unapproved = redeem(mintGrant(postId, "grp-neighbors", "edge-1"));
check("an unapproved post cannot be redeemed", !unapproved.ok,
  unapproved.ok ? "" : unapproved.error);

setState(postId, "approved", "smoke");
const grant = mintGrant(postId, "grp-neighbors", "edge-1");
const first = redeem(grant);
check("an approved post redeems once", first.ok);
const replay = redeem(grant);
check("the same grant cannot be replayed", !replay.ok, replay.ok ? "" : replay.error);

const retargeted = { ...mintGrant(postId, "grp-neighbors", "edge-1"), surfaceId: "grp-buysell" };
check("a grant retargeted to another surface is refused", !verifyGrant(retargeted));
check("an expired grant is refused", !verifyGrant(mintGrant(postId, "grp-neighbors", "edge-1", -1)));

const rejectedId = insertPost({
  campaignId: campaign.id, surfaceId: "grp-neighbors", accountId: "acct-main",
  body: "no", creativeBrief: "", mediaUrl: null, scheduledFor: new Date().toISOString(),
});
setState(rejectedId, "rejected", "smoke");
const rejected = redeem(mintGrant(rejectedId, "grp-neighbors", "edge-1"));
check("a rejected post can never publish", !rejected.ok, rejected.ok ? "" : rejected.error);

// ---- approver --------------------------------------------------------------
const editId = insertPost({
  campaignId: campaign.id, surfaceId: "grp-buysell", accountId: "acct-second",
  body: "original", creativeBrief: "", mediaUrl: null, scheduledFor: new Date().toISOString(),
});
const decided = await approver.run({ postId: editId, decision: "approve", actor: "owner", editedBody: "edited" });
check("approver records the decision", decided.ok && getPost(editId)?.state === "approved");
const twice = await approver.run({ postId: editId, decision: "reject", actor: "owner" });
check("a decided post cannot be decided again", !twice.ok, twice.error);
check("audit trail records the chain",
  auditTrail(editId).map((e) => e.action).includes("approved"),
  auditTrail(editId).map((e) => e.action).join(" > "));

// ---- per-account rails -----------------------------------------------------
const account = system.accounts[0]!;
check("a fresh account may post", accountMayPost(account, new Date()).ok);
const throttled = accountMayPost({ ...account, maxPostsPerDay: 0 }, new Date());
check("an account at its daily ceiling is stopped", !throttled.ok, throttled.reason);

// ---- poster ----------------------------------------------------------------
const dry = await poster.run({
  grant: mintGrant(postId, "grp-neighbors", "edge-1"),
  body: "hello", mediaUrl: null, driverUrl: "", dryRun: true,
});
check("dry-run poster reports success without a driver", dry.ok);
const noDriver = await poster.run({
  grant: mintGrant(postId, "grp-neighbors", "edge-1"),
  body: "hello", mediaUrl: null, driverUrl: "", dryRun: false,
});
check("live poster refuses without a session driver", !noDriver.ok, noDriver.error);

// ---- capacity --------------------------------------------------------------
const machine = measure();
check("machine capacity is measured", machine.cores > 0 && machine.totalRamMb > 0,
  `${machine.cores} cores, ${machine.totalRamMb}MB`);
const ceiling = accountCeiling(system.accounts);
check("account ceiling computed", ceiling.postsPerDay === 6, `${ceiling.postsPerDay} posts/day`);

console.log("\n" + report(system.accounts));
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
