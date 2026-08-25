import { z } from "zod";
import { workspaceRoot } from "../security/sandbox.js";
import { plan as runPlan } from "../terraform/run.js";
import { runCheckov } from "../policy/checkov.js";
import { runOpa } from "../policy/opa.js";
import { mergeFindings, formatPolicyReportMarkdown } from "../policy/merge.js";

export const policyCheckSchema = z.object({
  workspaceId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
});

export async function tf_policy_check(input: z.infer<typeof policyCheckSchema>) {
  const root = workspaceRoot(input.workspaceId);
  const { changeSummary } = await runPlan(input.workspaceId, root);

  const providers = [...new Set(changeSummary.resources.map((r) => r.providerName))];
  const [checkovFindings, opaFindings] = await Promise.all([
    runCheckov(changeSummary.planJsonPath, root),
    runOpa(changeSummary.planJsonPath, root, providers),
  ]);

  const report = mergeFindings(checkovFindings, opaFindings);
  return { ...report, markdown: formatPolicyReportMarkdown(report), planChecksum: changeSummary.planChecksum };
}
