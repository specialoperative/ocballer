import type { RawPost, Source } from "../types.js";

/**
 * Reads publicly visible posts from a collector you run.
 *
 * The Watcher deliberately does not log into any platform or drive a browser
 * session itself: collection is the part most likely to change, most likely to
 * break, and most sensitive to how you choose to gather public posts. It stays
 * behind this interface so the pipeline below it never has to change.
 *
 * Your collector answers GET {baseUrl}?since=<ISO8601>&feed=<feedId> with:
 *
 *   {
 *     "posts": [
 *       {
 *         "id": "stable-id-from-the-platform",
 *         "group": "Scarsdale Neighbors",
 *         "author": "Jane D.",              // or null
 *         "text": "Slate roof is leaking...",
 *         "url": "https://...",             // or null
 *         "postedAt": "2026-09-02T01:44:00Z"
 *       }
 *     ]
 *   }
 *
 * `id` must be stable across polls — it is the dedupe key. An unstable id means
 * the same post texts the contractor every 90 seconds.
 */
export interface CollectorConfig {
  id: string;
  platform: RawPost["platform"];
  feedId: string;
  groupName: string;
  baseUrl: string;
  token?: string;
}

interface CollectorPost {
  id: string;
  group?: string;
  author?: string | null;
  text: string;
  url?: string | null;
  postedAt: string;
}

export function collectorSource(config: CollectorConfig): Source {
  return {
    id: config.id,
    platform: config.platform,
    async fetch(since: Date): Promise<RawPost[]> {
      const url = new URL(config.baseUrl);
      url.searchParams.set("since", since.toISOString());
      url.searchParams.set("feed", config.feedId);

      const response = await fetch(url, {
        headers: config.token ? { authorization: `Bearer ${config.token}` } : {},
        signal: AbortSignal.timeout(20_000),
      });

      if (!response.ok) {
        throw new Error(
          `Collector ${config.id} returned ${response.status}. The Watcher keeps polling other feeds.`,
        );
      }

      const body = (await response.json()) as { posts?: CollectorPost[] };
      return (body.posts ?? []).map((post) => ({
        externalId: post.id,
        source: config.id,
        platform: config.platform,
        groupName: post.group ?? config.groupName,
        authorName: post.author ?? null,
        text: post.text,
        url: post.url ?? null,
        postedAt: new Date(post.postedAt),
      }));
    },
  };
}
