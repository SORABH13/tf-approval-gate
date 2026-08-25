import { describe, it, expect, beforeAll } from "vitest";

process.env.TF_APPROVAL_GATE_SECRET = "test-secret-do-not-use-in-prod";

describe("approval token signing", () => {
  it("verifies a freshly minted token against the correct checksum", async () => {
    const { mintToken, verifyToken } = await import("../../src/approval/token.js");
    const token = mintToken("approval-1", "checksum-abc", Date.now() + 60_000);
    const result = verifyToken(token, "checksum-abc");
    expect(result.ok).toBe(true);
  });

  it("rejects a token verified against a different plan checksum", async () => {
    const { mintToken, verifyToken } = await import("../../src/approval/token.js");
    const token = mintToken("approval-1", "checksum-abc", Date.now() + 60_000);
    const result = verifyToken(token, "checksum-DIFFERENT");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_signature");
  });

  it("rejects an expired token", async () => {
    const { mintToken, verifyToken } = await import("../../src/approval/token.js");
    const token = mintToken("approval-1", "checksum-abc", Date.now() - 1000);
    const result = verifyToken(token, "checksum-abc");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });

  it("rejects a malformed token", async () => {
    const { verifyToken } = await import("../../src/approval/token.js");
    const result = verifyToken("not-a-real-token", "checksum-abc");
    expect(result.ok).toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const { mintToken, verifyToken } = await import("../../src/approval/token.js");
    const token = mintToken("approval-1", "checksum-abc", Date.now() + 60_000);
    const [header] = token.split(".");
    const tampered = `${header}.deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef`;
    const result = verifyToken(tampered, "checksum-abc");
    expect(result.ok).toBe(false);
  });
});
