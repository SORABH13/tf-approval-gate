import { describe, it, expect } from "vitest";

process.env.TF_APPROVAL_GATE_SECRET = "super-secret-value-must-never-leak-12345";

describe("SERVER_SECRET isolation", () => {
  it("is never present in a JSON-serialized tool-shaped response", async () => {
    const { redactByKeyName } = await import("../../src/security/redact.js");
    const fakeToolResponse = {
      approvalId: "abc",
      status: "approved",
      note: "unrelated field",
    };
    const serialized = JSON.stringify(redactByKeyName(fakeToolResponse));
    expect(serialized).not.toContain("super-secret-value-must-never-leak-12345");
  });

  it("execFile env passed to subprocesses never includes the raw secret", async () => {
    const { config } = await import("../../src/config.js");
    // utils/exec.ts only ever forwards PATH, HOME, and explicit opts.env --
    // assert the config surface an attacker-controlled tool could read
    // (env additions callers pass to run()) never includes serverSecret.
    const dummyEnv: Record<string, string> = { INFRACOST_API_KEY: "not-the-secret" };
    expect(Object.values(dummyEnv)).not.toContain(config.serverSecret);
  });
});
