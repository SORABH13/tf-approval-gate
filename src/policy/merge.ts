import { config } from "../config.js";
import type { PolicyFinding, PolicyReport, Severity } from "./types.js";

const SEVERITY_ORDER: Severity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function severityIndex(s: Severity): number {
  return SEVERITY_ORDER.indexOf(s);
}

export function mergeFindings(checkovFindings: PolicyFinding[], opaFindings: PolicyFinding[]): PolicyReport {
  const findings = [...checkovFindings, ...opaFindings];
  const counts: Record<Severity, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  for (const f of findings) counts[f.severity]++;

  const threshold = severityIndex((config.policy.blockOnSeverity.toUpperCase() as Severity) || "HIGH");
  const worst = findings.reduce((max, f) => Math.max(max, severityIndex(f.severity)), -1);
  const blocking = worst >= threshold;

  return {
    findings,
    blocking,
    blockingSeverity: worst >= 0 ? SEVERITY_ORDER[worst] : "LOW",
    counts,
  };
}

export function formatPolicyReportMarkdown(report: PolicyReport): string {
  if (report.findings.length === 0) return "**Policy checks:** ✅ no findings";
  const lines = [
    `**Policy checks:** ${report.blocking ? "🛑 BLOCKING" : "⚠️ findings present, non-blocking"} ` +
      `(${report.counts.CRITICAL} critical, ${report.counts.HIGH} high, ${report.counts.MEDIUM} medium, ${report.counts.LOW} low)`,
  ];
  for (const f of report.findings.slice(0, 25)) {
    lines.push(`- [${f.severity}] (${f.source}) ${f.checkId}: ${f.title}${f.resource ? ` — ${f.resource}` : ""}`);
  }
  if (report.findings.length > 25) lines.push(`- ...and ${report.findings.length - 25} more`);
  return lines.join("\n");
}
