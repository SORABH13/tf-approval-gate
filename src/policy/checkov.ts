import fs from "node:fs";
import path from "node:path";
import { run } from "../utils/exec.js";
import type { PolicyFinding } from "./types.js";

/**
 * Runs Checkov against the plan JSON (--framework terraform_plan) plus any
 * custom checks under policies/checkov/custom. Checkov exits non-zero when
 * it finds failed checks, so we treat exit code as informational, not an
 * error -- the actual verdict comes from parsing --output json.
 */
export async function runCheckov(planJsonPath: string, workspaceRoot: string): Promise<PolicyFinding[]> {
  const customDir = path.resolve(process.cwd(), "policies", "checkov", "custom");
  const args = [
    "--framework",
    "terraform_plan",
    "--file",
    planJsonPath,
    "--output",
    "json",
    "--compact",
    "--quiet",
  ];
  if (fs.existsSync(customDir)) {
    args.push("--external-checks-dir", customDir);
  }

  const res = await run("checkov", args, { cwd: workspaceRoot, timeoutMs: 3 * 60 * 1000 });

  if (!res.stdout.trim()) {
    if (res.code !== 0) throw new Error(`checkov failed to run:\n${res.stderr}`);
    return [];
  }

  let parsed: any;
  try {
    parsed = JSON.parse(res.stdout);
  } catch {
    throw new Error(`checkov produced non-JSON output:\n${res.stdout.slice(0, 1000)}`);
  }

  const reports = Array.isArray(parsed) ? parsed : [parsed];
  const findings: PolicyFinding[] = [];
  for (const report of reports) {
    const failed = report?.results?.failed_checks ?? [];
    for (const f of failed) {
      findings.push({
        source: "checkov",
        checkId: f.check_id,
        title: f.check_name,
        severity: normalizeSeverity(f.severity),
        resource: f.resource,
        filePath: f.file_path,
        guideline: f.guideline,
      });
    }
  }
  return findings;
}

function normalizeSeverity(sev: string | null | undefined): PolicyFinding["severity"] {
  const s = (sev ?? "MEDIUM").toUpperCase();
  if (s === "CRITICAL" || s === "HIGH" || s === "MEDIUM" || s === "LOW") return s;
  return "MEDIUM";
}
