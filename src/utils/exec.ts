import { execFile } from "node:child_process";
import { config } from "../config.js";
import { logger } from "./logger.js";

const ALLOWED_BINARIES = new Set(["terraform", "checkov", "conftest", "infracost"]);

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface ExecOptions {
  cwd: string;
  timeoutMs?: number;
  maxBuffer?: number;
  /** Explicit allow-listed env additions. Never pass secrets here. */
  env?: Record<string, string>;
}

/**
 * Runs an allow-listed binary via execFile (never a shell string). Bounds
 * timeout and output buffer to prevent a malicious/oversized plan from
 * hanging or OOM-ing the server. Never forwards the process's full env --
 * callers must opt subprocesses into only the variables they need, which
 * keeps TF_APPROVAL_GATE_SECRET (held in-process, see security/secret.ts)
 * structurally unreachable from terraform/checkov/conftest/infracost.
 */
export function run(binary: string, args: string[], opts: ExecOptions): Promise<ExecResult> {
  if (!ALLOWED_BINARIES.has(binary)) {
    return Promise.reject(new Error(`Binary not allow-listed: ${binary}`));
  }
  const timeoutMs = opts.timeoutMs ?? config.execTimeoutMs;
  const maxBuffer = opts.maxBuffer ?? config.execMaxBufferBytes;

  const safeEnv: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    ...(opts.env ?? {}),
  };

  logger.debug("exec", { binary, args, cwd: opts.cwd });

  return new Promise((resolve, reject) => {
    execFile(
      binary,
      args,
      { cwd: opts.cwd, timeout: timeoutMs, maxBuffer, env: safeEnv, shell: false },
      (error, stdout, stderr) => {
        if (error && (error as any).killed) {
          reject(new Error(`${binary} timed out after ${timeoutMs}ms`));
          return;
        }
        const code = (error as any)?.code ?? 0;
        resolve({ stdout: stdout?.toString() ?? "", stderr: stderr?.toString() ?? "", code: typeof code === "number" ? code : 1 });
      },
    );
  });
}
