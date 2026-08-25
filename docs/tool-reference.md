# Tool reference

## `tf_workspace_init`
Copies a local Terraform project into a sandboxed workdir under
`TF_APPROVAL_GATE_WORKDIR`.

```json
{ "workspaceId": "my-change", "sourceDir": "examples/local-demo" }
```

## `tf_write_file`
Writes one file into an already-initialized workspace (for agents without
native filesystem access).

```json
{ "workspaceId": "my-change", "relativePath": "main.tf", "content": "..." }
```

## `tf_plan`
Runs `terraform init && plan`, returns per-resource changes and a markdown
summary. Rejects providers/modules not on the configured allowlist before
running `init`.

## `tf_policy_check`
Runs Checkov (and OPA/Conftest, if `policies/opa/` has rules) against the
plan JSON. Returns a merged `PolicyReport` with a `blocking` verdict driven
by `TF_APPROVAL_GATE_BLOCK_SEVERITY`.

## `tf_cost_estimate`
Runs `infracost breakdown`. Returns `{ skipped: true, reason }` if
`INFRACOST_API_KEY` is unset or the binary is missing.

## `tf_propose_change`
Composite of plan + policy + cost. Returns `recommendation`:
`safe` | `needs_review` | `blocked`. This is the tool most agents call
first.

## `tf_request_approval`
- Invalidates any stale pending approval for the workspace.
- Re-plans and runs a drift check; returns `{ error: "drift_detected" }` if
  cloud state has moved since the plan was taken.
- Runs policy check; returns `{ error: "policy_blocking" }` if findings are
  at/above the blocking threshold (unless
  `overridePolicy: true` **and** the server has
  `TF_APPROVAL_GATE_ALLOW_POLICY_OVERRIDE=true`).
- Posts to Slack (or prompts on the server's terminal in
  `APPROVAL_MODE=cli`). Returns `{ approvalId, mode, expiresAt }`.

## `tf_check_approval_status`
Poll with `{ approvalId }`. Returns `{ status }`, and `approvalToken` once
`status === "approved"`.

## `tf_apply`
```json
{ "workspaceId": "my-change", "approvalId": "...", "approvalToken": "..." }
```
Re-verifies, server-side: token signature, expiry, single-use status
(atomically consumed), the plan's binary checksum, and a final drift check
-- in that order, before running `terraform apply`. Returns
`resourceResults` (`applied` / `failed` / `not_reached` per resource) so a
partial failure is visible, not swallowed into a generic error.
