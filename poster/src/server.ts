import { createServer, type IncomingMessage } from "node:http";
import { env } from "./env.js";
import {
  auditTrail,
  draftsForClient,
  editBody,
  getDraft,
  setStatus,
} from "./db.js";
import { approvalLink, verifyApprovalToken } from "./approval.js";
import { authorizePublish } from "./publish/index.js";
import { forwardComment } from "./comments.js";
import { reviewDeadline } from "./weekly.js";
import type { Client, Target } from "./types.js";

export function startServer(clients: Client[], targets: Map<string, Target>) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", env.publicBaseUrl);
    const path = url.pathname;

    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const html = (status: number, body: string) => {
      res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
      res.end(body);
    };

    if (path === "/health") return json(200, { ok: true, clients: clients.length });

    // The review page: everything pending, with what it is and where it goes.
    const review = path.match(/^\/review\/([\w-]+)$/);
    if (req.method === "GET" && review) {
      const client = clients.find((candidate) => candidate.id === review[1]);
      if (!client) return html(404, page("Not found", "<p>No such client.</p>"));
      const drafts = draftsForClient(client.id, "drafted");
      const deadline = reviewDeadline();

      const body = drafts.length
        ? drafts
            .map((draft) => {
              const target = targets.get(draft.targetId);
              return `<article>
                <h2>${escape(target?.groupName ?? draft.targetId)}</h2>
                <p class="when">Scheduled ${new Date(draft.scheduledFor).toLocaleString("en-US", {
                  timeZone: client.timezone,
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                })}</p>
                <form method="POST" action="/d/${draft.id}/edit">
                  <textarea name="body" rows="6">${escape(draft.body)}</textarea>
                  <p class="brief"><strong>Photo:</strong> ${escape(draft.creativeBrief)}</p>
                  <div class="actions">
                    <button type="submit" name="action" value="approve">Approve &amp; schedule</button>
                    <a class="reject" href="${approvalLink(draft.id, "reject", deadline)}">Reject</a>
                  </div>
                </form>
              </article>`;
            })
            .join("")
        : "<p>Nothing waiting. Next batch drafts Monday.</p>";

      return html(
        200,
        page(
          `${client.businessName} — this week`,
          `<p class="lede">Edit anything you want changed, then approve. Nothing posts until you do.</p>${body}`,
        ),
      );
    }

    // One-tap approve / reject from the SMS link.
    const tap = path.match(/^\/d\/(\d+)\/(approve|reject)$/);
    if (req.method === "GET" && tap) {
      const token = url.searchParams.get("t") ?? "";
      const verified = verifyApprovalToken(token);
      if (!verified || verified.draftId !== Number(tap[1])) {
        return html(403, page("Link expired", "<p>That link is no longer valid. Open your review page again.</p>"));
      }
      const draft = getDraft(verified.draftId);
      if (!draft) return html(404, page("Not found", "<p>No such post.</p>"));
      if (draft.status !== "drafted") {
        return html(200, page("Already decided", `<p>That post is already ${escape(draft.status)}.</p>`));
      }

      setStatus(draft.id, verified.action === "approve" ? "approved" : "rejected", "owner:link");
      return html(
        200,
        page(
          verified.action === "approve" ? "Approved" : "Rejected",
          verified.action === "approve"
            ? "<p>Scheduled. It posts at the time shown on your review page.</p>"
            : "<p>Rejected. It will not post, and we will not redraft it this week.</p>",
        ),
      );
    }

    const body = await readBody(req);

    const edit = path.match(/^\/d\/(\d+)\/edit$/);
    if (req.method === "POST" && edit) {
      const draft = getDraft(Number(edit[1]));
      if (!draft) return html(404, page("Not found", "<p>No such post.</p>"));
      if (draft.status !== "drafted") {
        return html(200, page("Already decided", `<p>That post is already ${escape(draft.status)}.</p>`));
      }

      const form = new URLSearchParams(body);
      const edited = (form.get("body") ?? "").trim();
      if (!edited) return html(400, page("Empty post", "<p>A post needs text.</p>"));

      if (edited !== draft.body) editBody(draft.id, edited, "owner:review");
      if (form.get("action") === "approve") setStatus(draft.id, "approved", "owner:review");

      return html(200, page("Approved", "<p>Scheduled. Nothing else posts without the same approval.</p>"));
    }

    /**
     * The posting-only agent calls this. It gets back one body for one group,
     * once — never credentials, never the queue, never another draft.
     */
    if (req.method === "POST" && path === "/publish/authorize") {
      if (env.publisherToken && req.headers.authorization !== `Bearer ${env.publisherToken}`) {
        return json(401, { error: "bad publisher token" });
      }
      try {
        const { grant } = JSON.parse(body);
        const result = authorizePublish(grant);
        return json(result.ok ? 200 : 403, result);
      } catch {
        return json(400, { error: "body must be JSON with a grant" });
      }
    }

    // Comments on a published post become Watcher alerts.
    if (req.method === "POST" && path === "/comments") {
      if (env.publisherToken && req.headers.authorization !== `Bearer ${env.publisherToken}`) {
        return json(401, { error: "bad publisher token" });
      }
      try {
        const comment = JSON.parse(body);
        const forwarded = await forwardComment(comment);
        return json(202, { forwarded });
      } catch {
        return json(400, { error: "body must be JSON" });
      }
    }

    const trail = path.match(/^\/d\/(\d+)\/audit$/);
    if (req.method === "GET" && trail) {
      return json(200, auditTrail(Number(trail[1])));
    }

    json(404, { error: "not found" });
  });

  server.listen(env.port, () => {
    console.log(`Poster HTTP on :${env.port} (/review/:client, /publish/authorize, /comments)`);
  });

  return server;
}

function escape(value: string): string {
  return value.replace(/[&<>"]/g, (char) =>
    char === "&" ? "&amp;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : "&quot;",
  );
}

function page(title: string, inner: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)}</title><style>
:root{color-scheme:light dark}
body{font:16px/1.55 system-ui,sans-serif;max-width:44rem;margin:0 auto;padding:24px 18px 64px}
h1{font-size:22px;margin:0 0 4px}
.lede{color:#666;margin:0 0 28px}
article{border-top:1px solid #d8d8d8;padding:20px 0}
h2{font-size:16px;margin:0 0 2px}
.when{color:#777;font-size:13px;margin:0 0 10px}
textarea{width:100%;font:inherit;padding:10px;border:1px solid #bbb;border-radius:6px;background:transparent;color:inherit}
.brief{color:#666;font-size:14px;margin:8px 0 12px}
.actions{display:flex;gap:14px;align-items:center}
button{font:inherit;padding:9px 16px;border:0;border-radius:6px;background:#12603f;color:#fff;cursor:pointer}
.reject{color:#a23;font-size:14px}
</style></head><body><h1>${escape(title)}</h1>${inner}</body></html>`;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
  });
}
