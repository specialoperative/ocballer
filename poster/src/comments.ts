import { env } from "./env.js";
import type { Draft } from "./types.js";

/**
 * "Comments feed back into your alerts" — a reply on a published post is a
 * neighbor raising their hand, so it goes into the Watcher's pipeline rather
 * than sitting in a notification the owner never opens.
 *
 * Your publisher reports comments back to POST /comments here; this forwards
 * them to the Watcher as ordinary posts.
 */
export async function forwardCommentsToWatcher(draft: Draft, permalink: string): Promise<void> {
  if (!env.watcherIngestUrl) return;
  console.log(`[poster] watching ${permalink} for comments (draft ${draft.id})`);
}

export async function forwardComment(comment: {
  id: string;
  text: string;
  author?: string;
  groupName: string;
  url?: string;
  postedAt?: string;
}): Promise<boolean> {
  if (!env.watcherIngestUrl) return false;

  const response = await fetch(env.watcherIngestUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(env.watcherIngestSecret ? { authorization: `Bearer ${env.watcherIngestSecret}` } : {}),
    },
    body: JSON.stringify({
      id: `comment:${comment.id}`,
      text: comment.text,
      author: comment.author ?? null,
      group: comment.groupName,
      url: comment.url ?? null,
      postedAt: comment.postedAt ?? new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(10_000),
  });

  return response.ok;
}
