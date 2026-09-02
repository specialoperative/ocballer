import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env and fill it in — see the API keys table in README.md.`,
    );
  }
  return value;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) throw new Error(`${name} must be a number, got "${raw}".`);
  return parsed;
}

const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
const fromNumber = process.env.TWILIO_FROM_NUMBER;
const dryRun = process.env.DRY_RUN === "1";

/** In a dry run nothing is sent, so Twilio credentials are not needed yet. */
function requiredUnlessDryRun(name: string): string {
  return dryRun ? (process.env[name] ?? "") : required(name);
}

export const env = {
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  twilio: {
    accountSid: requiredUnlessDryRun("TWILIO_ACCOUNT_SID"),
    authToken: requiredUnlessDryRun("TWILIO_AUTH_TOKEN"),
    messagingServiceSid,
    fromNumber,
  },
  fbCollectorUrl: process.env.FB_COLLECTOR_URL,
  fbCollectorToken: process.env.FB_COLLECTOR_TOKEN,
  ingestSecret: process.env.INGEST_SECRET,
  databasePath: process.env.DATABASE_PATH ?? "./watcher.db",
  port: int("PORT", 8080),
  pollIntervalSeconds: int("POLL_INTERVAL_SECONDS", 90),
  dryRun,
};

if (!dryRun && !messagingServiceSid && !fromNumber) {
  throw new Error(
    "Set TWILIO_MESSAGING_SERVICE_SID (preferred — it carries your 10DLC campaign) or TWILIO_FROM_NUMBER.",
  );
}
