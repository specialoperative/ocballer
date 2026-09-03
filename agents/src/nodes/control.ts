import { createServer, type IncomingMessage } from "node:http";
import { drafter } from "../agents/drafter.js";
import { scheduler } from "../agents/scheduler.js";
import { approver } from "../agents/approver.js";
import { mintGrant } from "../kernel/grants.js";
import { accountMayPost } from "../kernel/rate.js";
import {
  auditTrail,
  claimNextForNode,
  getPost,
  heartbeat,
  insertPost,
  listNodes,
  markFailed,
  markPublished,
  pendingApproval,
} from "../kernel/store.js";
import { measure, report } from "../capacity.js";
import type { System } from "../config.js";

/**
 * The control node: plans, drafts, holds approvals, hands out grants.
 * It never holds an account session and never publishes — those exist only on
 * edge nodes, which makes the □/□² split physical rather than notional.
 */
export function startControl(system: System, port: number) {
  const surfacesById = new Map(system.surfaces.map((surface) => [surface.id, surface]));
  const businessesById = new Map(system.businesses.map((business) => [business.id, business]));

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body, null, 2));
    };
    const body = await read(req);

    if (url.pathname === "/health") {
      return json(200, { ok: true, nodes: listNodes(), machine: measure() });
    }

    if (url.pathname === "/capacity") {
      return json(200, { text: report(system.accounts), machine: measure() });
    }

    if (url.pathname === "/pending") {
      return json(200, pendingApproval(url.searchParams.get("campaign") ?? undefined));
    }

    // Plan and draft a batch. Nothing created here is publishable.
    if (req.method === "POST" && url.pathname === "/plan") {
      const { campaignId } = JSON.parse(body || "{}") as { campaignId?: string };
      const campaign = system.campaigns.find((candidate) => candidate.id === campaignId);
      if (!campaign) return json(404, { error: "unknown campaign" });

      const business = businessesById.get(campaign.businessId);
      if (!business) return json(400, { error: "campaign has no business" });

      const surfaces = campaign.surfaceIds
        .map((id) => surfacesById.get(id))
        .filter((surface): surface is NonNullable<typeof surface> => Boolean(surface));

      const { slots, skipped } = await scheduler.run({ campaign, surfaces, now: new Date() });
      const created: number[] = [];

      for (const slot of slots) {
        const theme =
          campaign.themes[created.length % Math.max(campaign.themes.length, 1)] ?? "general update";
        const draft = await drafter.run({ business, surface: slot.surface, campaign, theme });

        if (!draft.compliant || !draft.body.trim()) {
          skipped.push({ surfaceId: slot.surface.id, reason: draft.ruleCheck });
          continue;
        }

        created.push(
          insertPost({
            campaignId: campaign.id,
            surfaceId: slot.surface.id,
            accountId: slot.surface.accountId,
            body: draft.body,
            creativeBrief: draft.creativeBrief,
            mediaUrl: null,
            scheduledFor: slot.scheduledFor.toISOString(),
          }),
        );
      }

      return json(200, { drafted: created, skipped });
    }

    // The business's decision — separate agent, separate capability.
    if (req.method === "POST" && url.pathname === "/decide") {
      const { postId, decision, actor, editedBody } = JSON.parse(body || "{}");
      const result = await approver.run({ postId, decision, actor: actor ?? "owner", editedBody });
      return json(result.ok ? 200 : 400, result);
    }

    /**
     * An edge node asks for work and gets at most one post, as a grant —
     * never the queue, never a credential, never a second item.
     */
    if (req.method === "POST" && url.pathname === "/work") {
      const { nodeId, label, agents, capacity } = JSON.parse(body || "{}") as {
        nodeId?: string;
        label?: string;
        agents?: number;
        capacity?: number;
      };
      if (!nodeId) return json(400, { error: "nodeId required" });
      heartbeat(nodeId, label ?? nodeId, agents ?? 0, capacity ?? 0);

      const mine = system.accounts.filter((account) => account.nodeId === nodeId);
      const now = new Date();

      // Rate rails are checked before a grant exists, not after.
      const eligible = mine.filter((account) => accountMayPost(account, now).ok);
      if (eligible.length === 0) return json(200, { work: null, reason: "all accounts rate-limited" });

      const post = claimNextForNode(nodeId, eligible.map((account) => account.id), now);
      if (!post) return json(200, { work: null });

      const grant = mintGrant(post.id, post.surfaceId, nodeId);
      return json(200, { work: { grant, creativeBrief: post.creativeBrief } });
    }

    // Edge reports the outcome. Control learns what happened, never the credentials.
    if (req.method === "POST" && url.pathname === "/result") {
      const { postId, ok, permalink, error, nodeId } = JSON.parse(body || "{}");
      if (ok) markPublished(postId, permalink ?? null, nodeId ?? "edge");
      else markFailed(postId, error ?? "unknown", nodeId ?? "edge");
      return json(200, { recorded: true });
    }

    const trail = url.pathname.match(/^\/post\/(\d+)$/);
    if (trail) {
      const id = Number(trail[1]);
      return json(200, { post: getPost(id), audit: auditTrail(id) });
    }

    json(404, { error: "not found" });
  });

  server.listen(port, () => {
    console.log(`control node on :${port}`);
    console.log(report(system.accounts));
  });
  return server;
}

function read(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
  });
}
