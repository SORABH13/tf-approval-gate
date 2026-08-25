import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { run as execRun } from "../utils/exec.js";
import { logger } from "../utils/logger.js";
import { enforceAllowlists } from "./allowlist.js";
import { parsePlanJson } from "./planParser.js";
import type { ChangeSummary, PlanRunResult } from "./types.js";

export class StateLockError extends Error {
  constructor(detail: string) {
    super(
      `Another Terraform operation is already holding the state lock for this workspace: ${detail}. ` +
        `Wait for it to finish and retry -- do not force-unlock unless you are certain no other process is running.`,
    );
    this.name = "StateLockError";
  }
}

// Per-workspaceId mutex: serializes plan/apply so two agent calls can't race
// the same state file.
const workspaceLocks = new Map<string, Promise<unknown>>();
function withWorkspaceLock<T>(workspaceId: string, fn: () => Promise<T>): Promise<T> {
  const prior = workspaceLocks.get(workspaceId) ?? Promise.resolve();
  const next = prior.then(fn, fn);
  workspaceLocks.set(
    workspaceId,
    next.catch(() => undefined),
  );
  return next;
}

function sha256File(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function detectLockError(stderr: string): boolean {
  return /Error acquiring the state lock|Lock Info|ConditionalCheckFailedException/i.test(stderr);
}

async function terraformInit(workspaceRoot: string): Promise<void> {
  const res = await execRun("terraform", ["init", "-input=false", "-no-color"], { cwd: workspaceRoot });
  if (res.code !== 0) {
    if (detectLockError(res.stderr)) throw new StateLockError(res.stderr.slice(0, 500));
    throw new Error(`terraform init failed:\n${res.stderr || res.stdout}`);
  }
}

export async function plan(workspaceId: string, workspaceRoot: string): Promise<PlanRunResult> {
  return withWorkspaceLock(workspaceId, async () => {
    enforceAllowlists(workspaceRoot);
    await terraformInit(workspaceRoot);

    const binaryPath = path.join(workspaceRoot, "tfplan.binary");
    const jsonPath = path.join(workspaceRoot, "tfplan.json");

    const planRes = await execRun("terraform", ["plan", "-input=false", "-no-color", `-out=${binaryPath}`], {
      cwd: workspaceRoot,
    });
    if (planRes.code !== 0) {
      if (detectLockError(planRes.stderr)) throw new StateLockError(planRes.stderr.slice(0, 500));
      throw new Error(`terraform plan failed:\n${planRes.stderr || planRes.stdout}`);
    }

    const showRes = await execRun("terraform", ["show", "-json", binaryPath], { cwd: workspaceRoot });
    if (showRes.code !== 0) throw new Error(`terraform show -json failed:\n${showRes.stderr}`);
    fs.writeFileSync(jsonPath, showRes.stdout, "utf8");

    const planJson = JSON.parse(showRes.stdout);
    const planChecksum = sha256File(binaryPath);

    const changeSummary: ChangeSummary = parsePlanJson(planJson, {
      workspaceId,
      planChecksum,
      planJsonPath: jsonPath,
      planBinaryPath: binaryPath,
    });

    logger.info("terraform plan complete", { workspaceId, planChecksum, counts: changeSummary.counts });
    return { changeSummary, stderr: planRes.stderr };
  });
}

// Debounces refresh-only checks per workspace so an agent retry-looping
// tf_request_approval doesn't hammer the cloud provider's API.
const lastRefreshAt = new Map<string, number>();

export interface DriftResult {
  hasDrift: boolean;
  detail?: string;
}

export async function checkDrift(workspaceId: string, workspaceRoot: string, debounceMs: number): Promise<DriftResult> {
  const last = lastRefreshAt.get(workspaceId) ?? 0;
  if (Date.now() - last < debounceMs) {
    return { hasDrift: false, detail: "skipped (debounced)" };
  }
  return withWorkspaceLock(workspaceId, async () => {
    const res = await execRun(
      "terraform",
      ["plan", "-input=false", "-no-color", "-refresh-only", "-detailed-exitcode"],
      { cwd: workspaceRoot },
    );
    lastRefreshAt.set(workspaceId, Date.now());
    // detailed-exitcode: 0 = no changes, 1 = error, 2 = changes present (drift)
    if (res.code === 1) {
      if (detectLockError(res.stderr)) throw new StateLockError(res.stderr.slice(0, 500));
      throw new Error(`drift check failed:\n${res.stderr || res.stdout}`);
    }
    return { hasDrift: res.code === 2, detail: res.code === 2 ? res.stdout.slice(0, 4000) : undefined };
  });
}

export interface ApplyStreamResult {
  code: number;
  stdout: string;
  stderr: string;
  resourceResults: Array<{ address: string; status: "applied" | "failed" | "not_reached" }>;
}

export async function apply(workspaceId: string, workspaceRoot: string, summary: ChangeSummary): Promise<ApplyStreamResult> {
  return withWorkspaceLock(workspaceId, async () => {
    const res = await execRun("terraform", ["apply", "-input=false", "-no-color", "-auto-approve", summary.planBinaryPath], {
      cwd: workspaceRoot,
      timeoutMs: 30 * 60 * 1000,
    });
    if (res.code !== 0 && detectLockError(res.stderr)) throw new StateLockError(res.stderr.slice(0, 500));

    const resourceResults = classifyApplyOutput(res.stdout, summary);
    return { code: res.code, stdout: res.stdout, stderr: res.stderr, resourceResults };
  });
}

/**
 * terraform apply's plain-text stream marks each resource with
 * "Creating...", "Modifying...", "Destroying...", then "...Complete" or an
 * error block. We match on address lines to build a real partial-apply
 * report instead of collapsing a mid-run failure into one generic error.
 */
function classifyApplyOutput(
  stdout: string,
  summary: ChangeSummary,
): Array<{ address: string; status: "applied" | "failed" | "not_reached" }> {
  const results: Array<{ address: string; status: "applied" | "failed" | "not_reached" }> = [];
  for (const r of summary.resources) {
    if (r.actions.includes("no-op") && r.actions.length === 1) continue;
    const addr = escapeRegExp(r.address);
    const completeRe = new RegExp(`${addr}: (Creation|Modifications|Destruction) complete`, "i");
    const failRe = new RegExp(`Error:.*\\n[\\s\\S]{0,300}?${addr}`, "i");
    const startedRe = new RegExp(`${addr}: (Creating|Modifying|Destroying)`, "i");
    if (completeRe.test(stdout)) results.push({ address: r.address, status: "applied" });
    else if (failRe.test(stdout) || (startedRe.test(stdout) && !completeRe.test(stdout))) {
      results.push({ address: r.address, status: "failed" });
    } else {
      results.push({ address: r.address, status: "not_reached" });
    }
  }
  return results;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
