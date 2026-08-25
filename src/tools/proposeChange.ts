import { z } from "zod";
import { workspaceRoot } from "../security/sandbox.js";
import { plan as runPlan } from "../terraform/run.js";
import { formatChangeSummaryMarkdown } from "../terraform/planParser.js";
import { runCheckov } from "../policy/checkov.js";
import { runOpa } from "../policy/opa.js";
import { mergeFindings, formatPolicyReportMarkdown } from "../policy/merge.js";
import { estimateCost, formatCostMarkdown } from "../cost/infracost.js";
import { redactPlanResourceChange } from "../security/redact.js";

export const proposeChangeSchema = z.object({
  workspaceId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
});

export async function tf_propose_change(input: z.infer<typeof proposeChangeSchema>) {
  const root = workspaceRoot(input.workspaceId);
  const { changeSummary } = await runPlan(input.workspaceId, root);

  const providers = [...new Set(changeSummary.resources.map((r) => r.providerName))];
  const [checkovFindings, opaFindings, cost] = await Promise.all([
    runCheckov(changeSummary.planJsonPath, root),
    runOpa(changeSummary.planJsonPath, root, providers),
    estimateCost(changeSummary.planJsonPath, root),
  ]);

  const policyReport = mergeFindings(checkovFindings, opaFindings);

  const recommendation: "safe" | "needs_review" | "blocked" = policyReport.blocking
    ? "blocked"
    : changeSummary.resources.some((r) => r.isDestructive) || policyReport.findings.length > 0
      ? "needs_review"
      : "safe";

  const markdown = [
    formatChangeSummaryMarkdown(changeSummary),
    "",
    formatPolicyReportMarkdown(policyReport),
    "",
    formatCostMarkdown(cost),
    "",
    `**Recommendation:** ${recommendation}`,
  ].join("\n");

  return {
    workspaceId: input.workspaceId,
    planChecksum: changeSummary.planChecksum,
    changeSummary: {
      counts: changeSummary.counts,
      resources: changeSummary.resources,
      resourceChangesRedacted: ((changeSummary.raw as any)?.resource_changes ?? []).map(redactPlanResourceChange),
    },
    policyReport,
    cost,
    recommendation,
    markdown,
  };
}
