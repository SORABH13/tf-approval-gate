import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

function hasBinary(bin: string): boolean {
  try {
    execFileSync(bin, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const skip = !hasBinary("terraform") || !hasBinary("checkov");

describe.skipIf(skip)("v0.1 happy path (local null/random providers, no cloud creds)", () => {
  const workspaceId = "e2e-happy";
  let stateDir: string;

  beforeAll(() => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "tf-approval-gate-e2e-"));
    process.env.APPROVAL_MODE = "cli";
    process.env.TF_APPROVAL_GATE_SECRET = "e2e-test-secret";
    process.env.TF_APPROVAL_GATE_STATE_DIR = stateDir;
    process.env.TF_APPROVAL_GATE_WORKDIR = path.join(stateDir, "workspaces");
  });

  it("runs propose -> request approval -> approve -> apply -> replay is rejected", async () => {
    const { tf_workspace_init } = await import("../../src/tools/workspaceInit.js");
    const { tf_propose_change } = await import("../../src/tools/proposeChange.js");
    const { tf_request_approval } = await import("../../src/tools/requestApproval.js");
    const { tf_check_approval_status } = await import("../../src/tools/checkApprovalStatus.js");
    const { tf_apply } = await import("../../src/tools/apply.js");
    const { resolveApproval } = await import("../../src/approval/store.js");

    await tf_workspace_init({ workspaceId, sourceDir: path.resolve("examples/local-demo") });

    const proposal: any = await tf_propose_change({ workspaceId });
    expect(proposal.recommendation).toBe("safe");
    expect(proposal.changeSummary.counts.create).toBe(2);

    const reqResult: any = await tf_request_approval({ workspaceId });
    expect(reqResult.approvalId).toBeTruthy();

    // Simulate the human approval directly (CLI mode's readline prompt is
    // exercised manually / in docs; here we drive the same store transition
    // the Slack button handler and CLI prompt both go through).
    const resolved = resolveApproval(reqResult.approvalId, "approved", "e2e-test-human");
    expect(resolved?.approvalToken).toBeTruthy();

    const status: any = await tf_check_approval_status({ approvalId: reqResult.approvalId });
    expect(status.status).toBe("approved");
    expect(status.approvalToken).toBe(resolved!.approvalToken);

    const applyResult: any = await tf_apply({
      workspaceId,
      approvalId: reqResult.approvalId,
      approvalToken: status.approvalToken,
    });
    expect(applyResult.success).toBe(true);
    expect(applyResult.resourceResults.every((r: any) => r.status === "applied")).toBe(true);

    // Replay: the same token must never work twice.
    const replay: any = await tf_apply({
      workspaceId,
      approvalId: reqResult.approvalId,
      approvalToken: status.approvalToken,
    });
    expect(replay.success).toBeUndefined();
    expect(replay.error).toBe("approval_invalid");
    expect(replay.reason).toBe("already_consumed");
  }, 120_000);

  it("refuses to apply with no approval on record", async () => {
    const { tf_apply } = await import("../../src/tools/apply.js");
    const result: any = await tf_apply({
      workspaceId,
      approvalId: "00000000-0000-0000-0000-000000000000",
      approvalToken: "fake.token",
    });
    expect(result.error).toBe("approval_invalid");
  });
});
