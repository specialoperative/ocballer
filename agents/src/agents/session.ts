import { defineAgent } from "../kernel/agent.js";
import type { Account } from "../domain.js";

/**
 * □ session — holds one account's authenticated session on one edge node.
 *
 * It holds `session.hold` and `session.read`, and by the compartment rules it
 * can never also hold `publish`. It hands out a short-lived handle; whatever
 * actually drives the platform lives behind `driverUrl` on the same machine,
 * so credentials never leave the node and never enter the control plane.
 */
export interface SessionHandle {
  accountId: string;
  /** Local endpoint on this node that can act with the session. */
  driverUrl: string;
  healthy: boolean;
  detail: string;
}

export const sessionAgent = defineAgent<
  { account: Account; driverUrl: string | undefined },
  SessionHandle
>({
  name: "session",
  capabilities: ["session.hold", "session.read"],
  async run({ account, driverUrl }, ctx) {
    ctx.require("session.hold");

    if (!driverUrl) {
      return {
        accountId: account.id,
        driverUrl: "",
        healthy: false,
        detail: "no DRIVER_URL on this node — nothing can act with this account",
      };
    }

    try {
      const response = await fetch(`${driverUrl}/health`, { signal: AbortSignal.timeout(8_000) });
      const healthy = response.ok;
      return {
        accountId: account.id,
        driverUrl,
        healthy,
        detail: healthy ? "session driver reachable" : `driver returned ${response.status}`,
      };
    } catch (error) {
      return {
        accountId: account.id,
        driverUrl,
        healthy: false,
        detail: `driver unreachable: ${(error as Error).message}`,
      };
    }
  },
});
