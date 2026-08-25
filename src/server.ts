import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { tools } from "./tools/index.js";
import { redactByKeyName } from "./security/redact.js";
import { logger } from "./utils/logger.js";
import { startSlack, isSlackConfigured } from "./slack/client.js";
import { config } from "./config.js";

export async function buildServer(): Promise<McpServer> {
  const server = new McpServer({ name: "tf-approval-gate", version: "0.1.0" });

  for (const tool of tools) {
    const shape = tool.schema instanceof z.ZodObject ? tool.schema.shape : { input: tool.schema };
    server.tool(tool.name, tool.description, shape, async (args: unknown) => {
      try {
        const parsed = tool.schema.parse(args);
        const result = await tool.handler(parsed);
        const redacted = redactByKeyName(result);
        return { content: [{ type: "text" as const, text: JSON.stringify(redacted, null, 2) }] };
      } catch (err) {
        logger.error(`tool ${tool.name} failed`, { error: err instanceof Error ? err.message : String(err) });
        return {
          isError: true,
          content: [{ type: "text" as const, text: JSON.stringify({ error: "tool_failed", message: err instanceof Error ? err.message : String(err) }) }],
        };
      }
    });
  }

  return server;
}

export async function main(): Promise<void> {
  if (config.approvalMode === "slack" && isSlackConfigured()) {
    await startSlack();
  } else if (config.approvalMode === "slack") {
    logger.warn("APPROVAL_MODE=slack but Slack env vars are incomplete; falling back to CLI approval for this run.");
  }

  const server = await buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("tf-approval-gate MCP server started", { approvalMode: config.approvalMode, slackConfigured: isSlackConfigured() });
}
