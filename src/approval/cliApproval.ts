import readline from "node:readline";
import { resolveApproval, type PendingApproval } from "./store.js";
import { logger } from "../utils/logger.js";

/**
 * APPROVAL_MODE=cli: prints the proposal to the terminal running the server
 * and waits for a y/n. Documented as local/dev-only -- weaker guarantee than
 * Slack because "a human at this terminal" is a much easier bar than "an
 * allow-listed Slack user clicked a button", but it uses the exact same
 * signed single-use token path into tf_apply underneath.
 */
export function promptCliApproval(approval: PendingApproval): void {
  process.stderr.write(
    `\n=== TF APPROVAL GATE: approval required (dev CLI mode) ===\n` +
      `Workspace: ${approval.workspaceId}\nApproval ID: ${approval.id}\n\n${approval.summaryMarkdown}\n\n`,
  );
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  rl.question("Approve this change? [y/N] ", (answer) => {
    rl.close();
    const decision = answer.trim().toLowerCase() === "y" ? "approved" : "rejected";
    resolveApproval(approval.id, decision, "cli-operator");
    logger.info("CLI approval decision recorded", { approvalId: approval.id, decision });
  });
}
