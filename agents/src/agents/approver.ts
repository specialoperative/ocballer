import { defineAgent } from "../kernel/agent.js";
import { getPost, setState } from "../kernel/store.js";

/**
 * □ approver — records the business's decision and nothing else.
 *
 * It holds `approve` and `notify`, deliberately not `draft`: an agent that can
 * both write copy and bless it is not an approval gate.
 */
export const approver = defineAgent<
  { postId: number; decision: "approve" | "reject"; actor: string; editedBody?: string },
  { ok: boolean; error?: string }
>({
  name: "approver",
  capabilities: ["approve", "notify", "queue.read", "queue.write"],
  async run({ postId, decision, actor, editedBody }, ctx) {
    ctx.require("approve");

    const post = getPost(postId);
    if (!post) return { ok: false, error: "unknown post" };
    if (post.state !== "drafted") return { ok: false, error: `post is already ${post.state}` };

    if (decision === "approve" && editedBody && editedBody !== post.body) {
      ctx.log("edited", postId, editedBody.slice(0, 120));
    }
    setState(postId, decision === "approve" ? "approved" : "rejected", actor);
    return { ok: true };
  },
});
