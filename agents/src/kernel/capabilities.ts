/**
 * Compartments.
 *
 * The rule from the notes: the agent that holds the login is not the agent that
 * posts. Here that is not a convention — an agent declares the capabilities it
 * needs, the registry hands it exactly those, and two of them may never be held
 * together by the same agent.
 */
export const CAPABILITIES = [
  "session.hold", // keeps an authenticated session for one account
  "session.read", // may read what a session can see
  "publish", // may submit one approved payload to a surface
  "draft", // may generate copy
  "approve", // may record a business decision
  "schedule", // may decide when something posts
  "notify", // may send SMS
  "queue.read", // may see pending work
  "queue.write", // may change work state
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * Pairs that must never live in one agent. Each entry is the reason it exists,
 * so a future edit has to argue with the reason rather than delete a constant.
 */
const FORBIDDEN_PAIRS: [Capability, Capability, string][] = [
  [
    "session.hold",
    "publish",
    "the credential holder must not be the publisher — that is the whole □² split",
  ],
  [
    "draft",
    "approve",
    "a drafter approving its own copy defeats the business's approval gate",
  ],
  [
    "publish",
    "queue.read",
    "a publisher must see one payload, never the queue it came from",
  ],
];

export class CompartmentViolation extends Error {}

/** Throws rather than returns: a bad compartment is a build error, not a state. */
export function assertCompartment(agentName: string, granted: readonly Capability[]): void {
  for (const [left, right, reason] of FORBIDDEN_PAIRS) {
    if (granted.includes(left) && granted.includes(right)) {
      throw new CompartmentViolation(
        `Agent "${agentName}" asks for both ${left} and ${right}. Refused: ${reason}.`,
      );
    }
  }
}

export function forbiddenPairs(): readonly [Capability, Capability, string][] {
  return FORBIDDEN_PAIRS;
}
