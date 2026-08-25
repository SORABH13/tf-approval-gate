import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

export interface AuditEvent {
  ts: string;
  type: string;
  workspaceId?: string;
  approvalId?: string;
  planChecksum?: string;
  tokenHash?: string;
  actor?: string;
  detail?: Record<string, unknown>;
}

const auditPath = path.join(config.stateDir, "audit.log");

export function appendAudit(event: Omit<AuditEvent, "ts">): void {
  fs.mkdirSync(config.stateDir, { recursive: true });
  const full: AuditEvent = { ts: new Date().toISOString(), ...event };
  fs.appendFileSync(auditPath, JSON.stringify(full) + "\n", "utf8");
}

export function readAudit(): AuditEvent[] {
  if (!fs.existsSync(auditPath)) return [];
  return fs
    .readFileSync(auditPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}
