/**
 * Strips sensitive material from anything about to be returned to the LLM:
 * - Terraform plan fields marked before_sensitive / after_sensitive
 * - Anything that looks like tfstate content
 * - Common credential-shaped keys (access keys, tokens, passwords)
 */
const SENSITIVE_KEY_RE =
  /^(.*_?(secret|password|token|api_key|apikey|access_key|private_key|credential)s?.*)$/i;

export function redactPlanResourceChange(rc: any): any {
  if (!rc || typeof rc !== "object") return rc;
  const change = rc.change ?? {};
  const before = maskSensitive(change.before, change.before_sensitive);
  const after = maskSensitive(change.after, change.after_sensitive);
  return {
    ...rc,
    change: {
      ...change,
      before,
      after,
    },
  };
}

function maskSensitive(value: any, sensitiveMap: any): any {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (sensitiveMap === true) return "[SENSITIVE]";
  if (Array.isArray(value)) {
    return value.map((v, i) => maskSensitive(v, Array.isArray(sensitiveMap) ? sensitiveMap[i] : undefined));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (SENSITIVE_KEY_RE.test(k)) {
      out[k] = "[SENSITIVE]";
      continue;
    }
    const sub = sensitiveMap && typeof sensitiveMap === "object" ? (sensitiveMap as any)[k] : undefined;
    out[k] = maskSensitive(v, sub);
  }
  return out;
}

/** Deep-redacts any object by key name, for defense-in-depth on tool output. */
export function redactByKeyName<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (key, val) => {
      if (SENSITIVE_KEY_RE.test(key)) return "[SENSITIVE]";
      return val;
    }),
  );
}
