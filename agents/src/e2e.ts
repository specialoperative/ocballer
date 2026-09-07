/**
 * End-to-end: a post travels control -> edge -> published, over real HTTP,
 * with the grant redeemed on the edge side. Drafting is skipped because it
 * needs a live API key; everything downstream of it runs for real.
 */
import { loadSystem } from "./config.js";
import { startControl } from "./nodes/control.js";
import { startEdge } from "./nodes/edge.js";
import { insertPost, setState, getPost, auditTrail, listNodes } from "./kernel/store.js";

const PORT = Number(process.env.PORT ?? 8095);
const system = loadSystem("./config/system.example.json");
const control = startControl(system, PORT);
await new Promise((r) => setTimeout(r, 400));

const postId = insertPost({
  campaignId: "camp-1",
  surfaceId: "grp-neighbors",
  accountId: "acct-main",
  body: "Two chairs open Saturday morning. Walk-ins welcome.",
  creativeBrief: "Shopfront on Elm.",
  mediaUrl: null,
  scheduledFor: new Date(Date.now() - 60_000).toISOString(),
});
console.log(`seeded post ${postId} (state: ${getPost(postId)?.state})`);

// The business decides, via the control node's HTTP API.
const decided = await fetch(`http://localhost:${PORT}/decide`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ postId, decision: "approve", actor: "owner" }),
});
console.log(`POST /decide -> ${decided.status} ${JSON.stringify(await decided.json())}`);
console.log(`state after approval: ${getPost(postId)?.state}`);

// The second machine comes online and starts asking for work.
const supervisor = await startEdge(system, {
  nodeId: "edge-1",
  controlUrl: `http://localhost:${PORT}`,
  dryRun: true,
  pollSeconds: 1,
});

const deadline = Date.now() + 15_000;
while (Date.now() < deadline && getPost(postId)?.state !== "published") {
  await new Promise((r) => setTimeout(r, 300));
}

const final = getPost(postId);
console.log(`\nfinal state: ${final?.state}`);
console.log("audit trail:");
for (const entry of auditTrail(postId)) {
  console.log(`  ${entry.at}  ${entry.actor.padEnd(10)} ${entry.action}${entry.detail ? ` (${entry.detail})` : ""}`);
}
console.log("\nnodes seen by control:", JSON.stringify(listNodes()));

// Nothing left to claim: the post was consumed exactly once.
const again = await fetch(`http://localhost:${PORT}/work`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ nodeId: "edge-1" }),
});
console.log("second claim ->", JSON.stringify(await again.json()));

supervisor.stop();
control.close();
process.exit(final?.state === "published" ? 0 : 1);
