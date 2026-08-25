import { run } from "../utils/exec.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

export interface CostEstimate {
  skipped: boolean;
  reason?: string;
  monthlyDeltaUsd?: number;
  currency?: string;
  raw?: unknown;
}

/**
 * Runs `infracost breakdown` against the plan JSON. Soft-fails (skipped:
 * true) rather than throwing when INFRACOST_API_KEY isn't set or the binary
 * is missing -- cost estimation is a nice-to-have layered on top of the
 * plan/policy/approval loop, never a blocker for it.
 */
export async function estimateCost(planJsonPath: string, workspaceRoot: string): Promise<CostEstimate> {
  if (!config.cost.infracostApiKey) {
    return { skipped: true, reason: "INFRACOST_API_KEY not set" };
  }

  let res;
  try {
    res = await run(
      "infracost",
      ["breakdown", "--path", planJsonPath, "--format", "json"],
      { cwd: workspaceRoot, timeoutMs: 2 * 60 * 1000, env: { INFRACOST_API_KEY: config.cost.infracostApiKey } },
    );
  } catch (err) {
    logger.warn("infracost unavailable, skipping cost estimate", { error: String(err) });
    return { skipped: true, reason: "infracost binary not available" };
  }

  if (res.code !== 0) {
    logger.warn("infracost breakdown failed, skipping cost estimate", { stderr: res.stderr.slice(0, 500) });
    return { skipped: true, reason: "infracost breakdown failed" };
  }

  try {
    const parsed = JSON.parse(res.stdout);
    const monthlyDeltaUsd = Number(parsed?.diffTotalMonthlyCost ?? parsed?.totalMonthlyCost ?? 0);
    return { skipped: false, monthlyDeltaUsd, currency: parsed?.currency ?? "USD", raw: parsed };
  } catch {
    return { skipped: true, reason: "could not parse infracost output" };
  }
}

export function formatCostMarkdown(cost: CostEstimate): string {
  if (cost.skipped) return `**Cost estimate:** skipped (${cost.reason})`;
  const sign = (cost.monthlyDeltaUsd ?? 0) >= 0 ? "+" : "";
  return `**Cost estimate:** ${sign}${cost.monthlyDeltaUsd?.toFixed(2)} ${cost.currency}/month`;
}
