import { config } from "../config.js";
import { registerRedactedValue } from "../utils/logger.js";

// Single choke point for the server secret. Nothing outside approval/token.ts
// should call getServerSecret(). It is registered with the logger so any
// accidental log line containing it gets scrubbed, but the real invariant is
// enforced by never handing it to execFile env or a tool response -- see
// utils/exec.ts (env is always explicitly allow-listed, never inherited raw
// with secrets) and security/redact.ts.
registerRedactedValue(config.serverSecret);

export function getServerSecret(): string {
  return config.serverSecret;
}
