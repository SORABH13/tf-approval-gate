import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "tf-approval-gate-test-"));
process.env.TF_APPROVAL_GATE_STATE_DIR = stateDir;
process.env.TF_APPROVAL_GATE_SECRET = "test-secret-do-not-use-in-prod";

describe("approval store replay protection", () => {
  it("a token can only be consumed once (replay is rejected)", async () => {
    const { createApproval, resolveApproval, consumeToken } = await import("../../src/approval/store.js");
    const approval = createApproval("ws1", "checksum-1", "some plan");
    const resolved = resolveApproval(approval.id, "approved", "U123");
    expect(resolved?.approvalToken).toBeTruthy();

    const first = consumeToken(approval.id, resolved!.approvalToken!, "checksum-1");
    expect(first.ok).toBe(true);

    const second = consumeToken(approval.id, resolved!.approvalToken!, "checksum-1");
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("already_consumed");
  });

  it("rejects consumption if the current plan checksum no longer matches", async () => {
    const { createApproval, resolveApproval, consumeToken } = await import("../../src/approval/store.js");
    const approval = createApproval("ws2", "checksum-orig", "some plan");
    const resolved = resolveApproval(approval.id, "approved", "U123");

    const result = consumeToken(approval.id, resolved!.approvalToken!, "checksum-CHANGED");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("checksum_mismatch");
  });

  it("rejects consumption for a pending (not yet approved) request", async () => {
    const { createApproval, consumeToken } = await import("../../src/approval/store.js");
    const approval = createApproval("ws3", "checksum-1", "some plan");
    const result = consumeToken(approval.id, "fake.token", "checksum-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_approved");
  });
});
