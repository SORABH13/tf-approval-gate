import fs from "node:fs";
import path from "node:path";
import { run } from "../utils/exec.js";
import type { PolicyFinding } from "./types.js";

/**
 * Runs `conftest test` against the plan JSON using the shared Rego library
 * (policies/opa/common) plus a provider-specific directory
 * (policies/opa/<provider>) when one exists. Soft-skips (returns []) if
 * conftest isn't installed or no policies directory exists yet -- OPA is
 * additive on top of Checkov, not a hard requirement for v0.1.
 */
export async function runOpa(planJsonPath: string, workspaceRoot: string, providers: string[]): Promise<PolicyFinding[]> {
  const commonDir = path.resolve(process.cwd(), "policies", "opa", "common");
  const policyDirs = [commonDir, ...providerDirs(providers)].filter((d) => fs.existsSync(d));
  if (policyDirs.length === 0) return [];

  const args = ["test", planJsonPath, "--output", "json", ...policyDirs.flatMap((d) => ["--policy", d])];

  let res;
  try {
    res = await run("conftest", args, { cwd: workspaceRoot, timeoutMs: 2 * 60 * 1000 });
  } catch {
    // conftest binary missing -- treat as skipped, not a hard failure.
    return [];
  }

  if (!res.stdout.trim()) return [];

  let parsed: any[];
  try {
    parsed = JSON.parse(res.stdout);
  } catch {
    throw new Error(`conftest produced non-JSON output:\n${res.stdout.slice(0, 1000)}`);
  }

  const findings: PolicyFinding[] = [];
  for (const fileResult of parsed) {
    for (const failure of fileResult.failures ?? []) {
      findings.push({
        source: "opa",
        checkId: failure.metadata?.rule ?? "opa.deny",
        title: failure.msg,
        severity: normalizeSeverity(failure.metadata?.severity),
        resource: failure.metadata?.resource,
      });
    }
    for (const warning of fileResult.warnings ?? []) {
      findings.push({
        source: "opa",
        checkId: warning.metadata?.rule ?? "opa.warn",
        title: warning.msg,
        severity: "LOW",
        resource: warning.metadata?.resource,
      });
    }
  }
  return findings;
}

function providerDirs(providers: string[]): string[] {
  const known = new Set(["aws", "azure", "gcp"]);
  const matched = new Set<string>();
  for (const p of providers) {
    for (const k of known) {
      if (p.toLowerCase().includes(k)) matched.add(k);
    }
  }
  return [...matched].map((k) => path.resolve(process.cwd(), "policies", "opa", k));
}

function normalizeSeverity(sev: string | undefined): PolicyFinding["severity"] {
  const s = (sev ?? "HIGH").toUpperCase();
  if (s === "CRITICAL" || s === "HIGH" || s === "MEDIUM" || s === "LOW") return s;
  return "HIGH";
}
