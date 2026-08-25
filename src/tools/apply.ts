import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { workspaceRoot } from "../security/sandbox.js";
import { checkDrift, apply as runApply } from "../terraform/run.js";
import { consumeToken } from "../approval/store.js";
import { appendAudit } from "../security/audit.js";

export const applySchema = z.object({
  workspaceId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  approvalId: z.string().uuid(),
  approvalToken: z.string(),
});

/**
 * The only code path that shells out to `terraform apply`. Re-verifies,
 * server-side, everything the agent could otherwise lie about:
 *   1. the binary plan artifact on disk still hashes to the checksum the
 *      approval was granted for (not just the JSON summary of it)
 *   2. no cloud-side drift has occurred since approval
 *   3. the token's signature, expiry, and single-use status
 * Any failure here means apply never runs.
 */
export async function tf_apply(input: z.infer<typeof applySchema>) {
  const root = workspaceRoot(input.workspaceId);
  const binaryPath = path.join(root, "tfplan.binary");
  const jsonPath = path.join(root, "tfplan.json");

  if (!fs.existsSync(binaryPath) || !fs.existsSync(jsonPath)) {
    return { error: "no_plan", message: "No plan artifact found for this workspace. Run tf_propose_change / tf_request_approval first." };
  }

  const currentChecksum = createHash("sha256").update(fs.readFileSync(binaryPath)).digest("hex");

  const consumed = consumeToken(input.approvalId, input.approvalToken, currentChecksum);
  if (!consumed.ok) {
    appendAudit({ type: "apply_rejected", workspaceId: input.workspaceId, approvalId: input.approvalId, detail: { reason: consumed.reason } });
    return {
      error: "approval_invalid",
      reason: consumed.reason,
      message: describeRejection(consumed.reason),
    };
  }

  // Final drift backstop right before apply, alongside the checksum check above.
  const drift = await checkDrift(input.workspaceId, root, 0);
  if (drift.hasDrift) {
    appendAudit({ type: "apply_rejected", workspaceId: input.workspaceId, approvalId: input.approvalId, detail: { reason: "drift_detected" } });
    return {
      error: "drift_detected",
      message: "Cloud state drifted between approval and apply. The approval token has been consumed and cannot be reused. Run tf_propose_change and get a fresh approval to retry.",
      detail: drift.detail,
    };
  }

  const planJson = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const { parsePlanJson } = await import("../terraform/planParser.js");
  const parsed = parsePlanJson(planJson, { workspaceId: input.workspaceId, planChecksum: currentChecksum, planJsonPath: jsonPath, planBinaryPath: binaryPath });

  const result = await runApply(input.workspaceId, root, parsed);

  appendAudit({
    type: "apply_completed",
    workspaceId: input.workspaceId,
    approvalId: input.approvalId,
    planChecksum: currentChecksum,
    detail: { code: result.code, resourceResults: result.resourceResults },
  });

  const anyFailed = result.resourceResults.some((r) => r.status === "failed" || r.status === "not_reached");

  return {
    success: result.code === 0 && !anyFailed,
    resourceResults: result.resourceResults,
    message:
      result.code === 0 && !anyFailed
        ? "Apply completed successfully."
        : "Apply did not complete cleanly -- see resourceResults for exactly which resources applied, failed, or were never reached. The approval token has been consumed; run tf_propose_change again to retry the remainder.",
    stderrTail: result.stderr.slice(-2000),
  };
}

function describeRejection(reason: string | undefined): string {
  switch (reason) {
    case "not_found":
      return "No such approval request.";
    case "not_approved":
      return "This request has not been approved (or was rejected/expired).";
    case "already_consumed":
      return "This approval token has already been used. Tokens are single-use; run tf_propose_change and get a fresh approval to retry.";
    case "expired":
      return "This approval token has expired.";
    case "checksum_mismatch":
      return "The plan has changed since this approval was granted (checksum mismatch). Run tf_propose_change and get a fresh approval.";
    case "bad_signature":
      return "Token signature is invalid.";
    default:
      return "Approval could not be verified.";
  }
}
