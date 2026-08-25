# Security model

## What this protects against

- **An AI agent running `terraform apply` unattended.** No MCP tool call, or
  combination of calls, can reach `terraform apply` without a token that
  only a real human's approval (Slack click or CLI y/n) can mint. The
  server never trusts the agent's own claim that "the human approved."
- **Token replay.** Approval tokens are HMAC-signed, bound to one plan's
  binary checksum, expire, and are atomically flipped
  `approved -> consumed` on first use in `tf_apply` -- a leaked token
  cannot be reused.
- **Approving a plan that has since changed.** `tf_apply` reverifies the
  checksum of the exact `tfplan.binary` file on disk, not just its JSON
  representation, and a re-plan invalidates any prior pending Slack
  approval message.
- **Approving a plan that no longer matches real cloud state.**
  `tf_request_approval` and `tf_apply` both run a `-refresh-only` drift
  check; detected drift blocks the request/apply with a structured error.
- **An unreviewed provider or module.** `TF_APPROVAL_GATE_ALLOWED_PROVIDERS`
  / `TF_APPROVAL_GATE_ALLOWED_MODULE_SOURCES` (opt-in) reject anything not
  allow-listed before `terraform init` runs.
- **Secrets leaking back to the LLM.** `security/redact.ts` strips
  `before_sensitive`/`after_sensitive` plan fields and anything shaped like
  a credential from every tool response.
- **The server's own signing key leaking.** `TF_APPROVAL_GATE_SECRET` lives
  only in the config module's memory; it is never written into a workspace
  directory, never returned in a tool response, and never forwarded to a
  subprocess's environment (`utils/exec.ts` only ever forwards `PATH`,
  `HOME`, and explicitly-opted-in variables).
- **Resource exhaustion from an oversized/malicious plan.** All subprocess
  calls run via `execFile` (never a shell string) with bounded timeouts and
  output buffers.

## What this does NOT protect against (explicit non-goals)

- **A compromised Slack workspace or account.** If an attacker controls an
  allow-listed approver's Slack account, they can approve anything. Keep
  `SLACK_APPROVER_USER_IDS` tight and use Slack's own account security
  (SSO, 2FA).
- **A compromised approver's machine.** Same as above -- the guarantee is
  "a real human with access to that Slack account clicked the button," not
  "the intended human personally reviewed the diff."
- **A malicious or buggy OPA/Checkov policy file.** Policy checks run with
  the server process's own privileges (they're just subprocesses). A
  malicious `.rego` or custom Checkov check is not sandboxed beyond the
  general subprocess timeout/output limits.
- **A compromised `terraform` binary or provider plugin.** The server
  trusts whatever `terraform` and its providers do on the machine it runs
  on. Pin provider versions and use `terraform.lock.hcl` / a private
  registry mirror if this is a concern for your threat model.
- **A malicious MCP client that never calls `tf_apply` through this
  server.** This project only constrains what happens through its own
  tools; it can't stop an agent with independent shell access from running
  `terraform apply` directly, outside the MCP session.

## Reporting a vulnerability

See [SECURITY.md](../SECURITY.md).
