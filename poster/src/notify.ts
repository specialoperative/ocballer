import twilio from "twilio";
import { env } from "./env.js";

let client: ReturnType<typeof twilio> | null = null;
function twilioClient() {
  if (!client) client = twilio(env.twilio.accountSid, env.twilio.authToken);
  return client;
}

export async function sendSms(to: string, body: string): Promise<void> {
  if (env.dryRun) {
    console.log(`\n--- DRY RUN SMS -> ${to} ---\n${body}\n---\n`);
    return;
  }
  await twilioClient().messages.create({
    to,
    body,
    ...(env.twilio.messagingServiceSid
      ? { messagingServiceSid: env.twilio.messagingServiceSid }
      : { from: env.twilio.fromNumber! }),
  });
}
