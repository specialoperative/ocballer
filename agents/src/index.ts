import "dotenv/config";
import { loadSystem } from "./config.js";
import { startControl } from "./nodes/control.js";
import { startEdge } from "./nodes/edge.js";
import { report } from "./capacity.js";

const role = process.env.ROLE ?? process.argv[2] ?? "control";
const configPath = process.env.SYSTEM_CONFIG ?? "./config/system.json";
const system = loadSystem(configPath);

if (role === "capacity") {
  console.log(report(system.accounts));
} else if (role === "edge") {
  await startEdge(system, {
    nodeId: process.env.NODE_ID ?? "edge-1",
    controlUrl: process.env.CONTROL_URL ?? "http://localhost:8090",
    driverUrl: process.env.DRIVER_URL,
    dryRun: process.env.DRY_RUN === "1",
    pollSeconds: Number.parseInt(process.env.POLL_SECONDS ?? "30", 10),
  });
} else {
  startControl(system, Number.parseInt(process.env.PORT ?? "8090", 10));
}
