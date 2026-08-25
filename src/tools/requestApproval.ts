import { z } from "zod";
import { config } from "../config.js";
import { workspaceRoot } from "../security/sandbox.js";
import { plan as runPlan, checkDrift } from "../terraform/run.js";
import { formatChangeSummaryMarkdown } from "../terraform/planParser.js";
import { runCheckov } from "../policy/checkov.js";
import { runOpa } from "../policy/opa.js";
import { mergeFindings, formatPolicyReportMarkdown } from "../policy/merge.js";
import { estimateCost, formatCostMarkdown } from "../cost/infracost.js";
import { createApproval, findPendingForWorkspace, invalidateStaleApproval, attachSlackMessage } from "../approval/store.js";
import { isSlackConfigured, postApprovalRequest, updateStaleMessage } from "../slack/client.js";
import { promptCliApproval } from "../approval/cliApproval.js";

export const requestApprovalSchema = z.object({
  workspaceId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  overridePolicy: z.boolean().optional().describe("Explicitly override a blocking policy verdict. Requires TF_APPROVAL_GATE_ALLOW_POLICY_OVERRIDE=true server-side."),
});

export async function tf_request_approval(input: z.infer<typeof requestApprovalSchema>) {
  const root = workspaceRoot(input.workspaceId);

  // Invalidate any stale pending approval for this workspace up front -- a
  // fresh tf_request_approval call means the old one (if any) is superseded.
  const existingPending = findPendingForWorkspace(input.workspaceId);
  if (existingPending) {
    const invalidated = invalidateStaleApproval(existingPending.id);
    if (invalidated && invalidated.slackChannel && invalidated.slackMessageTs) {
      await updateStaleMessage(invalidated.slackChannel, invalidated.slackMessageTs, invalidated);
    }
  }

  const { changeSummary } = await runPlan(input.workspaceId, root);

  // Drift check: is real cloud state already different from what this plan assumed?
  const drift = await checkDrift(input.workspaceId, root, config.refreshDebounceMs);
  if (drift.hasDrift) {
    return {
      error: "drift_detected",
      message: "Real infrastructure has drifted since this plan was generated. Re-run tf_propose_change to get a fresh plan before requesting approval.",
      detail: drift.detail,
    };
  }

  const providers = [...new Set(changeSummary.resources.map((r) => r.providerName))];
  const [checkovFindings, opaFindings, cost] = await Promise.all([
    runCheckov(changeSummary.planJsonPath, root),
    runOpa(changeSummary.planJsonPath, root, providers),
    estimateCost(changeSummary.planJsonPath, root),
  ]);
  const policyReport = mergeFindings(checkovFindings, opaFindings);

  if (policyReport.blocking && !(input.overridePolicy && config.policy.allowOverride)) {
    return {
      error: "policy_blocking",
      message: `Policy findings at or above ${config.policy.blockOnSeverity} block this change from being sent for approval.`,
      policyReport,
    };
  }

  const summaryMarkdown = [
    formatChangeSummaryMarkdown(changeSummary),
    "",
    formatPolicyReportMarkdown(policyReport),
  ].join("\n");
  const costMarkdown = formatCostMarkdown(cost);

  const approval = createApproval(input.workspaceId, changeSummary.planChecksum, summaryMarkdown);

  if (config.approvalMode === "cli" || !isSlackConfigured()) {
    promptCliApproval(approval);
    return { approvalId: approval.id, mode: "cli", expiresAt: approval.expiresAt, message: "Waiting for approval on the server's terminal (stderr)." };
  }

  const posted = await postApprovalRequest(approval, costMarkdown);
  if (posted) attachSlackMessage(approval.id, posted.channel, posted.ts);

  return { approvalId: approval.id, mode: "slack", expiresAt: approval.expiresAt, message: "Posted to Slack for approval." };
}
