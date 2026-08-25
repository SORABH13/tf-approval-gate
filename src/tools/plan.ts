import { z } from "zod";
import { workspaceRoot } from "../security/sandbox.js";
import { plan as runPlan } from "../terraform/run.js";
import { formatChangeSummaryMarkdown } from "../terraform/planParser.js";
import { redactPlanResourceChange } from "../security/redact.js";

export const planSchema = z.object({
  workspaceId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
});

export async function tf_plan(input: z.infer<typeof planSchema>) {
  const root = workspaceRoot(input.workspaceId);
  const { changeSummary } = await runPlan(input.workspaceId, root);

  return {
    workspaceId: changeSummary.workspaceId,
    planChecksum: changeSummary.planChecksum,
    counts: changeSummary.counts,
    resources: changeSummary.resources,
    markdown: formatChangeSummaryMarkdown(changeSummary),
    // resource_changes redacted before ever reaching the LLM
    resourceChangesRedacted: ((changeSummary.raw as any)?.resource_changes ?? []).map(redactPlanResourceChange),
  };
}
