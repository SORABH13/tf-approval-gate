const SECRET_PATTERNS: RegExp[] = [];

// Registered lazily by security/secret.ts so the logger module doesn't need
// to import the secret directly (keeps the secret's blast radius to one file).
export function registerRedactedValue(value: string): void {
  if (!value) return;
  SECRET_PATTERNS.push(new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"));
}

function redact(msg: string): string {
  let out = msg;
  for (const re of SECRET_PATTERNS) out = out.replace(re, "[REDACTED]");
  return out;
}

function line(level: string, msg: string, meta?: Record<string, unknown>): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: redact(msg),
    ...(meta ? { meta: JSON.parse(redact(JSON.stringify(meta))) } : {}),
  };
  process.stderr.write(JSON.stringify(entry) + "\n");
}

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => line("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => line("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => line("error", msg, meta),
  debug: (msg: string, meta?: Record<string, unknown>) => {
    if (process.env.TF_APPROVAL_GATE_DEBUG) line("debug", msg, meta);
  },
};
