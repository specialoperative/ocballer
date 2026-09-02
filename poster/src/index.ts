import { env } from "./env.js";
import { loadClients } from "./clients.js";
import { dueDrafts, markFailed, markPublished, getDraft } from "./db.js";
import { mintGrant } from "./approval.js";
import { authorizePublish, publisher } from "./publish/index.js";
import { startServer } from "./server.js";
import { forwardCommentsToWatcher } from "./comments.js";

const configPath = process.argv[2] ?? "./config/clients.json";
const { clients, targets } = loadClients(configPath);

console.log(
  `Poach Poster — ${clients.length} client${clients.length === 1 ? "" : "s"}, ` +
    `${targets.size} group${targets.size === 1 ? "" : "s"}` +
    (env.dryRun ? " [DRY RUN — nothing is published or texted]" : ""),
);

startServer(clients, targets);

const post = publisher();

async function tick() {
  for (const draft of dueDrafts(new Date())) {
    // Mint at publish time, never at approval time: a grant that sits around
    // waiting is a grant that can leak.
    const grant = mintGrant(draft.id, draft.targetId);

    // The same check the publisher process runs. Called here so an unapproved
    // or replayed draft never reaches the account, even if the relay is wrong.
    const authorized = authorizePublish(grant);
    if (!authorized.ok || !authorized.body) {
      markFailed(draft.id, authorized.error ?? "authorization failed");
      continue;
    }

    try {
      const result = await post.publish(grant, authorized.body);
      if (result.ok) {
        markPublished(draft.id, result.permalink);
        const published = getDraft(draft.id);
        if (published && result.permalink) {
          await forwardCommentsToWatcher(published, result.permalink).catch((error) =>
            console.error("comment handoff failed:", (error as Error).message),
          );
        }
      } else {
        markFailed(draft.id, result.error ?? "publish failed");
      }
    } catch (error) {
      markFailed(draft.id, (error as Error).message);
    }
  }
}

await tick();
setInterval(tick, 60_000);
