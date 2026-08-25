import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { mintToken, verifyToken, hashToken } from "./token.js";
import { appendAudit } from "../security/audit.js";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "consumed";

export interface PendingApproval {
  id: string;
  workspaceId: string;
  planChecksum: string;
  status: ApprovalStatus;
  createdAt: number;
  expiresAt: number;
  respondedBy?: string;
  respondedAt?: number;
  approvalToken?: string; // present only in-memory/on-disk between approve and consume; never logged
  slackMessageTs?: string;
  slackChannel?: string;
  summaryMarkdown: string;
}

const storePath = path.join(config.stateDir, "approvals.json");

function load(): Record<string, PendingApproval> {
  if (!fs.existsSync(storePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(storePath, "utf8"));
  } catch {
    return {};
  }
}

function save(all: Record<string, PendingApproval>): void {
  fs.mkdirSync(config.stateDir, { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(all, null, 2), "utf8");
}

function sweepExpired(all: Record<string, PendingApproval>): void {
  const now = Date.now();
  for (const a of Object.values(all)) {
    if (a.status === "pending" && a.expiresAt < now) {
      a.status = "expired";
    }
  }
}

export function createApproval(workspaceId: string, planChecksum: string, summaryMarkdown: string): PendingApproval {
  const all = load();
  sweepExpired(all);
  const approval: PendingApproval = {
    id: randomUUID(),
    workspaceId,
    planChecksum,
    status: "pending",
    createdAt: Date.now(),
    expiresAt: Date.now() + config.approvalTtlMs,
    summaryMarkdown,
  };
  all[approval.id] = approval;
  save(all);
  appendAudit({ type: "approval_created", workspaceId, approvalId: approval.id, planChecksum });
  return approval;
}

export function getApproval(id: string): PendingApproval | undefined {
  const all = load();
  sweepExpired(all);
  save(all);
  return all[id];
}

export function findPendingForWorkspace(workspaceId: string): PendingApproval | undefined {
  const all = load();
  sweepExpired(all);
  save(all);
  return Object.values(all).find((a) => a.workspaceId === workspaceId && a.status === "pending");
}

export function attachSlackMessage(id: string, channel: string, ts: string): void {
  const all = load();
  const a = all[id];
  if (!a) return;
  a.slackChannel = channel;
  a.slackMessageTs = ts;
  save(all);
}

/** Atomically transitions pending -> approved|rejected. Idempotent no-op if already resolved. */
export function resolveApproval(id: string, status: "approved" | "rejected", respondedBy: string): PendingApproval | undefined {
  const all = load();
  sweepExpired(all);
  const a = all[id];
  if (!a) return undefined;
  if (a.status !== "pending") return a; // already resolved -- ignore duplicate clicks
  a.status = status;
  a.respondedBy = respondedBy;
  a.respondedAt = Date.now();
  if (status === "approved") {
    a.approvalToken = mintToken(a.id, a.planChecksum, a.expiresAt);
  }
  save(all);
  appendAudit({ type: `approval_${status}`, workspaceId: a.workspaceId, approvalId: a.id, planChecksum: a.planChecksum, actor: respondedBy });
  return a;
}

/**
 * Invalidates a pending approval because the underlying plan changed (new
 * checksum) before it was approved -- prevents a stale Slack Approve button
 * from approving an outdated plan.
 */
export function invalidateStaleApproval(id: string): PendingApproval | undefined {
  const all = load();
  const a = all[id];
  if (!a || a.status !== "pending") return a;
  a.status = "expired";
  save(all);
  appendAudit({ type: "approval_invalidated_stale_plan", workspaceId: a.workspaceId, approvalId: a.id, planChecksum: a.planChecksum });
  return a;
}

export type ConsumeResult =
  | { ok: true; approval: PendingApproval }
  | { ok: false; reason: "not_found" | "not_approved" | "expired" | "bad_signature" | "checksum_mismatch" | "already_consumed" };

/**
 * The only path by which tf_apply is allowed to proceed. Verifies the token
 * signature against the *current* planChecksum (so a re-plan invalidates old
 * tokens), then atomically flips approved -> consumed so the token can never
 * be used twice, even if it leaks.
 */
export function consumeToken(approvalId: string, token: string, currentPlanChecksum: string): ConsumeResult {
  const all = load();
  const a = all[approvalId];
  if (!a) return { ok: false, reason: "not_found" };
  if (a.status === "consumed") return { ok: false, reason: "already_consumed" };
  if (a.status !== "approved") return { ok: false, reason: "not_approved" };
  if (a.planChecksum !== currentPlanChecksum) return { ok: false, reason: "checksum_mismatch" };

  const verified = verifyToken(token, currentPlanChecksum);
  if (!verified.ok) {
    return { ok: false, reason: verified.reason === "expired" ? "expired" : "bad_signature" };
  }
  if (verified.payload.approvalId !== approvalId) return { ok: false, reason: "bad_signature" };

  a.status = "consumed";
  const tokenHash = hashToken(token);
  save(all);
  appendAudit({ type: "approval_consumed", workspaceId: a.workspaceId, approvalId: a.id, planChecksum: a.planChecksum, tokenHash });
  return { ok: true, approval: a };
}
