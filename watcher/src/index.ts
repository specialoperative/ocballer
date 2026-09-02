import { env } from "./env.js";
import { loadConfig } from "./territories.js";
import { buildSources } from "./sources/index.js";
import { runCycle } from "./pipeline.js";
import { startServer } from "./server.js";
import { isMondayReportHour, sendWeeklyReports } from "./report.js";

const configPath = process.argv[2] ?? "./config/territories.json";
const { sources: sourceConfigs, territories } = loadConfig(configPath);
const sources = buildSources(sourceConfigs);

console.log(
  `Poach Watcher — ${territories.length} territor${territories.length === 1 ? "y" : "ies"}, ` +
    `${sources.size} feed${sources.size === 1 ? "" : "s"}, polling every ${env.pollIntervalSeconds}s` +
    (env.dryRun ? " [DRY RUN — no SMS will be sent]" : ""),
);

startServer(territories);

let since = new Date(Date.now() - 15 * 60 * 1000);
let reportedThisHour = false;

async function tick() {
  const cycleStart = new Date();
  try {
    await runCycle({ sources, territories }, since);
    // Overlap by a minute: a feed that reorders or backfills shouldn't drop a
    // post into the gap. claimPost() makes the re-read free.
    since = new Date(cycleStart.getTime() - 60_000);
  } catch (error) {
    console.error("cycle failed:", (error as Error).message);
  }

  const first = territories[0];
  if (first && isMondayReportHour(new Date(), first.timezone)) {
    if (!reportedThisHour) {
      reportedThisHour = true;
      await sendWeeklyReports(territories).catch((error) =>
        console.error("weekly report failed:", (error as Error).message),
      );
    }
  } else {
    reportedThisHour = false;
  }
}

await tick();
// Jitter so the poll cadence isn't perfectly machine-regular.
setInterval(tick, env.pollIntervalSeconds * 1000 + Math.floor(Math.random() * 15_000));
