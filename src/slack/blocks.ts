import type { PendingApproval } from "../approval/store.js";

export function buildApprovalBlocks(approval: PendingApproval, extraMarkdown?: string) {
  const blocks: any[] = [
    { type: "header", text: { type: "plain_text", text: "🛡️ Terraform change awaiting approval" } },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Workspace:* \`${approval.workspaceId}\`\n*Expires:* <!date^${Math.floor(approval.expiresAt / 1000)}^{date_short_pretty} {time}|${new Date(approval.expiresAt).toISOString()}>` },
    },
    { type: "section", text: { type: "mrkdwn", text: approval.summaryMarkdown.slice(0, 2900) } },
  ];
  if (extraMarkdown) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: extraMarkdown.slice(0, 2900) } });
  }
  blocks.push(
    { type: "divider" },
    {
      type: "actions",
      block_id: "tf_approval_actions",
      elements: [
        { type: "button", style: "primary", text: { type: "plain_text", text: "✅ Approve" }, action_id: "tf_approve", value: approval.id },
        { type: "button", style: "danger", text: { type: "plain_text", text: "❌ Reject" }, action_id: "tf_reject", value: approval.id },
      ],
    },
  );
  return blocks;
}

export function buildResolvedBlocks(approval: PendingApproval): any[] {
  const icon = approval.status === "approved" ? "✅" : approval.status === "rejected" ? "❌" : "⌛";
  const label =
    approval.status === "expired"
      ? "This approval request expired or was invalidated because the plan changed."
      : `${icon} ${approval.status.toUpperCase()} by <@${approval.respondedBy}>`;
  return [
    { type: "header", text: { type: "plain_text", text: "🛡️ Terraform change" } },
    { type: "section", text: { type: "mrkdwn", text: `*Workspace:* \`${approval.workspaceId}\`\n${label}` } },
    { type: "section", text: { type: "mrkdwn", text: approval.summaryMarkdown.slice(0, 2900) } },
  ];
}
