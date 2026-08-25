import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { getServerSecret } from "../security/secret.js";

export interface TokenPayload {
  approvalId: string;
  planChecksum: string;
  expiresAt: number;
}

function hmac(approvalId: string, planChecksum: string, expiresAt: number): Buffer {
  return createHmac("sha256", getServerSecret()).update(`${approvalId}.${planChecksum}.${expiresAt}`).digest();
}

/** Mints a signed, single-use-by-convention token bound to one plan checksum. */
export function mintToken(approvalId: string, planChecksum: string, expiresAt: number): string {
  const header = Buffer.from(`${approvalId}.${expiresAt}`, "utf8").toString("base64url");
  const sig = hmac(approvalId, planChecksum, expiresAt).toString("base64url");
  return `${header}.${sig}`;
}

export type TokenVerifyResult =
  | { ok: true; payload: TokenPayload }
  | { ok: false; reason: "malformed" | "expired" | "bad_signature" };

/**
 * Verifies a token's signature and expiry against the planChecksum the
 * caller claims it's for. This function is the only place a token is ever
 * trusted -- callers must separately check single-use status in the
 * approval store (see approval/store.ts consumeToken).
 */
export function verifyToken(token: string, expectedPlanChecksum: string): TokenVerifyResult {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [headerB64, sigB64] = parts;

  let header: string;
  try {
    header = Buffer.from(headerB64, "base64url").toString("utf8");
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const dotIdx = header.lastIndexOf(".");
  if (dotIdx === -1) return { ok: false, reason: "malformed" };
  const approvalId = header.slice(0, dotIdx);
  const expiresAt = Number(header.slice(dotIdx + 1));
  if (!approvalId || !Number.isFinite(expiresAt)) return { ok: false, reason: "malformed" };

  const expectedSig = hmac(approvalId, expectedPlanChecksum, expiresAt);
  let actualSig: Buffer;
  try {
    actualSig = Buffer.from(sigB64, "base64url");
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (actualSig.length !== expectedSig.length || !timingSafeEqual(actualSig, expectedSig)) {
    return { ok: false, reason: "bad_signature" };
  }
  if (Date.now() > expiresAt) return { ok: false, reason: "expired" };

  return { ok: true, payload: { approvalId, planChecksum: expectedPlanChecksum, expiresAt } };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
