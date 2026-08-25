import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { PolicyFinding } from "../../src/policy/types.js";

const ORIGINAL_ENV = process.env.TF_APPROVAL_GATE_BLOCK_SEVERITY;

describe("mergeFindings", () => {
  beforeEach(() => {
    process.env.TF_APPROVAL_GATE_BLOCK_SEVERITY = "HIGH";
  });
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.TF_APPROVAL_GATE_BLOCK_SEVERITY;
    else process.env.TF_APPROVAL_GATE_BLOCK_SEVERITY = ORIGINAL_ENV;
  });

  it("does not block when only LOW/MEDIUM findings present", async () => {
    const { mergeFindings } = await import("../../src/policy/merge.js");
    const findings: PolicyFinding[] = [
      { source: "checkov", checkId: "C1", title: "t", severity: "LOW" },
      { source: "checkov", checkId: "C2", title: "t", severity: "MEDIUM" },
    ];
    const report = mergeFindings(findings, []);
    expect(report.blocking).toBe(false);
  });

  it("blocks when a HIGH finding is present at HIGH threshold", async () => {
    const { mergeFindings } = await import("../../src/policy/merge.js");
    const findings: PolicyFinding[] = [{ source: "opa", checkId: "O1", title: "t", severity: "HIGH" }];
    const report = mergeFindings([], findings);
    expect(report.blocking).toBe(true);
    expect(report.blockingSeverity).toBe("HIGH");
  });

  it("merges checkov and opa findings and counts correctly", async () => {
    const { mergeFindings } = await import("../../src/policy/merge.js");
    const checkov: PolicyFinding[] = [{ source: "checkov", checkId: "C1", title: "t", severity: "CRITICAL" }];
    const opa: PolicyFinding[] = [{ source: "opa", checkId: "O1", title: "t", severity: "LOW" }];
    const report = mergeFindings(checkov, opa);
    expect(report.findings).toHaveLength(2);
    expect(report.counts.CRITICAL).toBe(1);
    expect(report.counts.LOW).toBe(1);
    expect(report.blocking).toBe(true);
  });
});
