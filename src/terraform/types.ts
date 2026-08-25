export type ChangeAction = "no-op" | "create" | "read" | "update" | "delete" | "replace";

export interface ResourceChangeSummary {
  address: string;
  type: string;
  name: string;
  providerName: string;
  actions: ChangeAction[];
  isDestructive: boolean; // delete or replace
}

export interface ChangeSummary {
  workspaceId: string;
  planChecksum: string; // sha256 of the binary plan artifact (tfplan.binary)
  planJsonPath: string;
  planBinaryPath: string;
  resources: ResourceChangeSummary[];
  counts: { create: number; update: number; delete: number; replace: number; noop: number };
  raw: unknown; // full terraform show -json output (still passes through redact.ts before returning to LLM)
}

export interface PlanRunResult {
  changeSummary: ChangeSummary;
  stderr: string;
}
