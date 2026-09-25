import Parser from "rss-parser";
import type { RawPost, Source } from "../types.js";

const parser = new Parser();

/**
 * Any feed that publishes RSS/Atom — town boards, municipal notice feeds,
 * classifieds. Useful on day one because it needs no collector at all.
 */
export function rssSource(config: {
  id: string;
  url: string;
  groupName: string;
}): Source {
  return {
    id: config.id,
    platform: "other",
    async fetch(since: Date): Promise<RawPost[]> {
      const feed = await parser.parseURL(config.url);

      return (feed.items ?? [])
        .map((item) => {
          const postedAt = item.isoDate ? new Date(item.isoDate) : new Date();
          return {
            externalId: item.guid ?? item.link ?? `${config.id}:${item.title ?? ""}`,
            source: config.id,
            platform: "other" as const,
            groupName: config.groupName,
            authorName: item.creator ?? null,
            text: [item.title, item.contentSnippet].filter(Boolean).join(" — "),
            url: item.link ?? null,
            postedAt,
          };
        })
        .filter((post) => post.postedAt > since);
    },
  };
}
