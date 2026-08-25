import type { ChangeAction, ChangeSummary, ResourceChangeSummary } from "./types.js";

/**
 * Parses `terraform show -json <planfile>` output into a per-resource
 * ChangeSummary. Destructive = "delete" appears anywhere in change.actions
 * (covers both a pure delete and a delete-then-create replace).
 */
export function parsePlanJson(
  planJson: any,
  meta: { workspaceId: string; planChecksum: string; planJsonPath: string; planBinaryPath: string },
): ChangeSummary {
  const rawChanges: any[] = planJson?.resource_changes ?? [];
  const resources: ResourceChangeSummary[] = rawChanges.map((rc) => {
    const actions: ChangeAction[] = rc.change?.actions ?? ["no-op"];
    const isDestructive = actions.includes("delete");
    return {
      address: rc.address,
      type: rc.type,
      name: rc.name,
      providerName: rc.provider_name ?? "unknown",
      actions,
      isDestructive,
    };
  });

  const counts = { create: 0, update: 0, delete: 0, replace: 0, noop: 0 };
  for (const r of resources) {
    if (r.actions.includes("delete") && r.actions.includes("create")) counts.replace++;
    else if (r.actions.includes("delete")) counts.delete++;
    else if (r.actions.includes("create")) counts.create++;
    else if (r.actions.includes("update")) counts.update++;
    else counts.noop++;
  }

  return {
    workspaceId: meta.workspaceId,
    planChecksum: meta.planChecksum,
    planJsonPath: meta.planJsonPath,
    planBinaryPath: meta.planBinaryPath,
    resources,
    counts,
    raw: planJson,
  };
}

export function formatChangeSummaryMarkdown(summary: ChangeSummary): string {
  const lines: string[] = [];
  lines.push(
    `**Plan summary:** ${summary.counts.create} to add, ${summary.counts.update} to change, ` +
      `${summary.counts.delete} to destroy, ${summary.counts.replace} to replace`,
  );
  if (summary.resources.length === 0) {
    lines.push("_No changes._");
    return lines.join("\n");
  }
  for (const r of summary.resources) {
    if (r.actions.includes("no-op") || r.actions.length === 0) continue;
    const verb = r.actions.includes("delete") && r.actions.includes("create") ? "replace" : r.actions.join("+");
    const marker = r.isDestructive ? "⚠️ " : "";
    lines.push(`- ${marker}\`${verb}\` ${r.address}`);
  }
  return lines.join("\n");
}
