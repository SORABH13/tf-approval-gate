export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface PolicyFinding {
  source: "checkov" | "opa";
  checkId: string;
  title: string;
  severity: Severity;
  resource?: string;
  filePath?: string;
  guideline?: string;
}

export interface PolicyReport {
  findings: PolicyFinding[];
  blocking: boolean;
  blockingSeverity: Severity;
  counts: Record<Severity, number>;
}
