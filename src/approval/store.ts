import { randomUUID } from "node:crypto";
import type { SqlValue } from "sql.js";
import { getDb, persist } from "./db.js";
import { mintToken, verifyToken, hashToken } from "./token.js";
import { appendAudit } from "../security/audit.js";
import { config } from "../config.js";

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
  approvalToken?: string; // present only between approve and consume; never logged
  slackMessageTs?: string;
  slackChannel?: string;
  summaryMarkdown: string;
}

function rowToApproval(row: Record<string, unknown>): PendingApproval {
  return {
    id: row.id as string,
    workspaceId: row.workspaceId as string,
    planChecksum: row.planChecksum as string,
    status: row.status as ApprovalStatus,
    createdAt: row.createdAt as number,
    expiresAt: row.expiresAt as number,
    respondedBy: (row.respondedBy as string) ?? undefined,
    respondedAt: (row.respondedAt as number) ?? undefined,
    approvalToken: (row.approvalToken as string) ?? undefined,
    slackMessageTs: (row.slackMessageTs as string) ?? undefined,
    slackChannel: (row.slackChannel as string) ?? undefined,
    summaryMarkdown: row.summaryMarkdown as string,
  };
}

function queryOne(sql: string, params: Record<string, SqlValue>): PendingApproval | undefined {
  const db = getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const found = stmt.step();
  const row = found ? (stmt.getAsObject() as Record<string, unknown>) : undefined;
  stmt.free();
  return row ? rowToApproval(row) : undefined;
}

function run(sql: string, params: Record<string, SqlValue> = {}): number {
  const db = getDb();
  db.run(sql, params);
  return db.getRowsModified();
}

/** Lazily marks any pending approval whose TTL has passed as expired. Runs before every read. */
function sweepExpired(): void {
  run("UPDATE approvals SET status = 'expired' WHERE status = 'pending' AND expiresAt < :now", { ":now": Date.now() });
}

export function createApproval(workspaceId: string, planChecksum: string, summaryMarkdown: string): PendingApproval {
  sweepExpired();
  const approval: PendingApproval = {
    id: randomUUID(),
    workspaceId,
    planChecksum,
    status: "pending",
    createdAt: Date.now(),
    expiresAt: Date.now() + config.approvalTtlMs,
    summaryMarkdown,
  };
  run(
    `INSERT INTO approvals (id, workspaceId, planChecksum, status, createdAt, expiresAt, summaryMarkdown)
     VALUES (:id, :workspaceId, :planChecksum, :status, :createdAt, :expiresAt, :summaryMarkdown)`,
    {
      ":id": approval.id,
      ":workspaceId": approval.workspaceId,
      ":planChecksum": approval.planChecksum,
      ":status": approval.status,
      ":createdAt": approval.createdAt,
      ":expiresAt": approval.expiresAt,
      ":summaryMarkdown": approval.summaryMarkdown,
    },
  );
  persist();
  appendAudit({ type: "approval_created", workspaceId, approvalId: approval.id, planChecksum });
  return approval;
}

export function getApproval(id: string): PendingApproval | undefined {
  sweepExpired();
  persist();
  return queryOne("SELECT * FROM approvals WHERE id = :id", { ":id": id });
}

export function findPendingForWorkspace(workspaceId: string): PendingApproval | undefined {
  sweepExpired();
  persist();
  return queryOne(
    "SELECT * FROM approvals WHERE workspaceId = :workspaceId AND status = 'pending' ORDER BY createdAt DESC LIMIT 1",
    { ":workspaceId": workspaceId },
  );
}

export function attachSlackMessage(id: string, channel: string, ts: string): void {
  run("UPDATE approvals SET slackChannel = :channel, slackMessageTs = :ts WHERE id = :id", {
    ":channel": channel,
    ":ts": ts,
    ":id": id,
  });
  persist();
}

/**
 * Atomically transitions pending -> approved|rejected via a single guarded
 * UPDATE (WHERE status = 'pending'). If another writer already resolved it
 * first, rowsModified is 0 and we just return the current row -- idempotent
 * no-op on a duplicate Slack click, not a race.
 */
export function resolveApproval(id: string, status: "approved" | "rejected", respondedBy: string): PendingApproval | undefined {
  sweepExpired();
  const current = queryOne("SELECT * FROM approvals WHERE id = :id", { ":id": id });
  if (!current) return undefined;
  if (current.status !== "pending") {
    persist();
    return current; // already resolved -- ignore duplicate clicks
  }

  const respondedAt = Date.now();
  const approvalToken = status === "approved" ? mintToken(current.id, current.planChecksum, current.expiresAt) : null;

  const changed = run(
    `UPDATE approvals SET status = :status, respondedBy = :respondedBy, respondedAt = :respondedAt, approvalToken = :approvalToken
     WHERE id = :id AND status = 'pending'`,
    { ":status": status, ":respondedBy": respondedBy, ":respondedAt": respondedAt, ":approvalToken": approvalToken, ":id": id },
  );
  persist();

  if (changed === 0) {
    return queryOne("SELECT * FROM approvals WHERE id = :id", { ":id": id });
  }

  appendAudit({ type: `approval_${status}`, workspaceId: current.workspaceId, approvalId: id, planChecksum: current.planChecksum, actor: respondedBy });
  return queryOne("SELECT * FROM approvals WHERE id = :id", { ":id": id });
}

/**
 * Invalidates a pending approval because the underlying plan changed (new
 * checksum) before it was approved -- prevents a stale Slack Approve button
 * from approving an outdated plan.
 */
export function invalidateStaleApproval(id: string): PendingApproval | undefined {
  const current = queryOne("SELECT * FROM approvals WHERE id = :id", { ":id": id });
  if (!current || current.status !== "pending") return current;

  run("UPDATE approvals SET status = 'expired' WHERE id = :id AND status = 'pending'", { ":id": id });
  persist();
  appendAudit({ type: "approval_invalidated_stale_plan", workspaceId: current.workspaceId, approvalId: id, planChecksum: current.planChecksum });
  return queryOne("SELECT * FROM approvals WHERE id = :id", { ":id": id });
}

export type ConsumeResult =
  | { ok: true; approval: PendingApproval }
  | { ok: false; reason: "not_found" | "not_approved" | "expired" | "bad_signature" | "checksum_mismatch" | "already_consumed" };

/**
 * The only path by which tf_apply is allowed to proceed. Verifies the token
 * signature against the *current* planChecksum (so a re-plan invalidates old
 * tokens), then atomically flips approved -> consumed via a single guarded
 * UPDATE so the token can never be used twice, even if it leaks or two
 * tf_apply calls race.
 */
export function consumeToken(approvalId: string, token: string, currentPlanChecksum: string): ConsumeResult {
  const current = queryOne("SELECT * FROM approvals WHERE id = :id", { ":id": approvalId });
  if (!current) return { ok: false, reason: "not_found" };
  if (current.status === "consumed") return { ok: false, reason: "already_consumed" };
  if (current.status !== "approved") return { ok: false, reason: "not_approved" };
  if (current.planChecksum !== currentPlanChecksum) return { ok: false, reason: "checksum_mismatch" };

  const verified = verifyToken(token, currentPlanChecksum);
  if (!verified.ok) return { ok: false, reason: verified.reason === "expired" ? "expired" : "bad_signature" };
  if (verified.payload.approvalId !== approvalId) return { ok: false, reason: "bad_signature" };

  const changed = run("UPDATE approvals SET status = 'consumed' WHERE id = :id AND status = 'approved'", { ":id": approvalId });
  persist();
  if (changed === 0) return { ok: false, reason: "already_consumed" };

  const tokenHash = hashToken(token);
  appendAudit({ type: "approval_consumed", workspaceId: current.workspaceId, approvalId, planChecksum: current.planChecksum, tokenHash });
  return { ok: true, approval: { ...current, status: "consumed" } };
}
