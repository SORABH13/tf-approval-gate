import { z } from "zod";
import { workspaceRoot } from "../security/sandbox.js";
import { plan as runPlan } from "../terraform/run.js";
import { estimateCost, formatCostMarkdown } from "../cost/infracost.js";

export const costEstimateSchema = z.object({
  workspaceId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
});

export async function tf_cost_estimate(input: z.infer<typeof costEstimateSchema>) {
  const root = workspaceRoot(input.workspaceId);
  const { changeSummary } = await runPlan(input.workspaceId, root);
  const cost = await estimateCost(changeSummary.planJsonPath, root);
  return { ...cost, markdown: formatCostMarkdown(cost) };
}
