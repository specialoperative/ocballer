import "dotenv/config";

const dryRun = process.env.DRY_RUN === "1";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to .env — see the keys table in README.md.`);
  }
  return value;
}

function requiredUnlessDryRun(name: string): string {
  return dryRun ? (process.env[name] ?? "") : required(name);
}

export const env = {
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  twilio: {
    accountSid: requiredUnlessDryRun("TWILIO_ACCOUNT_SID"),
    authToken: requiredUnlessDryRun("TWILIO_AUTH_TOKEN"),
    messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
    fromNumber: process.env.TWILIO_FROM_NUMBER,
  },
  // Falls back to an ephemeral secret in dry runs so links still verify locally.
  approvalSecret: process.env.APPROVAL_SECRET ?? (dryRun ? "dry-run-secret" : required("APPROVAL_SECRET")),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:8081",
  publisherUrl: process.env.PUBLISHER_URL,
  publisherToken: process.env.PUBLISHER_TOKEN,
  watcherIngestUrl: process.env.WATCHER_INGEST_URL,
  watcherIngestSecret: process.env.WATCHER_INGEST_SECRET,
  databasePath: process.env.DATABASE_PATH ?? "./poster.db",
  port: Number.parseInt(process.env.PORT ?? "8081", 10),
  dryRun,
};

if (!dryRun && !env.twilio.messagingServiceSid && !env.twilio.fromNumber) {
  throw new Error("Set TWILIO_MESSAGING_SERVICE_SID (preferred) or TWILIO_FROM_NUMBER.");
}
