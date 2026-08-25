import { randomBytes } from "node:crypto";
import path from "node:path";
import { config as loadDotenv } from "dotenv";

// Loads .env from the current working directory if present. Real
// environment variables (e.g. set by an MCP client's `env` block, or
// Docker's `-e`) always win -- dotenv never overrides an already-set var.
loadDotenv();

function boolEnv(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

function intEnv(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// SERVER_SECRET must never be logged, returned in a tool response, or passed
// through execFile env to any subprocess. It lives only in this module's
// closure (see security/secret.ts for the enforced accessor).
const SERVER_SECRET = process.env.TF_APPROVAL_GATE_SECRET ?? randomBytes(32).toString("hex");
if (!process.env.TF_APPROVAL_GATE_SECRET) {
  process.stderr.write(
    "[tf-approval-gate] WARNING: TF_APPROVAL_GATE_SECRET not set -- generated an ephemeral secret. " +
      "Approval tokens will not survive a server restart. Set TF_APPROVAL_GATE_SECRET for production use.\n",
  );
}

export const config = {
  serverSecret: SERVER_SECRET,
  workdir: path.resolve(process.env.TF_APPROVAL_GATE_WORKDIR ?? path.join(process.cwd(), ".tf-approval-gate", "workspaces")),
  stateDir: path.resolve(process.env.TF_APPROVAL_GATE_STATE_DIR ?? path.join(process.cwd(), ".tf-approval-gate")),

  approvalMode: (process.env.APPROVAL_MODE ?? "slack") as "slack" | "cli",
  approvalTtlMs: intEnv("TF_APPROVAL_GATE_APPROVAL_TTL_MS", 30 * 60 * 1000),

  slack: {
    botToken: process.env.SLACK_BOT_TOKEN ?? "",
    appToken: process.env.SLACK_APP_TOKEN ?? "",
    channel: process.env.SLACK_APPROVAL_CHANNEL ?? "",
    approverUserIds: (process.env.SLACK_APPROVER_USER_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  },

  policy: {
    blockOnSeverity: process.env.TF_APPROVAL_GATE_BLOCK_SEVERITY ?? "HIGH", // HIGH or CRITICAL
    allowOverride: boolEnv("TF_APPROVAL_GATE_ALLOW_POLICY_OVERRIDE", false),
  },

  cost: {
    infracostApiKey: process.env.INFRACOST_API_KEY ?? "",
  },

  allowedProviders: (process.env.TF_APPROVAL_GATE_ALLOWED_PROVIDERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  allowedModuleSources: (process.env.TF_APPROVAL_GATE_ALLOWED_MODULE_SOURCES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  execTimeoutMs: intEnv("TF_APPROVAL_GATE_EXEC_TIMEOUT_MS", 5 * 60 * 1000),
  execMaxBufferBytes: intEnv("TF_APPROVAL_GATE_EXEC_MAX_BUFFER", 20 * 1024 * 1024),

  refreshDebounceMs: intEnv("TF_APPROVAL_GATE_REFRESH_DEBOUNCE_MS", 20 * 1000),
};
