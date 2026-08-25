import { config } from "../config.js";

export function isApprover(slackUserId: string): boolean {
  if (config.slack.approverUserIds.length === 0) return false; // fail closed: no allowlist = no approvers
  return config.slack.approverUserIds.includes(slackUserId);
}
