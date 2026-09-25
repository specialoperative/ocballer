import { assertCompartment, type Capability } from "./capabilities.js";
import { audit } from "./store.js";

/**
 * An agent is a named worker with a declared capability set and one job.
 *
 * Everything an agent may do goes through `ctx.can()`. An agent that never
 * declares `publish` has no path to publishing, however it is wired later.
 */
export interface AgentContext {
  name: string;
  can(capability: Capability): boolean;
  require(capability: Capability): void;
  log(action: string, postId?: number, detail?: string): void;
}

export interface AgentSpec<Input, Output> {
  name: string;
  capabilities: readonly Capability[];
  run(input: Input, ctx: AgentContext): Promise<Output>;
}

export class MissingCapability extends Error {}

export interface Agent<Input, Output> {
  name: string;
  capabilities: readonly Capability[];
  run(input: Input): Promise<Output>;
}

/** Constructing an agent is where compartments are enforced. */
export function defineAgent<Input, Output>(spec: AgentSpec<Input, Output>): Agent<Input, Output> {
  assertCompartment(spec.name, spec.capabilities);

  const ctx: AgentContext = {
    name: spec.name,
    can: (capability) => spec.capabilities.includes(capability),
    require(capability) {
      if (!spec.capabilities.includes(capability)) {
        throw new MissingCapability(`${spec.name} does not hold ${capability}.`);
      }
    },
    log: (action, postId, detail) => audit(spec.name, action, postId, detail),
  };

  return {
    name: spec.name,
    capabilities: spec.capabilities,
    run: (input) => spec.run(input, ctx),
  };
}
