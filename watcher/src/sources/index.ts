import type { Source } from "../types.js";
import type { SourceConfig } from "../territories.js";
import { env } from "../env.js";
import { collectorSource } from "./collector.js";
import { rssSource } from "./rss.js";
import { ingestSource } from "./ingest.js";

export function buildSources(configs: SourceConfig[]): Map<string, Source> {
  const sources = new Map<string, Source>();

  for (const config of configs) {
    switch (config.kind) {
      case "collector": {
        if (!env.fbCollectorUrl) {
          throw new Error(
            `Source "${config.id}" needs FB_COLLECTOR_URL set — see src/sources/collector.ts for the response shape.`,
          );
        }
        sources.set(
          config.id,
          collectorSource({
            id: config.id,
            platform: config.platform,
            feedId: config.feedId,
            groupName: config.groupName,
            baseUrl: env.fbCollectorUrl,
            token: env.fbCollectorToken,
          }),
        );
        break;
      }
      case "rss":
        sources.set(config.id, rssSource(config));
        break;
      case "ingest":
        sources.set(config.id, ingestSource());
        break;
    }
  }

  return sources;
}

export { enqueue } from "./ingest.js";
