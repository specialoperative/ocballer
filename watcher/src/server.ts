import { createServer } from "node:http";
import { env } from "./env.js";
import { enqueue } from "./sources/index.js";
import { latestAlertForPhone, recordOutcome, scorecard } from "./db.js";
import type { Territory } from "./types.js";

/**
 * Two jobs: accept pushed posts, and accept the contractor texting back
 * "1" (contacted) or "2" (booked) — which is where the Monday report's
 * numbers come from.
 */
export function startServer(territories: Territory[]) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${env.port}`);

    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (req.method === "GET" && url.pathname === "/health") {
      return json(200, { ok: true, territories: territories.length });
    }

    if (req.method === "GET" && url.pathname === "/scorecard") {
      const id = url.searchParams.get("territory");
      const territory = territories.find((candidate) => candidate.id === id);
      if (!territory) return json(404, { error: `Unknown territory "${id}".` });
      const days = Number.parseInt(url.searchParams.get("days") ?? "7", 10);
      return json(200, scorecard(territory.id, new Date(Date.now() - days * 86_400_000)));
    }

    const body = await readBody(req);

    // Posts pushed in from a collector, an extension, or by hand during the pilot.
    if (req.method === "POST" && url.pathname === "/ingest") {
      if (env.ingestSecret && req.headers.authorization !== `Bearer ${env.ingestSecret}`) {
        return json(401, { error: "Bad or missing INGEST_SECRET." });
      }
      try {
        const post = JSON.parse(body) as Record<string, string>;
        if (!post.id || !post.text) {
          return json(400, { error: "id and text are required." });
        }
        enqueue({
          externalId: post.id,
          source: "ingest",
          platform: "other",
          groupName: post.group ?? "manual",
          authorName: post.author ?? null,
          text: post.text,
          url: post.url ?? null,
          postedAt: post.postedAt ? new Date(post.postedAt) : new Date(),
        });
        return json(202, { queued: true });
      } catch {
        return json(400, { error: "Body must be JSON." });
      }
    }

    // Twilio inbound SMS webhook. Point your number's messaging webhook here.
    if (req.method === "POST" && url.pathname === "/sms") {
      const params = new URLSearchParams(body);
      const from = params.get("From") ?? "";
      const text = (params.get("Body") ?? "").trim().toLowerCase();

      const owned = territories
        .filter((territory) => territory.contractor.phone === from)
        .map((territory) => territory.id);

      const alert = latestAlertForPhone(owned);
      let reply = "Reply 1 = contacted, 2 = booked, on your latest lead.";

      if (alert) {
        if (text.startsWith("1")) {
          recordOutcome(alert.id, true, false);
          reply = "Logged: contacted. Reply 2 when it books.";
        } else if (text.startsWith("2")) {
          recordOutcome(alert.id, true, true, "booked via SMS");
          reply = "Logged: booked. Nice one.";
        } else if (text.startsWith("stop")) {
          reply = "";
        }
      }

      res.writeHead(200, { "content-type": "text/xml" });
      return res.end(
        reply
          ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${reply}</Message></Response>`
          : `<?xml version="1.0" encoding="UTF-8"?><Response/>`,
      );
    }

    json(404, { error: "Not found." });
  });

  server.listen(env.port, () => {
    console.log(`Watcher HTTP on :${env.port} (/health, /ingest, /sms, /scorecard)`);
  });

  return server;
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
  });
}
