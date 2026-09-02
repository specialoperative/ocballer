import type { RawPost, Source } from "../types.js";

/**
 * Push-based source. Anything that can make an HTTP request — a browser
 * extension, a phone shortcut, a separate scraper, you pasting a post by hand
 * during the pilot — POSTs to /ingest and the post enters the same pipeline.
 *
 * This is what makes the manual first week possible without special-casing it.
 */
const queue: RawPost[] = [];

export function enqueue(post: RawPost): void {
  queue.push(post);
}

export function ingestSource(): Source {
  return {
    id: "ingest",
    platform: "other",
    async fetch(): Promise<RawPost[]> {
      return queue.splice(0, queue.length);
    },
  };
}
