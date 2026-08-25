import Bolt from "@slack/bolt";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { buildApprovalBlocks, buildResolvedBlocks } from "./blocks.js";
import { isApprover } from "./allowlist.js";
import { getApproval, resolveApproval } from "../approval/store.js";

let app: Bolt.App | undefined;

export function isSlackConfigured(): boolean {
  return Boolean(config.slack.botToken && config.slack.appToken && config.slack.channel);
}

/**
 * Starts the Slack app in Socket Mode (outbound websocket, app-level token)
 * so no public HTTP endpoint is required for a locally-run MCP server.
 * Button clicks are verified twice: Bolt/Slack verifies the request came
 * from Slack, and we separately check the clicking user is on
 * SLACK_APPROVER_USER_IDS before minting any token.
 */
export async function startSlack(): Promise<void> {
  if (!isSlackConfigured()) {
    logger.warn("Slack not configured (SLACK_BOT_TOKEN/SLACK_APP_TOKEN/SLACK_APPROVAL_CHANNEL); Slack approval mode unavailable");
    return;
  }

  app = new Bolt.App({
    token: config.slack.botToken,
    appToken: config.slack.appToken,
    socketMode: true,
  });

  app.action("tf_approve", async ({ ack, body, client }) => {
    await ack();
    await handleDecision(body as any, client, "approved");
  });

  app.action("tf_reject", async ({ ack, body, client }) => {
    await ack();
    await handleDecision(body as any, client, "rejected");
  });

  await app.start();
  logger.info("Slack Socket Mode connected");
}

async function handleDecision(body: any, client: any, decision: "approved" | "rejected"): Promise<void> {
  const userId: string = body.user?.id;
  const approvalId: string = body.actions?.[0]?.value;
  const channel = body.channel?.id;
  const ts = body.message?.ts;

  const approval = getApproval(approvalId);
  if (!approval) {
    logger.warn("Slack action for unknown approval id", { approvalId, userId });
    return;
  }

  if (!isApprover(userId)) {
    logger.warn("Slack decision from non-allow-listed user rejected", { userId, approvalId });
    if (channel && ts) {
      await client.chat.postMessage({
        channel,
        thread_ts: ts,
        text: `<@${userId}> is not on the approver allowlist for this workspace; decision ignored.`,
      });
    }
    return;
  }

  const resolved = resolveApproval(approvalId, decision, userId);
  if (!resolved) return;

  if (channel && ts) {
    await client.chat.update({ channel, ts, blocks: buildResolvedBlocks(resolved), text: `Terraform change ${resolved.status}` });
  }
}

export async function postApprovalRequest(approval: Parameters<typeof buildApprovalBlocks>[0], costMarkdown?: string): Promise<{ channel: string; ts: string } | undefined> {
  if (!app) return undefined;
  const client = app.client;
  const result = await client.chat.postMessage({
    channel: config.slack.channel,
    blocks: buildApprovalBlocks(approval, costMarkdown),
    text: "Terraform change awaiting approval",
  });
  return { channel: result.channel as string, ts: result.ts as string };
}

export async function updateStaleMessage(channel: string, ts: string, approval: Parameters<typeof buildResolvedBlocks>[0]): Promise<void> {
  if (!app) return;
  await app.client.chat.update({ channel, ts, blocks: buildResolvedBlocks(approval), text: "Terraform approval invalidated (plan changed)" });
}
