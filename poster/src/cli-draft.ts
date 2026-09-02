import { loadClients } from "./clients.js";
import { runWeeklyBatch } from "./weekly.js";

/** Run the weekly batch by hand: `npm run draft -- <clientId>` */
const configPath = process.env.CLIENTS_CONFIG ?? "./config/clients.json";
const { clients, targets } = loadClients(configPath);
const wanted = process.argv[2];

for (const client of clients) {
  if (wanted && client.id !== wanted) continue;
  const result = await runWeeklyBatch(client, targets);
  console.log(`${client.id}: ${result.drafted} drafted`);
  for (const skip of result.skipped) console.log(`  skipped ${skip}`);
}
